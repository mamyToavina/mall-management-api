const mongoose = require('mongoose');
const Boutique = require('./boutique.model');
const Product = require('../products/product.model');
const BoutiqueReview = require('../reviews/review.model');
const Box = require('../boxes/box.model');

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundRating = (value) => Math.round(Number(value || 0) * 10) / 10;

const isPromotionActive = (product, now = new Date()) => {
  const promo = product?.promotion;
  if (!promo || !promo.enabled) return false;
  if (typeof promo.percentage !== 'number') return false;
  const startsAt = promo.startsAt ? new Date(promo.startsAt) : null;
  const endsAt = promo.endsAt ? new Date(promo.endsAt) : null;
  if (!startsAt || !endsAt) return false;
  return now >= startsAt && now <= endsAt;
};

const computeSellingPrice = (product, now = new Date()) => {
  if (isPromotionActive(product, now)) {
    const discount = (Number(product.price) * Number(product.promotion.percentage)) / 100;
    return roundMoney(Math.max(0, Number(product.price) - discount));
  }
  if (typeof product.salePrice === 'number') return roundMoney(product.salePrice);
  return roundMoney(product.price);
};

const floorLabel = (floor) => {
  if (Number(floor) === 0) return 'au rez-de-chaussee';
  if (Number(floor) === 1) return 'au 1er etage';
  if (!Number.isFinite(Number(floor)) || Number(floor) < 0) return 'dans TI Commercial';
  return `au ${Math.trunc(Number(floor))}e etage`;
};

const buildLocationDescription = (boutiqueName, box) => {
  if (!box) {
    return `Bienvenue chez ${boutiqueName}, retrouvez-nous dans TI Commercial.`;
  }
  const number = box.number ? `box ${box.number}` : 'notre box';
  return `Bienvenue chez ${boutiqueName}, retrouvez-nous ${number}, ${floorLabel(box.floor)} de TI Commercial.`;
};

const buildOfferingsText = (boutique, topCategory) => {
  const raw = String(boutique?.offerings || '').trim();
  if (raw) return raw;
  if (topCategory) return `Nous proposons une selection de produits ${topCategory}.`;
  return 'Nous proposons une selection de produits pour votre quotidien.';
};

const buildMarketingTagline = (boutique) => {
  const raw = String(boutique?.marketingTagline || '').trim();
  if (raw) return raw;
  return 'Profitez de nos meilleures offres en boutique et en ligne.';
};

const buildPublicDescription = (boutique) => {
  const raw = String(boutique?.publicDescription || '').trim();
  if (raw) return raw;
  return 'Decouvrez les offres disponibles dans cette boutique.';
};

class BoutiquePublicService {
  async listPublicBoutiques({ limit = 24, search = '' } = {}) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
    const query = { status: 'ACTIVE', onlineSalesEnabled: true };

    if (search && String(search).trim()) {
      query.name = { $regex: String(search).trim(), $options: 'i' };
    }

    const boutiques = await Boutique.find(query).sort({ updatedAt: -1 }).limit(parsedLimit).lean();
    const boutiqueIds = boutiques.map((item) => item._id);
    const boxIds = boutiques.map((item) => item.box).filter(Boolean);

    let statsByBoutique = new Map();
    if (boutiqueIds.length) {
      const products = await Product.find({
        boutique: { $in: boutiqueIds },
        status: 'ACTIVE',
        isPublished: true
      })
        .select('boutique category images promotion price salePrice')
        .lean();

      const grouped = new Map();
      for (const product of products) {
        const key = String(product.boutique);
        if (!grouped.has(key)) {
          grouped.set(key, {
            productCount: 0,
            promotionCount: 0,
            topCategory: '',
            coverUrl: null
          });
        }

        const bucket = grouped.get(key);
        bucket.productCount += 1;
        if (isPromotionActive(product)) bucket.promotionCount += 1;
        if (!bucket.topCategory && product.category) bucket.topCategory = product.category;
        if (!bucket.coverUrl && Array.isArray(product.images) && product.images.length) {
          bucket.coverUrl = product.images[0];
        }
      }

      statsByBoutique = grouped;
    }

    const reviewStats = await BoutiqueReview.aggregate([
      {
        $match: {
          boutique: { $in: boutiqueIds }
        }
      },
      {
        $group: {
          _id: '$boutique',
          reviewsCount: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }
      }
    ]);

    const reviewStatsByBoutique = new Map(
      reviewStats.map((item) => [
        String(item._id),
        {
          reviewsCount: Number(item.reviewsCount || 0),
          rating: roundRating(item.averageRating)
        }
      ])
    );

    let boxById = new Map();
    if (boxIds.length) {
      const boxes = await Box.find({ _id: { $in: boxIds } }).select('_id number floor').lean();
      boxById = new Map(boxes.map((box) => [String(box._id), box]));
    }

    let boxByBoutiqueId = new Map();
    if (boutiqueIds.length) {
      const boxesByBoutique = await Box.find({ boutique: { $in: boutiqueIds } })
        .select('_id number floor boutique')
        .lean();
      boxByBoutiqueId = new Map(
        boxesByBoutique
          .filter((box) => box?.boutique)
          .map((box) => [String(box.boutique), box])
      );
    }

    const data = boutiques.map((boutique) => {
      const stats = statsByBoutique.get(String(boutique._id)) || {
        productCount: 0,
        promotionCount: 0,
        topCategory: '',
        coverUrl: null
      };
      const reviews = reviewStatsByBoutique.get(String(boutique._id)) || {
        reviewsCount: 0,
        rating: 0
      };
      const topCategory = stats.topCategory || '';
      const activity = String(boutique.activity || '').trim() || topCategory || 'Boutique partenaire';
      const box =
        (boutique.box ? boxById.get(String(boutique.box)) || null : null) ||
        boxByBoutiqueId.get(String(boutique._id)) ||
        null;

      return {
        id: String(boutique._id),
        name: boutique.name,
        slogan: `Bienvenue chez ${boutique.name}`,
        activity,
        boxNumber: box?.number || null,
        boxFloor: Number.isFinite(Number(box?.floor)) ? Number(box.floor) : null,
        offerings: buildOfferingsText(boutique, topCategory),
        marketingTagline: buildMarketingTagline(boutique),
        locationDescription: buildLocationDescription(boutique.name, box),
        description: buildPublicDescription(boutique),
        rating: reviews.rating,
        reviewsCount: reviews.reviewsCount,
        logoUrl: boutique.logo || null,
        coverUrl: stats.coverUrl,
        highlights: [
          `${stats.productCount} produits`,
          `${stats.promotionCount} promotions actives`,
          'Vente en ligne disponible'
        ]
      };
    });

    return {
      data,
      meta: {
        total: data.length,
        limit: parsedLimit
      }
    };
  }

  async getPublicBoutiqueById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const boutique = await Boutique.findOne({
      _id: id,
      status: 'ACTIVE',
      onlineSalesEnabled: true
    }).lean();

    if (!boutique) return null;

    const [products, reviewStats, boxFromId, boxFromBoutique] = await Promise.all([
      Product.find({
        boutique: boutique._id,
        status: 'ACTIVE',
        isPublished: true
      })
        .select('category images promotion price salePrice')
        .lean(),
      BoutiqueReview.aggregate([
        {
          $match: {
            boutique: boutique._id
          }
        },
        {
          $group: {
            _id: '$boutique',
            reviewsCount: { $sum: 1 },
            averageRating: { $avg: '$rating' }
          }
        }
      ]),
      boutique.box ? Box.findById(boutique.box).select('_id number floor').lean() : Promise.resolve(null),
      Box.findOne({ boutique: boutique._id }).select('_id number floor').lean()
    ]);
    const box = boxFromId || boxFromBoutique || null;

    const firstReviewStats = reviewStats[0] || { reviewsCount: 0, averageRating: 0 };
    const productCount = products.length;
    const promotionCount = products.filter((p) => isPromotionActive(p)).length;
    const topCategory = products.find((p) => p.category)?.category || 'Boutique partenaire';
    const coverUrl =
      products.find((p) => Array.isArray(p.images) && p.images.length)?.images?.[0] || null;
    const activity = String(boutique.activity || '').trim() || topCategory;

    return {
      id: String(boutique._id),
      name: boutique.name,
      slogan: `Bienvenue chez ${boutique.name}`,
      activity,
      boxNumber: box?.number || null,
      boxFloor: Number.isFinite(Number(box?.floor)) ? Number(box.floor) : null,
      offerings: buildOfferingsText(boutique, topCategory),
      marketingTagline: buildMarketingTagline(boutique),
      locationDescription: buildLocationDescription(boutique.name, box),
      description: buildPublicDescription(boutique),
      rating: roundRating(firstReviewStats.averageRating),
      reviewsCount: Number(firstReviewStats.reviewsCount || 0),
      logoUrl: boutique.logo || null,
      coverUrl,
      highlights: [
        `${productCount} produits`,
        `${promotionCount} promotions actives`,
        'Vente en ligne disponible'
      ]
    };
  }

  async listPublicBoutiqueProducts(id, { limit = 100 } = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const parsedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);

    const boutique = await Boutique.findOne({
      _id: id,
      status: 'ACTIVE',
      onlineSalesEnabled: true
    })
      .select('_id')
      .lean();
    if (!boutique) return null;

    const now = new Date();
    const products = await Product.find({
      boutique: boutique._id,
      status: 'ACTIVE',
      isPublished: true
    })
      .sort({ updatedAt: -1 })
      .limit(parsedLimit)
      .lean();

    return {
      data: products.map((product) => {
        const sellingPrice = computeSellingPrice(product, now);
        const promoActive = isPromotionActive(product, now);

        return {
          id: String(product._id),
          boutiqueId: String(product.boutique),
          name: product.name,
          category: product.category || '',
          description: product.description || '',
          price: roundMoney(product.price),
          promoPrice: promoActive ? sellingPrice : null,
          currency: product.currency || 'MGA',
          imageUrl: Array.isArray(product.images) && product.images.length ? product.images[0] : null,
          stock: Number(product.stockQuantity) || 0
        };
      }),
      meta: {
        total: products.length,
        limit: parsedLimit
      }
    };
  }
}

module.exports = new BoutiquePublicService();
