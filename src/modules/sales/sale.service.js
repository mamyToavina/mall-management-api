const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Sale = require("./sale.model");
const User = require("../users/user.model");
const Product = require("../products/product.model");
const Boutique = require("../boutique/boutique.model");

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const computeCurrentSellingPrice = (product) => {
  if (product.promotion && product.promotion.enabled) {
    const startsAt = product.promotion.startsAt ? new Date(product.promotion.startsAt) : null;
    const endsAt = product.promotion.endsAt ? new Date(product.promotion.endsAt) : null;
    const now = new Date();

    if (
      startsAt &&
      endsAt &&
      now >= startsAt &&
      now <= endsAt &&
      typeof product.promotion.percentage === "number"
    ) {
      const discounted = product.price - (product.price * product.promotion.percentage) / 100;
      return roundMoney(Math.max(0, discounted));
    }
  }

  if (typeof product.salePrice === "number") return roundMoney(product.salePrice);
  return roundMoney(product.price);
};

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

class SaleServiceError extends Error {
  constructor(message, status = 400, code = "SALE_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class SaleService {
  buildReference() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `SAL-${yyyy}${mm}${dd}-${random}`;
  }

  hashIdempotencyKey(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    return crypto
      .createHash("sha256")
      .update(`${String(userId)}::${String(idempotencyKey).trim()}`)
      .digest("hex");
  }

  normalizeItems(rawItems = []) {
    const grouped = new Map();
    for (const row of rawItems) {
      const productId = String(row.productId || "").trim();
      const quantity = Number(row.quantity);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
      grouped.set(productId, (grouped.get(productId) || 0) + Math.trunc(quantity));
    }
    return [...grouped.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  normalizeDeliveryCapacityPolicy(value) {
    const policy = String(value || "").trim().toUpperCase();
    if (policy === "AUTO_NEXT_AVAILABLE" || policy === "CANCEL_IF_FULL") return policy;
    throw new SaleServiceError(
      "deliveryCapacityPolicy invalide",
      400,
      "INVALID_DELIVERY_CAPACITY_POLICY"
    );
  }

  normalizeWorkingDays(boutique) {
    const days = boutique?.deliverySettings?.workingDays;
    if (!Array.isArray(days) || !days.length) return [1, 2, 3, 4, 5];
    return [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  }

  getDailyCapacity(boutique) {
    const cap = Number(boutique?.deliverySettings?.dailyOrderCapacity);
    if (!Number.isFinite(cap) || cap < 1) return 30;
    return Math.trunc(cap);
  }

  getPreparationDays(boutique) {
    const days = Number(boutique?.deliverySettings?.preparationDays);
    if (!Number.isFinite(days) || days < 0) return 0;
    return Math.trunc(days);
  }

  async countBoutiqueOrdersForDay({ boutiqueId, dayDate, session, excludeSaleId = null }) {
    const dayStart = startOfDay(dayDate);
    const nextDay = addDays(dayStart, 1);

    const query = {
      status: { $ne: "CANCELLED" },
      boutiqueBreakdown: {
        $elemMatch: {
          boutique: boutiqueId,
          deliveryDate: { $gte: dayStart, $lt: nextDay },
          fulfillmentStatus: { $ne: "REJECTED" }
        }
      }
    };

    if (excludeSaleId) {
      query._id = { $ne: excludeSaleId };
    }

    return Sale.countDocuments(query).session(session);
  }

  async findAvailableDeliveryDate({ boutique, session, deliveryCapacityPolicy }) {
    const workingDays = this.normalizeWorkingDays(boutique);
    const capacity = this.getDailyCapacity(boutique);
    const preparationDays = this.getPreparationDays(boutique);

    let candidate = startOfDay(addDays(new Date(), preparationDays));
    const horizonDays = 60;
    let firstEligibleChecked = false;

    for (let i = 0; i < horizonDays; i += 1) {
      if (workingDays.includes(candidate.getDay())) {
        const booked = await this.countBoutiqueOrdersForDay({
          boutiqueId: boutique._id,
          dayDate: candidate,
          session
        });

        if (booked < capacity) return candidate;

        if (!firstEligibleChecked) {
          firstEligibleChecked = true;
          if (deliveryCapacityPolicy === "CANCEL_IF_FULL") {
            throw new SaleServiceError(
              `Jour de livraison initial indisponible pour la boutique: ${boutique.name}`,
              409,
              "DELIVERY_DAY_FULL"
            );
          }
        }
      }
      candidate = addDays(candidate, 1);
    }

    throw new SaleServiceError(
      `Capacite de livraison saturée pour la boutique: ${boutique.name}`,
      409,
      "DELIVERY_CAPACITY_EXCEEDED"
    );
  }

  mapOverallStatus(boutiqueBreakdown) {
    const statuses = boutiqueBreakdown.map((entry) => entry.fulfillmentStatus);
    if (statuses.every((status) => status === "DELIVERED")) return "DELIVERED";
    if (statuses.every((status) => status === "REJECTED")) return "CANCELLED";
    if (statuses.some((status) => status !== "SCHEDULED")) return "PROCESSING";
    return "PLACED";
  }

  async resolveBoutiqueForActor({ userId, role, boutiqueId = null }) {
    if (role === "ADMIN" && boutiqueId) {
      const boutique = await Boutique.findById(boutiqueId);
      if (!boutique) throw new SaleServiceError("Boutique introuvable", 404, "BOUTIQUE_NOT_FOUND");
      return boutique;
    }

    const user = await User.findById(userId).select("boutique role");
    if (!user) throw new SaleServiceError("Utilisateur introuvable", 404, "USER_NOT_FOUND");

    let boutique = null;
    if (user.boutique) {
      boutique = await Boutique.findById(user.boutique);
    }
    if (!boutique) {
      boutique = await Boutique.findOne({ owner: user._id });
    }
    if (!boutique) {
      throw new SaleServiceError("Aucune boutique liee a ce compte", 404, "BOUTIQUE_NOT_FOUND");
    }
    return boutique;
  }

  toBoutiqueOrderView(sale, boutiqueId) {
    const boutiqueKey = String(boutiqueId);
    const boutiqueOrder = sale.boutiqueBreakdown.find(
      (entry) => String(entry.boutique) === boutiqueKey
    );
    const items = sale.items.filter((item) => String(item.boutique) === boutiqueKey);

    return {
      id: sale._id,
      reference: sale.reference,
      buyer: sale.buyer,
      buyerSnapshot: sale.buyerSnapshot,
      placedAt: sale.placedAt,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      paymentMethod: sale.paymentMethod,
      deliveryContact: sale.deliveryContact,
      deliveryCapacityPolicy: sale.deliveryCapacityPolicy,
      totals: sale.totals,
      boutiqueOrder,
      items
    };
  }

  async checkout({
    userId,
    items,
    idempotencyKey,
    deliveryCapacityPolicy,
    pickupLocation,
    contactPhone
  }) {
    const normalizedItems = this.normalizeItems(items);
    if (!normalizedItems.length) {
      throw new SaleServiceError("Panier vide", 400, "EMPTY_CART");
    }
    const resolvedDeliveryCapacityPolicy = this.normalizeDeliveryCapacityPolicy(
      deliveryCapacityPolicy
    );
    const safePickupLocation = String(pickupLocation || "").trim();
    const safeContactPhone = String(contactPhone || "").trim();

    const idempotencyKeyHash = this.hashIdempotencyKey(userId, idempotencyKey);
    if (idempotencyKeyHash) {
      const replay = await Sale.findOne({ buyer: userId, idempotencyKeyHash });
      if (replay) return { sale: replay, replayed: true };
    }

    const session = await mongoose.startSession();
    let response = null;

    try {
      await session.withTransaction(async () => {
        const user = await User.findById(userId).session(session);
        if (!user) throw new SaleServiceError("Utilisateur introuvable", 404, "USER_NOT_FOUND");
        if (user.status !== "ACTIVE") {
          throw new SaleServiceError("Compte utilisateur inactif", 403, "USER_INACTIVE");
        }

        if (idempotencyKeyHash) {
          const replay = await Sale.findOne({ buyer: userId, idempotencyKeyHash }).session(session);
          if (replay) {
            response = { sale: replay, replayed: true };
            return;
          }
        }

        const productIds = normalizedItems.map((entry) => entry.productId);
        const productDocs = await Product.find({ _id: { $in: productIds } }).session(session);
        const productsById = new Map(productDocs.map((doc) => [String(doc._id), doc]));

        if (productDocs.length !== productIds.length) {
          const missing = productIds.filter((id) => !productsById.has(id));
          throw new SaleServiceError(
            `Produit(s) introuvable(s): ${missing.join(", ")}`,
            404,
            "PRODUCT_NOT_FOUND"
          );
        }

        const boutiqueIds = [...new Set(productDocs.map((doc) => String(doc.boutique)))];
        const boutiqueDocs = await Boutique.find({ _id: { $in: boutiqueIds } }).session(session);
        const boutiquesById = new Map(boutiqueDocs.map((doc) => [String(doc._id), doc]));

        const lines = [];
        let subtotal = 0;
        let taxTotal = 0;
        let quantityTotal = 0;
        const boutiqueAccumulator = new Map();
        const ownerCreditIncrements = new Map();

        for (const item of normalizedItems) {
          const product = productsById.get(item.productId);
          const boutique = boutiquesById.get(String(product.boutique));

          if (!boutique) {
            throw new SaleServiceError("Boutique du produit introuvable", 400, "BOUTIQUE_NOT_FOUND");
          }
          if (boutique.status !== "ACTIVE") {
            throw new SaleServiceError(
              `Boutique indisponible: ${boutique.name}`,
              409,
              "BOUTIQUE_SUSPENDED"
            );
          }
          if (!boutique.onlineSalesEnabled) {
            throw new SaleServiceError(
              `Vente en ligne desactivee pour la boutique: ${boutique.name}`,
              409,
              "BOUTIQUE_ONLINE_DISABLED"
            );
          }
          if (product.status !== "ACTIVE" || !product.isPublished) {
            throw new SaleServiceError(
              `Produit non disponible: ${product.name}`,
              409,
              "PRODUCT_NOT_AVAILABLE"
            );
          }

          if (product.trackStock && !product.allowBackorder) {
            const updated = await Product.findOneAndUpdate(
              { _id: product._id, stockQuantity: { $gte: item.quantity } },
              { $inc: { stockQuantity: -item.quantity } },
              { new: true, session }
            );

            if (!updated) {
              throw new SaleServiceError(
                `Stock insuffisant pour le produit: ${product.name}`,
                409,
                "INSUFFICIENT_STOCK"
              );
            }
          } else if (product.trackStock && product.allowBackorder) {
            await Product.findByIdAndUpdate(
              product._id,
              { $inc: { stockQuantity: -item.quantity } },
              { new: false, session }
            );
          }

          const unitPrice = computeCurrentSellingPrice(product);
          const lineTotal = roundMoney(unitPrice * item.quantity);
          const taxRate = typeof product.taxRate === "number" ? product.taxRate : 0;
          const lineTax = roundMoney((lineTotal * taxRate) / 100);
          const lineGrandTotal = roundMoney(lineTotal + lineTax);

          subtotal = roundMoney(subtotal + lineTotal);
          taxTotal = roundMoney(taxTotal + lineTax);
          quantityTotal += item.quantity;

          lines.push({
            product: product._id,
            boutique: product.boutique,
            productName: product.name,
            sku: product.sku,
            imageUrl: Array.isArray(product.images) && product.images.length ? product.images[0] : null,
            quantity: item.quantity,
            unitPrice,
            lineTotal,
            currency: product.currency || "MGA"
          });

          const key = String(product.boutique);
          const current = boutiqueAccumulator.get(key) || {
            boutique: product.boutique,
            boutiqueName: boutique.name,
            itemCount: 0,
            quantityTotal: 0,
            subtotal: 0,
            currency: product.currency || "MGA"
          };
          current.itemCount += 1;
          current.quantityTotal += item.quantity;
          current.subtotal = roundMoney(current.subtotal + lineTotal);
          boutiqueAccumulator.set(key, current);

          const ownerId = boutique.owner ? String(boutique.owner) : null;
          if (!ownerId) {
            throw new SaleServiceError(
              `Proprietaire boutique introuvable: ${boutique.name}`,
              409,
              "BOUTIQUE_OWNER_NOT_FOUND"
            );
          }
          ownerCreditIncrements.set(
            ownerId,
            roundMoney((ownerCreditIncrements.get(ownerId) || 0) + lineGrandTotal)
          );
        }

        const grandTotal = roundMoney(subtotal + taxTotal);
        const currentCredit = Number(user.credit) || 0;
        if (currentCredit < grandTotal) {
          throw new SaleServiceError(
            "Credit insuffisant pour finaliser l'achat",
            409,
            "INSUFFICIENT_CREDIT"
          );
        }
        user.credit = roundMoney(currentCredit - grandTotal);
        await user.save({ session });

        for (const [ownerId, amount] of ownerCreditIncrements.entries()) {
          const owner = await User.findByIdAndUpdate(ownerId, { $inc: { credit: amount } }, { session });
          if (!owner) {
            throw new SaleServiceError(
              `Vendeur introuvable pour la boutique (owner: ${ownerId})`,
              409,
              "SELLER_NOT_FOUND"
            );
          }
        }

        const boutiqueBreakdown = [];
        for (const entry of boutiqueAccumulator.values()) {
          const boutique = boutiquesById.get(String(entry.boutique));
          const deliveryDate = await this.findAvailableDeliveryDate({
            boutique,
            session,
            deliveryCapacityPolicy: resolvedDeliveryCapacityPolicy
          });

          boutiqueBreakdown.push({
            ...entry,
            deliveryDate,
            fulfillmentStatus: "SCHEDULED",
            fulfillmentNote: null,
            processedAt: null
          });
        }

        const sale = await Sale.create(
          [
            {
              reference: this.buildReference(),
              buyer: user._id,
              buyerSnapshot: {
                pseudo: user.pseudo || null,
                email: user.email || null,
                firstName: user.firstName || null,
                lastName: user.lastName || null
              },
              items: lines,
              boutiqueBreakdown,
              totals: {
                itemCount: lines.length,
                quantityTotal,
                subtotal,
                taxTotal,
                grandTotal,
                currency: "MGA"
              },
              deliveryContact: {
                pickupLocation: safePickupLocation,
                contactPhone: safeContactPhone
              },
              deliveryCapacityPolicy: resolvedDeliveryCapacityPolicy,
              paymentMethod: "CREDIT",
              paymentStatus: "PAID",
              status: "PLACED",
              idempotencyKeyHash
            }
          ],
          { session }
        );

        response = { sale: sale[0], replayed: false };
      });
    } finally {
      await session.endSession();
    }

    return response;
  }

  async listMine({ userId, page = 1, limit = 20 }) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      Sale.find({ buyer: userId }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      Sale.countDocuments({ buyer: userId })
    ]);

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit)
      }
    };
  }

  async getMineById({ userId, saleId }) {
    return Sale.findOne({ _id: saleId, buyer: userId });
  }

  async listForBoutique({ userId, role, boutiqueId = null, page = 1, limit = 20, status = null }) {
    const boutique = await this.resolveBoutiqueForActor({ userId, role, boutiqueId });
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const query = {
      boutiqueBreakdown: { $elemMatch: { boutique: boutique._id } }
    };

    if (status) {
      query.boutiqueBreakdown = {
        $elemMatch: { boutique: boutique._id, fulfillmentStatus: status }
      };
    }

    const [sales, total] = await Promise.all([
      Sale.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      Sale.countDocuments(query)
    ]);

    return {
      data: sales.map((sale) => this.toBoutiqueOrderView(sale, boutique._id)),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit)
      }
    };
  }

  async getForBoutiqueById({ userId, role, saleId, boutiqueId = null }) {
    const boutique = await this.resolveBoutiqueForActor({ userId, role, boutiqueId });
    const sale = await Sale.findOne({
      _id: saleId,
      boutiqueBreakdown: { $elemMatch: { boutique: boutique._id } }
    });
    if (!sale) return null;
    return this.toBoutiqueOrderView(sale, boutique._id);
  }

  async updateBoutiqueOrderStatus({
    userId,
    role,
    saleId,
    fulfillmentStatus,
    fulfillmentNote = null,
    deliveryDate = null,
    boutiqueId = null
  }) {
    const boutique = await this.resolveBoutiqueForActor({ userId, role, boutiqueId });
    const session = await mongoose.startSession();
    let updated = null;

    try {
      await session.withTransaction(async () => {
        const sale = await Sale.findOne({
          _id: saleId,
          boutiqueBreakdown: { $elemMatch: { boutique: boutique._id } }
        }).session(session);

        if (!sale) throw new SaleServiceError("Commande introuvable", 404, "SALE_NOT_FOUND");

        const index = sale.boutiqueBreakdown.findIndex(
          (entry) => String(entry.boutique) === String(boutique._id)
        );
        if (index < 0) throw new SaleServiceError("Commande boutique introuvable", 404, "BOUTIQUE_ORDER_NOT_FOUND");

        const current = sale.boutiqueBreakdown[index];

        if (deliveryDate) {
          const parsedDate = new Date(deliveryDate);
          if (Number.isNaN(parsedDate.getTime())) {
            throw new SaleServiceError("deliveryDate invalide", 400, "INVALID_DELIVERY_DATE");
          }

          const workingDays = this.normalizeWorkingDays(boutique);
          const day = startOfDay(parsedDate);
          if (!workingDays.includes(day.getDay())) {
            throw new SaleServiceError(
              "Jour de livraison non autorise pour cette boutique",
              409,
              "INVALID_DELIVERY_DAY"
            );
          }

          const capacity = this.getDailyCapacity(boutique);
          const booked = await this.countBoutiqueOrdersForDay({
            boutiqueId: boutique._id,
            dayDate: day,
            session,
            excludeSaleId: sale._id
          });

          if (booked >= capacity) {
            throw new SaleServiceError(
              "Capacite de livraison depassee sur cette date",
              409,
              "DELIVERY_CAPACITY_EXCEEDED"
            );
          }

          current.deliveryDate = day;
        }

        current.fulfillmentStatus = fulfillmentStatus;
        current.fulfillmentNote = fulfillmentNote ? String(fulfillmentNote).trim() : null;
        current.processedAt = new Date();

        sale.status = this.mapOverallStatus(sale.boutiqueBreakdown);
        await sale.save({ session });
        updated = this.toBoutiqueOrderView(sale, boutique._id);
      });
    } finally {
      await session.endSession();
    }

    return updated;
  }
}

module.exports = new SaleService();
module.exports.SaleServiceError = SaleServiceError;
