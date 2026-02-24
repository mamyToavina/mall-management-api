const Product = require('./product.model');
const StockMovement = require('./stock-movement.model');
const Boutique = require('../boutique/boutique.model');
const User = require('../users/user.model');
const paginate = require('../../utils/pagination');

class ProductService {
  computePublicPromotionView(product) {
    if (!product) return null;

    const now = new Date();
    const promotion = product.promotion || null;
    const startsAt = promotion?.startsAt ? new Date(promotion.startsAt) : null;
    const endsAt = promotion?.endsAt ? new Date(promotion.endsAt) : null;
    const hasActivePromotion =
      Boolean(promotion?.enabled) &&
      startsAt &&
      endsAt &&
      now >= startsAt &&
      now <= endsAt &&
      typeof promotion?.percentage === 'number';

    if (!hasActivePromotion) return null;

    const originalPrice = Number(product.price);
    const promoPrice =
      typeof product.promotionPrice === 'number'
        ? Number(product.promotionPrice)
        : Math.round((originalPrice - (originalPrice * promotion.percentage) / 100) * 100) / 100;

    if (!Number.isFinite(originalPrice) || !Number.isFinite(promoPrice) || promoPrice >= originalPrice) {
      return null;
    }

    const boutique = product.boutique;
    if (!boutique || boutique.status !== 'ACTIVE') return null;

    const imageUrl =
      Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null;

    return {
      id: String(product._id),
      name: product.name,
      description: product.description || '',
      category: product.category || '',
      imageUrl,
      currency: product.currency || 'MGA',
      originalPrice,
      promoPrice,
      discountRate: Math.round(((originalPrice - promoPrice) / originalPrice) * 100),
      promotion: {
        percentage: promotion.percentage,
        startsAt,
        endsAt
      },
      boutique: {
        id: String(boutique._id),
        name: boutique.name,
        logo: boutique.logo || null
      }
    };
  }

  async listPublicPromotions({ limit = 12, boutiqueId } = {}) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);

    const query = {
      status: 'ACTIVE',
      isPublished: true,
      'promotion.enabled': true
    };

    if (boutiqueId) {
      query.boutique = boutiqueId;
    }

    const docs = await Product.find(query)
      .sort({ updatedAt: -1 })
      .limit(parsedLimit * 4)
      .populate({ path: 'boutique', select: 'name logo status' });

    const items = [];
    for (const doc of docs) {
      const view = this.computePublicPromotionView(doc);
      if (!view) continue;
      items.push(view);
      if (items.length >= parsedLimit) break;
    }

    return {
      data: items,
      meta: {
        total: items.length,
        limit: parsedLimit
      }
    };
  }

  async resolveBoutique(userId) {
    const user = await User.findById(userId).select('boutique');
    if (!user) throw new Error('Utilisateur introuvable');

    let boutique = null;

    if (user.boutique) {
      boutique = await Boutique.findById(user.boutique).select('_id status');
    }

    if (!boutique) {
      boutique = await Boutique.findOne({ owner: userId }).select('_id status');
    }

    if (!boutique) throw new Error('Aucune boutique liee a ce compte');
    if (boutique.status !== 'ACTIVE') throw new Error('Boutique suspendue');

    return boutique;
  }

  buildFilters(queryParams, boutiqueId) {
    const { status, category, search, lowStock } = queryParams;
    const query = { boutique: boutiqueId };

    if (status) query.status = status;
    if (category) query.category = category;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    if (String(lowStock).toLowerCase() === 'true') {
      query.$expr = { $lte: ['$stockQuantity', '$lowStockThreshold'] };
      query.trackStock = true;
    }

    return query;
  }

  async listMine(userId, queryParams) {
    const boutique = await this.resolveBoutique(userId);
    const { page = 1, limit = 10 } = queryParams;
    const query = this.buildFilters(queryParams, boutique._id);
    return paginate(Product, query, page, limit);
  }

  async getMineById(userId, productId) {
    const boutique = await this.resolveBoutique(userId);
    return Product.findOne({ _id: productId, boutique: boutique._id });
  }

  async createMine(userId, payload, imagePath) {
    const boutique = await this.resolveBoutique(userId);

    if (!imagePath) {
        throw new Error('Image obligatoire pour le produit');
    }

    const product = await Product.create({
        ...payload,
        boutique: boutique._id,
        images: [imagePath]
    });

    if (product.trackStock && product.stockQuantity > 0) {
        await StockMovement.create({
        product: product._id,
        boutique: boutique._id,
        createdBy: userId,
        type: 'INITIAL',
        quantity: product.stockQuantity,
        previousStock: 0,
        newStock: product.stockQuantity,
        reason: 'Initial stock'
        });
    }

    return product;
}


  async updateMine(userId, productId, payload) {
    if (Object.prototype.hasOwnProperty.call(payload, 'stockQuantity')) {
      throw new Error('Utilisez l endpoint stock pour changer le stock');
    }

    const boutique = await this.resolveBoutique(userId);

    return Product.findOneAndUpdate(
      { _id: productId, boutique: boutique._id },
      payload,
      { new: true, runValidators: true }
    );
  }

  async addImageMine(userId, productId, imagePath) {
    const boutique = await this.resolveBoutique(userId);
    const product = await Product.findOne({ _id: productId, boutique: boutique._id });
    if (!product) return null;

    product.images = [...(product.images || []), imagePath];
    await product.save();
    return product;
  }

  async replaceImageMine(userId, productId, oldImage, newImagePath) {
    const boutique = await this.resolveBoutique(userId);
    const product = await Product.findOne({ _id: productId, boutique: boutique._id });
    if (!product) return null;

    const index = (product.images || []).indexOf(oldImage);
    if (index === -1) throw new Error('Image introuvable dans ce produit');

    const nextImages = [...product.images];
    nextImages[index] = newImagePath;
    product.images = nextImages;
    await product.save();

    return { product, oldImageToDelete: oldImage };
  }

  async removeImageMine(userId, productId, imagePath) {
    const boutique = await this.resolveBoutique(userId);
    const product = await Product.findOne({ _id: productId, boutique: boutique._id });
    if (!product) return null;

    const currentImages = product.images || [];
    if (!currentImages.includes(imagePath)) throw new Error('Image introuvable dans ce produit');
    if (currentImages.length <= 1) throw new Error('Au moins une image doit etre conservee');

    product.images = currentImages.filter((img) => img !== imagePath);
    await product.save();

    return { product, imageToDelete: imagePath };
  }

  async deleteMine(userId, productId) {
    const boutique = await this.resolveBoutique(userId);
    return Product.findOneAndDelete({ _id: productId, boutique: boutique._id });
  }

  async adjustStock(userId, productId, payload) {
    const { operation, quantity, reason, note, reference } = payload;
    const qty = Number(quantity);

    if (!operation || Number.isNaN(qty) || qty < 0) {
      throw new Error('operation et quantity sont obligatoires');
    }

    const boutique = await this.resolveBoutique(userId);
    const product = await Product.findOne({ _id: productId, boutique: boutique._id });

    if (!product) return null;
    if (!product.trackStock) throw new Error('Le suivi de stock est desactive pour ce produit');

    const previousStock = product.stockQuantity;
    let newStock = previousStock;
    let movementType = 'SET';

    if (operation === 'INCREMENT') {
      newStock = previousStock + qty;
      movementType = 'IN';
    } else if (operation === 'DECREMENT') {
      newStock = previousStock - qty;
      movementType = 'OUT';

      if (newStock < 0 && !product.allowBackorder) {
        throw new Error('Stock insuffisant');
      }

      if (newStock < 0) newStock = 0;
    } else if (operation === 'SET') {
      newStock = qty;
      movementType = 'SET';
    } else {
      throw new Error('operation invalide: INCREMENT, DECREMENT ou SET');
    }

    product.stockQuantity = newStock;
    await product.save();

    await StockMovement.create({
      product: product._id,
      boutique: boutique._id,
      createdBy: userId,
      type: movementType,
      quantity: qty,
      previousStock,
      newStock,
      reason,
      note,
      reference
    });

    return product;
  }

  async setPromotion(userId, productId, payload) {
    const { percentage, startsAt, durationDays } = payload;

    if (Number.isNaN(Number(percentage)) || Number(percentage) <= 0 || Number(percentage) > 90) {
      throw new Error('percentage doit etre entre 1 et 90');
    }

    if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      throw new Error('startsAt invalide');
    }

    if (Number.isNaN(Number(durationDays)) || Number(durationDays) < 1) {
      throw new Error('durationDays doit etre >= 1');
    }

    const boutique = await this.resolveBoutique(userId);
    const product = await Product.findOne({ _id: productId, boutique: boutique._id });

    if (!product) return null;

    product.promotion = {
      enabled: true,
      percentage: Number(percentage),
      startsAt: new Date(startsAt),
      durationDays: Number(durationDays)
    };

    await product.save();
    return product;
  }

  async clearPromotion(userId, productId) {
    const boutique = await this.resolveBoutique(userId);
    const product = await Product.findOne({ _id: productId, boutique: boutique._id });

    if (!product) return null;

    product.promotion = null;
    await product.save();
    return product;
  }

  async listStockMovements(userId, productId, queryParams) {
    const boutique = await this.resolveBoutique(userId);

    const product = await Product.findOne({
      _id: productId,
      boutique: boutique._id
    }).select('_id');

    if (!product) return null;

    const { page = 1, limit = 20 } = queryParams;

    return paginate(
      StockMovement,
      { boutique: boutique._id, product: product._id },
      page,
      limit
    );
  }
}

module.exports = new ProductService();
