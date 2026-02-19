const fs = require('fs');
const productService = require('./product.service');

const parseMaybeJSON = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parseMaybeNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseMaybeBoolean = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const lowered = String(value).toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  return undefined;
};

const buildProductPayload = (body) => {
  const payload = {
    ...body,
    price: parseMaybeNumber(body.price),
    salePrice: parseMaybeNumber(body.salePrice),
    costPrice: parseMaybeNumber(body.costPrice),
    taxRate: parseMaybeNumber(body.taxRate),
    weight: parseMaybeNumber(body.weight),
    stockQuantity: parseMaybeNumber(body.stockQuantity),
    lowStockThreshold: parseMaybeNumber(body.lowStockThreshold),
    trackStock: parseMaybeBoolean(body.trackStock),
    allowBackorder: parseMaybeBoolean(body.allowBackorder),
    isPublished: parseMaybeBoolean(body.isPublished),
    tags: parseMaybeJSON(body.tags, []),
    dimensions: parseMaybeJSON(body.dimensions, undefined),
    metadata: parseMaybeJSON(body.metadata, {})
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
};

class ProductController {
  async listMine(req, res, next) {
    try {
      const result = await productService.listMine(req.user.id, req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getMineById(req, res, next) {
    try {
      const product = await productService.getMineById(req.user.id, req.params.id);
      if (!product) return res.status(404).json({ message: 'Produit introuvable' });
      res.json(product);
    } catch (error) {
      next(error);
    }
  }

  async createMine(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Image produit obligatoire (upload fichier)' });
      }

      const payload = buildProductPayload(req.body);
      const imagePath = `/uploads/products/${req.file.filename}`;
      const product = await productService.createMine(req.user.id, payload, imagePath);
      res.status(201).json(product);
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      next(error);
    }
  }

  async updateMine(req, res, next) {
    try {
      const payload = buildProductPayload(req.body);
      const product = await productService.updateMine(req.user.id, req.params.id, payload);
      if (!product) return res.status(404).json({ message: 'Produit introuvable' });
      res.json(product);
    } catch (error) {
      next(error);
    }
  }

  async deleteMine(req, res, next) {
    try {
      const product = await productService.deleteMine(req.user.id, req.params.id);
      if (!product) return res.status(404).json({ message: 'Produit introuvable' });
      res.json({ message: 'Produit supprime' });
    } catch (error) {
      next(error);
    }
  }

  async adjustStock(req, res, next) {
    try {
      const product = await productService.adjustStock(req.user.id, req.params.id, req.body);
      if (!product) return res.status(404).json({ message: 'Produit introuvable' });
      res.json(product);
    } catch (error) {
      next(error);
    }
  }

  async setPromotion(req, res, next) {
    try {
      const payload = {
        percentage: parseMaybeNumber(req.body.percentage),
        startsAt: req.body.startsAt,
        durationDays: parseMaybeNumber(req.body.durationDays)
      };

      const product = await productService.setPromotion(req.user.id, req.params.id, payload);
      if (!product) return res.status(404).json({ message: 'Produit introuvable' });
      res.json(product);
    } catch (error) {
      next(error);
    }
  }

  async clearPromotion(req, res, next) {
    try {
      const product = await productService.clearPromotion(req.user.id, req.params.id);
      if (!product) return res.status(404).json({ message: 'Produit introuvable' });
      res.json(product);
    } catch (error) {
      next(error);
    }
  }

  async listStockMovements(req, res, next) {
    try {
      const result = await productService.listStockMovements(
        req.user.id,
        req.params.id,
        req.query
      );
      if (!result) return res.status(404).json({ message: 'Produit introuvable' });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();
