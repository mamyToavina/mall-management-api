const mongoose = require('mongoose');
const Boutique = require('./boutique.model');
const Product = require('../products/product.model');
const BoutiqueReview = require('../reviews/review.model');

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

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

const roundRating = (value) => Math.round(Number(value || 0) * 10) / 10;

class BoutiquePublicService {
  async listPublicBoutiques({ limit = 24, search = '' } = {}) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
    const query = { status: 'ACTIVE', onlineSalesEnabled: true };

    if (search && String(search).trim()) {
      query.name = { $regex: String(search).trim(), $options: 'i' };
    }

    const boutiques = await Boutique.find(query).sort({ updatedAt: -1 }).limit(parsedLimit).lean();
    const boutiqueIds = boutiques.map((item) => item._id);

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

      return {
        id: String(boutique._id),
        name: boutique.name,
        slogan: `Bienvenue chez ${boutique.name}`,
        activity: stats.topCategory || 'Boutique partenaire',
        description: 'Découvrez les offres disponibles dans cette boutique.',
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

    const products = await Product.find({
      boutique: boutique._id,
      status: 'ACTIVE',
      isPublished: true
    })
      .select('category images promotion price salePrice')
      .lean();

    const reviewStats = await BoutiqueReview.aggregate([
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
    ]);
    const firstReviewStats = reviewStats[0] || { reviewsCount: 0, averageRating: 0 };

    const productCount = products.length;
    const promotionCount = products.filter((p) => isPromotionActive(p)).length;
    const topCategory = products.find((p) => p.category)?.category || 'Boutique partenaire';
    const coverUrl =
      products.find((p) => Array.isArray(p.images) && p.images.length)?.images?.[0] || null;

    return {
      id: String(boutique._id),
      name: boutique.name,
      slogan: `Bienvenue chez ${boutique.name}`,
      activity: topCategory,
      description: 'Découvrez les offres disponibles dans cette boutique.',
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
