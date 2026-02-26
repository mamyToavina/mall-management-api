const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Sale = require("./sale.model");
const User = require("../users/user.model");
const Product = require("../products/product.model");
const Boutique = require("../boutique/boutique.model");
const BoutiqueReview = require("../reviews/review.model");
const Contract = require("../contracts/contract.model");
const BillingTrace = require("../billing/billing-trace.model");
const billingService = require("../billing/billing.service");

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

  getNormalizedDeliverySettings(boutique) {
    return {
      workingDays: this.normalizeWorkingDays(boutique).sort((a, b) => a - b),
      dailyOrderCapacity: this.getDailyCapacity(boutique),
      preparationDays: this.getPreparationDays(boutique)
    };
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

  computeBoutiqueRefundAmount({ sale, boutiqueId, fallbackSubtotal = 0 }) {
    const items = sale.items.filter((item) => String(item.boutique) === String(boutiqueId));
    if (!items.length) return 0;

    const fromLines = roundMoney(
      items.reduce((sum, item) => {
        const lineGrandTotal = Number(item.lineGrandTotal);
        if (Number.isFinite(lineGrandTotal) && lineGrandTotal > 0) return sum + lineGrandTotal;

        const lineTotal = Number(item.lineTotal) || 0;
        const lineTax = Number(item.lineTax);
        if (Number.isFinite(lineTax)) return sum + lineTotal + lineTax;
        return sum + lineTotal;
      }, 0)
    );

    if (fromLines > 0) return fromLines;

    // Fallback for legacy sales where tax/grand-total per line was not persisted.
    const subtotal = Number(sale?.totals?.subtotal) || 0;
    const taxTotal = Number(sale?.totals?.taxTotal) || 0;
    const base = Number(fallbackSubtotal) || 0;
    if (subtotal <= 0 || base <= 0) return base;

    const estimatedTaxShare = roundMoney((taxTotal * base) / subtotal);
    return roundMoney(base + estimatedTaxShare);
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

  async getDeliverySettings({ userId, role, boutiqueId = null }) {
    const boutique = await this.resolveBoutiqueForActor({ userId, role, boutiqueId });
    return {
      boutiqueId: String(boutique._id),
      boutiqueName: boutique.name,
      deliverySettings: this.getNormalizedDeliverySettings(boutique)
    };
  }

  async updateDeliverySettings({
    userId,
    role,
    boutiqueId = null,
    workingDays,
    dailyOrderCapacity,
    preparationDays
  }) {
    const boutique = await this.resolveBoutiqueForActor({ userId, role, boutiqueId });

    const nextSettings = {
      ...this.getNormalizedDeliverySettings(boutique)
    };

    if (Array.isArray(workingDays)) {
      const unique = [...new Set(workingDays.map((v) => Number(v)))].filter(
        (v) => Number.isInteger(v) && v >= 0 && v <= 6
      );
      if (!unique.length) {
        throw new SaleServiceError(
          "workingDays invalide: au moins un jour requis",
          400,
          "INVALID_WORKING_DAYS"
        );
      }
      nextSettings.workingDays = unique.sort((a, b) => a - b);
    }

    if (dailyOrderCapacity !== undefined) {
      nextSettings.dailyOrderCapacity = Math.trunc(Number(dailyOrderCapacity));
    }

    if (preparationDays !== undefined) {
      nextSettings.preparationDays = Math.trunc(Number(preparationDays));
    }

    boutique.deliverySettings = nextSettings;
    await boutique.save();

    return {
      boutiqueId: String(boutique._id),
      boutiqueName: boutique.name,
      deliverySettings: this.getNormalizedDeliverySettings(boutique)
    };
  }

  async getDeliveryCapacityCalendar({ userId, role, boutiqueId = null, from = null, to = null }) {
    const boutique = await this.resolveBoutiqueForActor({ userId, role, boutiqueId });
    const settings = this.getNormalizedDeliverySettings(boutique);

    const today = startOfDay(new Date());
    const fromDate = from ? startOfDay(new Date(from)) : today;
    const defaultTo = addDays(fromDate, 29);
    const toDate = to ? startOfDay(new Date(to)) : defaultTo;

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new SaleServiceError("Periode invalide", 400, "INVALID_PERIOD");
    }

    if (toDate < fromDate) {
      throw new SaleServiceError("La date de fin doit etre >= date debut", 400, "INVALID_PERIOD");
    }

    const maxRangeDays = 92;
    const dayCount = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (dayCount > maxRangeDays) {
      throw new SaleServiceError(
        `Periode trop longue (max ${maxRangeDays} jours)`,
        400,
        "PERIOD_TOO_LARGE"
      );
    }

    const toExclusive = addDays(toDate, 1);
    const pipeline = [
      {
        $match: {
          status: { $ne: "CANCELLED" },
          boutiqueBreakdown: {
            $elemMatch: {
              boutique: boutique._id,
              deliveryDate: { $gte: fromDate, $lt: toExclusive },
              fulfillmentStatus: { $ne: "REJECTED" }
            }
          }
        }
      },
      { $unwind: "$boutiqueBreakdown" },
      {
        $match: {
          "boutiqueBreakdown.boutique": boutique._id,
          "boutiqueBreakdown.deliveryDate": { $gte: fromDate, $lt: toExclusive },
          "boutiqueBreakdown.fulfillmentStatus": { $ne: "REJECTED" }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$boutiqueBreakdown.deliveryDate",
              timezone: "UTC"
            }
          },
          ordersCount: { $sum: 1 }
        }
      }
    ];

    const usage = await Sale.aggregate(pipeline);
    const usageByDay = new Map(usage.map((entry) => [entry._id, Number(entry.ordersCount) || 0]));

    const days = [];
    let cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const dateKey = cursor.toISOString().slice(0, 10);
      const dayOfWeek = cursor.getDay();
      const isWorkingDay = settings.workingDays.includes(dayOfWeek);
      const capacity = isWorkingDay ? settings.dailyOrderCapacity : 0;
      const used = usageByDay.get(dateKey) || 0;
      const remaining = Math.max(0, capacity - used);

      days.push({
        date: new Date(cursor).toISOString(),
        dayOfWeek,
        isWorkingDay,
        capacity,
        used,
        remaining,
        isFull: isWorkingDay ? remaining <= 0 : false
      });

      cursor = addDays(cursor, 1);
    }

    return {
      boutiqueId: String(boutique._id),
      boutiqueName: boutique.name,
      deliverySettings: settings,
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      },
      days
    };
  }

  normalizeDashboardDays(days) {
    const parsed = Number(days);
    if (!Number.isFinite(parsed)) return 30;
    const safe = Math.trunc(parsed);
    return Math.min(180, Math.max(7, safe));
  }

  computeBoutiqueSaleRevenue(sale, boutiqueId) {
    const boutiqueKey = String(boutiqueId);
    const items = Array.isArray(sale?.items)
      ? sale.items.filter((item) => String(item?.boutique) === boutiqueKey)
      : [];

    const fromLines = roundMoney(
      items.reduce((sum, item) => {
        const lineGrandTotal = Number(item?.lineGrandTotal);
        if (Number.isFinite(lineGrandTotal)) return sum + lineGrandTotal;

        const lineTotal = Number(item?.lineTotal) || 0;
        const lineTax = Number(item?.lineTax);
        return sum + lineTotal + (Number.isFinite(lineTax) ? lineTax : 0);
      }, 0)
    );

    if (fromLines > 0) return fromLines;

    const breakdown = Array.isArray(sale?.boutiqueBreakdown)
      ? sale.boutiqueBreakdown.find((entry) => String(entry?.boutique) === boutiqueKey)
      : null;

    return roundMoney(Number(breakdown?.subtotal) || 0);
  }

  async getBoutiqueDashboard({ userId, role, boutiqueId = null, days = 30 }) {
    const boutique = await this.resolveBoutiqueForActor({ userId, role, boutiqueId });
    const safeDays = this.normalizeDashboardDays(days);
    const periodEnd = new Date();
    const periodStart = startOfDay(addDays(periodEnd, -(safeDays - 1)));
    const boutiqueKey = String(boutique._id);

    const dayBuckets = new Map();
    let cursor = new Date(periodStart);
    while (cursor <= periodEnd) {
      const key = cursor.toISOString().slice(0, 10);
      dayBuckets.set(key, { revenue: 0, orders: 0 });
      cursor = addDays(cursor, 1);
    }

    const statuses = [
      "SCHEDULED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "REJECTED"
    ];
    const statusCounts = new Map(statuses.map((status) => [status, 0]));

    const sales = await Sale.find({
      placedAt: { $gte: periodStart, $lte: periodEnd },
      boutiqueBreakdown: { $elemMatch: { boutique: boutique._id } }
    })
      .select("reference buyerSnapshot placedAt boutiqueBreakdown items deliveryContact")
      .sort({ placedAt: -1 })
      .lean();

    const topProductsMap = new Map();
    const recentOrders = [];
    let revenueTotal = 0;

    for (const sale of sales) {
      const boutiqueOrder = Array.isArray(sale.boutiqueBreakdown)
        ? sale.boutiqueBreakdown.find((entry) => String(entry.boutique) === boutiqueKey)
        : null;
      if (!boutiqueOrder) continue;

      const revenue = this.computeBoutiqueSaleRevenue(sale, boutique._id);
      revenueTotal = roundMoney(revenueTotal + revenue);

      const dateKey = new Date(sale.placedAt).toISOString().slice(0, 10);
      const bucket = dayBuckets.get(dateKey);
      if (bucket) {
        bucket.revenue = roundMoney(bucket.revenue + revenue);
        bucket.orders += 1;
      }

      const currentCount = statusCounts.get(boutiqueOrder.fulfillmentStatus) || 0;
      statusCounts.set(boutiqueOrder.fulfillmentStatus, currentCount + 1);

      const boutiqueItems = Array.isArray(sale.items)
        ? sale.items.filter((item) => String(item.boutique) === boutiqueKey)
        : [];

      for (const item of boutiqueItems) {
        const productId = String(item.product);
        const lineRevenue = roundMoney(
          Number.isFinite(Number(item.lineGrandTotal))
            ? Number(item.lineGrandTotal)
            : (Number(item.lineTotal) || 0) + (Number(item.lineTax) || 0)
        );
        const current = topProductsMap.get(productId) || {
          productId,
          name: item.productName || "Produit",
          imageUrl: item.imageUrl || null,
          quantity: 0,
          revenue: 0,
          currency: item.currency || "MGA"
        };
        current.quantity += Number(item.quantity) || 0;
        current.revenue = roundMoney(current.revenue + lineRevenue);
        topProductsMap.set(productId, current);
      }

      if (recentOrders.length < 5) {
        recentOrders.push({
          id: String(sale._id),
          reference: sale.reference,
          placedAt: sale.placedAt,
          customerName:
            [sale.buyerSnapshot?.firstName, sale.buyerSnapshot?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            sale.buyerSnapshot?.pseudo ||
            sale.buyerSnapshot?.email ||
            "-",
          fulfillmentStatus: boutiqueOrder.fulfillmentStatus,
          deliveryDate: boutiqueOrder.deliveryDate,
          subtotal: roundMoney(Number(boutiqueOrder.subtotal) || 0),
          currency: boutiqueOrder.currency || "MGA"
        });
      }
    }

    const ordersTotal = sales.length;
    const deliveredOrders = statusCounts.get("DELIVERED") || 0;
    const rejectedOrders = statusCounts.get("REJECTED") || 0;
    const pendingOrders =
      (statusCounts.get("SCHEDULED") || 0) +
      (statusCounts.get("PREPARING") || 0) +
      (statusCounts.get("READY") || 0) +
      (statusCounts.get("OUT_FOR_DELIVERY") || 0);
    const averageOrderValue = ordersTotal > 0 ? roundMoney(revenueTotal / ordersTotal) : 0;
    const deliverySuccessRate = ordersTotal > 0 ? roundMoney((deliveredOrders * 100) / ordersTotal) : 0;
    const rejectionRate = ordersTotal > 0 ? roundMoney((rejectedOrders * 100) / ordersTotal) : 0;

    const [inventoryCounts, reviewStats] = await Promise.all([
      Promise.all([
        Product.countDocuments({ boutique: boutique._id }),
        Product.countDocuments({ boutique: boutique._id, status: "ACTIVE" }),
        Product.countDocuments({ boutique: boutique._id, isPublished: true }),
        Product.countDocuments({
          boutique: boutique._id,
          trackStock: true,
          $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] }
        })
      ]),
      BoutiqueReview.aggregate([
        { $match: { boutique: boutique._id } },
        {
          $group: {
            _id: null,
            reviewsCount: { $sum: 1 },
            averageRating: { $avg: "$rating" }
          }
        }
      ])
    ]);

    let finance = {
      rentRemaining: 0,
      electricityRemaining: 0,
      penaltiesRemaining: 0,
      totalOutstanding: 0,
      commissionTotal: 0,
      currency: "MGA"
    };

    try {
      const summary = await billingService.getMyBillingSummary(userId, {});
      const rentRemaining = roundMoney(summary?.dues?.rent?.remaining || 0);
      const electricityRemaining = roundMoney(summary?.dues?.electricity?.remaining || 0);
      const penaltiesRemaining = roundMoney(summary?.penalties?.remaining || 0);
      finance = {
        rentRemaining,
        electricityRemaining,
        penaltiesRemaining,
        totalOutstanding: roundMoney(rentRemaining + electricityRemaining + penaltiesRemaining),
        commissionTotal: roundMoney(summary?.commission?.totalCommissionAmount || 0),
        currency: "MGA"
      };
    } catch (error) {
      finance = {
        ...finance,
        warning: "Billing summary unavailable"
      };
    }

    const [totalProducts, activeProducts, publishedProducts, lowStockProducts] = inventoryCounts;
    const firstReview = reviewStats[0] || { reviewsCount: 0, averageRating: 0 };

    const dailyRevenue = [...dayBuckets.entries()].map(([date, values]) => ({
      date,
      revenue: values.revenue,
      orders: values.orders
    }));

    const statusLabels = {
      SCHEDULED: "Planifiees",
      PREPARING: "Preparation",
      READY: "Pretes",
      OUT_FOR_DELIVERY: "En livraison",
      DELIVERED: "Livrees",
      REJECTED: "Rejetees"
    };

    const statusBreakdown = statuses.map((status) => ({
      status,
      label: statusLabels[status],
      count: statusCounts.get(status) || 0
    }));

    const topProducts = [...topProductsMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      boutique: {
        id: String(boutique._id),
        name: boutique.name
      },
      period: {
        from: periodStart.toISOString(),
        to: periodEnd.toISOString(),
        days: safeDays
      },
      kpis: {
        revenueTotal,
        ordersTotal,
        averageOrderValue,
        pendingOrders,
        deliveredOrders,
        rejectedOrders,
        deliverySuccessRate,
        rejectionRate,
        currency: "MGA"
      },
      finance,
      inventory: {
        totalProducts,
        activeProducts,
        publishedProducts,
        lowStockProducts
      },
      reputation: {
        averageRating: Math.round((Number(firstReview.averageRating || 0) + Number.EPSILON) * 10) / 10,
        reviewsCount: Number(firstReview.reviewsCount || 0)
      },
      charts: {
        dailyRevenue,
        statusBreakdown,
        topProducts
      },
      recentOrders
    };
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

          const ownerId = boutique.owner ? String(boutique.owner) : null;
          if (!ownerId) {
            throw new SaleServiceError(
              `Proprietaire boutique introuvable: ${boutique.name}`,
              409,
              "BOUTIQUE_OWNER_NOT_FOUND"
            );
          }

          lines.push({
            product: product._id,
            boutique: product.boutique,
            productName: product.name,
            sku: product.sku,
            imageUrl: Array.isArray(product.images) && product.images.length ? product.images[0] : null,
            quantity: item.quantity,
            unitPrice,
            lineTotal,
            lineTax,
            lineGrandTotal,
            currency: product.currency || "MGA"
          });

          const key = String(product.boutique);
          const current = boutiqueAccumulator.get(key) || {
            boutique: product.boutique,
            boutiqueName: boutique.name,
            ownerId,
            itemCount: 0,
            quantityTotal: 0,
            subtotal: 0,
            grossTotal: 0,
            currency: product.currency || "MGA"
          };
          current.itemCount += 1;
          current.quantityTotal += item.quantity;
          current.subtotal = roundMoney(current.subtotal + lineTotal);
          current.grossTotal = roundMoney(current.grossTotal + lineGrandTotal);
          boutiqueAccumulator.set(key, current);
        }

        const boutiqueIdsForContract = [...boutiqueAccumulator.values()].map((entry) => entry.boutique);
        const activeContracts = await Contract.find({
          boutique: { $in: boutiqueIdsForContract },
          status: "ACTIVE"
        }).session(session);
        const contractByBoutique = new Map(
          activeContracts.map((contract) => [String(contract.boutique), contract])
        );

        const ownerNetCreditIncrements = new Map();
        const commissionEntries = [];
        for (const entry of boutiqueAccumulator.values()) {
          const contract = contractByBoutique.get(String(entry.boutique));
          const commissionRate = Number(contract?.onlineSalesCommissionPercent) || 0;
          const saleAmount = roundMoney(entry.grossTotal || 0);
          const commissionAmount = roundMoney((saleAmount * commissionRate) / 100);
          const netAmount = roundMoney(Math.max(0, saleAmount - commissionAmount));

          ownerNetCreditIncrements.set(
            entry.ownerId,
            roundMoney((ownerNetCreditIncrements.get(entry.ownerId) || 0) + netAmount)
          );

          commissionEntries.push({
            boutiqueId: entry.boutique,
            ownerId: entry.ownerId,
            boutiqueName: entry.boutiqueName,
            saleAmount,
            commissionRate,
            commissionAmount
          });
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

        for (const [ownerId, amount] of ownerNetCreditIncrements.entries()) {
          const owner = await User.findByIdAndUpdate(ownerId, { $inc: { credit: amount } }, { session });
          if (!owner) {
            throw new SaleServiceError(
              `Vendeur introuvable pour la boutique (owner: ${ownerId})`,
              409,
              "SELLER_NOT_FOUND"
            );
          }
        }

        for (const ownerId of ownerNetCreditIncrements.keys()) {
          await billingService.autoSettleOwnerOutstanding({
            ownerUserId: ownerId,
            session,
            trigger: "SALE_CREDIT_INFLOW"
          });
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
            processedAt: null,
            refundedAmount: 0,
            refundedAt: null
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

        const saleDoc = sale[0];
        if (commissionEntries.length > 0) {
          const createdAt = saleDoc.placedAt || new Date();
          const month = createdAt.getMonth() + 1;
          const year = createdAt.getFullYear();

          await BillingTrace.insertMany(
            commissionEntries.map((entry) => ({
              boutique: entry.boutiqueId,
              ownerUser: entry.ownerId,
              month,
              year,
              category: "COMMISSION",
              action: "SALE_COMMISSION",
              automatic: true,
              amount: entry.saleAmount,
              paidAmount: entry.commissionAmount,
              remainingAmount: 0,
              status: "APPLIED",
              reason: "Commission prelevee automatiquement a la vente",
              referenceType: "SALE",
              referenceId: saleDoc._id,
              referenceLabel: saleDoc.reference,
              details: {
                saleReference: saleDoc.reference,
                saleDate: createdAt,
                boutiqueName: entry.boutiqueName,
                saleAmount: entry.saleAmount,
                commissionRate: entry.commissionRate,
                commissionAmount: entry.commissionAmount,
                clientName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.pseudo || "-",
                clientEmail: user.email || "-"
              }
            })),
            { session }
          );
        }

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
        const previousStatus = current.fulfillmentStatus;

        if (previousStatus === "REJECTED" && fulfillmentStatus !== "REJECTED") {
          throw new SaleServiceError(
            "Impossible de re-activer une commande boutique deja rejetee (remboursement deja effectue)",
            409,
            "REJECTED_ORDER_IMMUTABLE"
          );
        }

        if (deliveryDate && fulfillmentStatus !== "REJECTED") {
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

        if (fulfillmentStatus === "REJECTED" && previousStatus !== "REJECTED") {
          const refundAmount = this.computeBoutiqueRefundAmount({
            sale,
            boutiqueId: boutique._id,
            fallbackSubtotal: current.subtotal
          });

          if (refundAmount > 0) {
            const buyer = await User.findByIdAndUpdate(
              sale.buyer,
              { $inc: { credit: refundAmount } },
              { session, new: true }
            );
            if (!buyer) {
              throw new SaleServiceError("Acheteur introuvable", 409, "BUYER_NOT_FOUND");
            }

            const ownerId = boutique.owner ? String(boutique.owner) : null;
            if (!ownerId) {
              throw new SaleServiceError(
                "Proprietaire boutique introuvable",
                409,
                "BOUTIQUE_OWNER_NOT_FOUND"
              );
            }

            const seller = await User.findByIdAndUpdate(
              ownerId,
              { $inc: { credit: -refundAmount } },
              { session, new: true }
            );
            if (!seller) {
              throw new SaleServiceError("Vendeur introuvable", 409, "SELLER_NOT_FOUND");
            }
          }

          current.refundedAmount = refundAmount;
          current.refundedAt = new Date();
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
