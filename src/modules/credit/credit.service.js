const mongoose = require("mongoose");
const Credit = require("./credit.model");
const CreditAudit = require("./credit.audit.model");
const User = require("../users/user.model");
const billingService = require("../billing/billing.service");
const { generateCreditCode, hashIdempotencyKey } = require("./credit.util");
const { VALID_VALUES } = require("./credit.validation");

class CreditServiceError extends Error {
  constructor(message, status = 400, code = "CREDIT_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class CreditService {
  calculateExpiration(months = 6) {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date;
  }

  async logAudit({
    action,
    actorId = null,
    actorRole = null,
    creditId = null,
    ip = null,
    userAgent = null,
    metadata = null
  }) {
    try {
      await CreditAudit.create({
        action,
        actor: actorId,
        actorRole,
        credit: creditId,
        ip,
        userAgent,
        metadata
      });
    } catch (_err) {
      // Avoid blocking business flow if audit insertion fails.
    }
  }

  async expireCreditsIfNeeded(actorContext = {}) {
    const now = new Date();
    const expiredCredits = await Credit.find({
      status: "active",
      expiresAt: { $lt: now }
    }).select("_id");

    if (!expiredCredits.length) return 0;

    const updates = expiredCredits.map((credit) => ({
      updateOne: {
        filter: { _id: credit._id, status: "active" },
        update: {
          $set: { status: "expired" },
          $push: {
            history: {
              action: "expired",
              by: null,
              at: now,
              metadata: { reason: "auto-expire" }
            }
          }
        }
      }
    }));

    const result = await Credit.bulkWrite(updates, { ordered: false });
    const modified = result.modifiedCount || 0;

    if (modified > 0) {
      await this.logAudit({
        action: "EXPIRE",
        actorId: actorContext.actorId || null,
        actorRole: actorContext.actorRole || null,
        ip: actorContext.ip || null,
        userAgent: actorContext.userAgent || null,
        metadata: { count: modified }
      });
    }

    return modified;
  }

  async generateCredits({ adminId, value, quantity, ip, userAgent, actorRole }) {
    const parsedValue = Number(value);
    const parsedQuantity = Number(quantity);

    if (!VALID_VALUES.includes(parsedValue)) {
      throw new CreditServiceError("Invalid credit value", 400, "INVALID_VALUE");
    }

    const credits = [];

    for (let i = 0; i < parsedQuantity; i += 1) {
      let code;
      let exists = true;

      while (exists) {
        code = generateCreditCode();
        exists = await Credit.exists({ code });
      }

      const now = new Date();
      credits.push({
        code,
        value: parsedValue,
        createdBy: adminId,
        expiresAt: this.calculateExpiration(),
        history: [
          {
            action: "generated",
            by: adminId,
            at: now,
            metadata: { value: parsedValue }
          }
        ]
      });
    }

    const inserted = await Credit.insertMany(credits);

    await this.logAudit({
      action: "GENERATE",
      actorId: adminId,
      actorRole,
      ip,
      userAgent,
      metadata: { value: parsedValue, quantity: parsedQuantity, created: inserted.length }
    });

    return inserted;
  }

  async markAsPrinted({ id, adminId, actorRole, ip, userAgent }) {
    const credit = await Credit.findById(id);

    if (!credit) {
      throw new CreditServiceError("Credit not found", 404, "NOT_FOUND");
    }
    if (credit.isPrinted) {
      throw new CreditServiceError("Credit already printed", 409, "ALREADY_PRINTED");
    }

    credit.isPrinted = true;
    credit.printedAt = new Date();
    credit.history.push({
      action: "printed",
      by: adminId,
      at: new Date(),
      metadata: null
    });

    const saved = await credit.save();

    await this.logAudit({
      action: "PRINT",
      actorId: adminId,
      actorRole,
      creditId: saved._id,
      ip,
      userAgent
    });

    return saved;
  }

  async useCredit({ code, userId, idempotencyKey, actorRole, ip, userAgent }) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const keyHash = hashIdempotencyKey(userId, idempotencyKey);

    const immediateReplay = await Credit.findOne({
      idempotencyKeyHash: keyHash,
      usedBy: userId
    });

    if (immediateReplay) {
      const replayUser = await User.findById(userId).select("credit");
      return { credit: immediateReplay, newBalance: replayUser?.credit || 0, replayed: true };
    }

    const session = await mongoose.startSession();
    let responsePayload;

    try {
      await session.withTransaction(async () => {
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new CreditServiceError("User not found", 404, "USER_NOT_FOUND");
        }

        const replay = await Credit.findOne({
          idempotencyKeyHash: keyHash,
          usedBy: userId
        }).session(session);

        if (replay) {
          responsePayload = { credit: replay, newBalance: user.credit || 0, replayed: true };
          return;
        }

        const credit = await Credit.findOne({ code: normalizedCode }).session(session);

        if (!credit) {
          throw new CreditServiceError("Credit not found", 404, "NOT_FOUND");
        }
        if (credit.status !== "active") {
          throw new CreditServiceError("Credit not active", 409, "NOT_ACTIVE");
        }
        if (credit.expiresAt < new Date()) {
          credit.status = "expired";
          credit.history.push({
            action: "expired",
            by: null,
            at: new Date(),
            metadata: { reason: "expired-at-use" }
          });
          await credit.save({ session });
          throw new CreditServiceError("Credit expired", 409, "EXPIRED");
        }

        credit.status = "used";
        credit.usedBy = userId;
        credit.usedAt = new Date();
        credit.idempotencyKeyHash = keyHash;
        credit.history.push({
          action: "used",
          by: userId,
          at: new Date(),
          metadata: { value: credit.value }
        });

        await credit.save({ session });

        user.credit = (user.credit || 0) + credit.value;
        await user.save({ session });

        await billingService.autoSettleOwnerOutstanding({
          ownerUserId: user._id,
          session,
          trigger: "CREDIT_RECHARGE"
        });

        const refreshedUser = await User.findById(userId).select("credit").session(session);

        responsePayload = { credit, newBalance: refreshedUser?.credit || 0, replayed: false };
      });
    } catch (error) {
      if (error?.code === 11000) {
        const replayed = await Credit.findOne({
          idempotencyKeyHash: keyHash,
          usedBy: userId
        });

        if (replayed) {
          const replayUser = await User.findById(userId).select("credit");
          responsePayload = {
            credit: replayed,
            newBalance: replayUser?.credit || 0,
            replayed: true
          };
        } else {
          throw new CreditServiceError(
            "Idempotency key conflict",
            409,
            "IDEMPOTENCY_CONFLICT"
          );
        }
      } else {
        throw error;
      }
    } finally {
      await session.endSession();
    }

    await this.logAudit({
      action: "USE",
      actorId: userId,
      actorRole,
      creditId: responsePayload.credit?._id || null,
      ip,
      userAgent,
      metadata: { code: normalizedCode, replayed: !!responsePayload.replayed }
    });

    return responsePayload;
  }

  buildFilters(query = {}) {
    const filters = {};

    if (query.status) {
      filters.status = query.status;
    }
    if (query.value) {
      filters.value = Number(query.value);
    }
    if (query.createdBy) {
      filters.createdBy = query.createdBy;
    }
    if (query.usedBy) {
      filters.usedBy = query.usedBy;
    }
    if (query.code) {
      filters.code = { $regex: query.code, $options: "i" };
    }

    if (query.dateFrom || query.dateTo) {
      filters.createdAt = {};
      if (query.dateFrom) filters.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) filters.createdAt.$lte = new Date(query.dateTo);
    }

    return filters;
  }

  async getAll({ query = {}, actorId = null, actorRole = null, ip = null, userAgent = null }) {
    await this.expireCreditsIfNeeded({ actorId, actorRole, ip, userAgent });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy || "createdAt";
    const sortOrder = query.sortOrder === "asc" ? 1 : -1;
    const filters = this.buildFilters(query);

    const [data, total] = await Promise.all([
      Credit.find(filters)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate("usedBy", "pseudo firstName lastName email role")
        .populate("createdBy", "pseudo firstName lastName email role"),
      Credit.countDocuments(filters)
    ]);

    await this.logAudit({
      action: "LIST",
      actorId,
      actorRole,
      ip,
      userAgent,
      metadata: { filters, page, limit, total }
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getStats({ query = {}, actorId = null, actorRole = null, ip = null, userAgent = null }) {
    await this.expireCreditsIfNeeded({ actorId, actorRole, ip, userAgent });
    const filters = this.buildFilters(query);

    const [stats] = await Credit.aggregate([
      { $match: filters },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalCredits: { $sum: 1 },
                totalValue: { $sum: "$value" },
                activeCredits: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                usedCredits: { $sum: { $cond: [{ $eq: ["$status", "used"] }, 1, 0] } },
                expiredCredits: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
                printedCredits: { $sum: { $cond: [{ $eq: ["$isPrinted", true] }, 1, 0] } }
              }
            }
          ],
          byStatus: [
            { $group: { _id: "$status", count: { $sum: 1 }, totalValue: { $sum: "$value" } } },
            { $sort: { _id: 1 } }
          ],
          byValue: [
            { $group: { _id: "$value", count: { $sum: 1 }, totalValue: { $sum: "$value" } } },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]);

    const totals = stats?.totals?.[0] || {
      totalCredits: 0,
      totalValue: 0,
      activeCredits: 0,
      usedCredits: 0,
      expiredCredits: 0,
      printedCredits: 0
    };

    await this.logAudit({
      action: "STATS",
      actorId,
      actorRole,
      ip,
      userAgent,
      metadata: { filters }
    });

    return {
      totals,
      breakdown: {
        byStatus: stats?.byStatus || [],
        byValue: stats?.byValue || []
      }
    };
  }
}

module.exports = new CreditService();
module.exports.CreditServiceError = CreditServiceError;
