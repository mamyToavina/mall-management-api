const productService = require('../products/product.service');
const boutiquePublicService = require('../boutique/boutique.public.service');

class PublicSearchService {
  async search({ type = 'PROMO', query = '', category = '', minPrice, maxPrice, minRating, limit = 12 } = {}) {
    const safeType = String(type || 'PROMO').toUpperCase();
    const parsedLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
    const ratingValue = Number.isFinite(Number(minRating)) ? Number(minRating) : 0;

    const result = {
      promotions: { data: [], meta: { total: 0, limit: parsedLimit } },
      boutiques: { data: [], meta: { total: 0, limit: parsedLimit } }
    };

    if (safeType === 'PROMO' || safeType === 'ALL') {
      result.promotions = await productService.listPublicPromotions({
        limit: parsedLimit,
        search: query,
        category,
        minPrice,
        maxPrice
      });
    }

    if (safeType === 'BOUTIQUE' || safeType === 'ALL') {
      const boutiques = await boutiquePublicService.listPublicBoutiques({
        limit: parsedLimit,
        search: query
      });

      if (ratingValue > 0) {
        const filtered = (boutiques.data || []).filter((item) => Number(item.rating || 0) >= ratingValue);
        result.boutiques = {
          data: filtered,
          meta: { total: filtered.length, limit: parsedLimit }
        };
      } else {
        result.boutiques = boutiques;
      }
    }

    return result;
  }
}

module.exports = new PublicSearchService();
