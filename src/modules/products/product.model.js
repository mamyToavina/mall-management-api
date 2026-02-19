const mongoose = require('mongoose');

const dimensionsSchema = new mongoose.Schema(
  {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 }
  },
  { _id: false }
);

const promotionSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    percentage: { type: Number, min: 1, max: 90 },
    startsAt: { type: Date },
    durationDays: { type: Number, min: 1 },
    endsAt: { type: Date }
  },
  { _id: false }
);

const roundPrice = (value) => Math.round(value * 100) / 100;

const productSchema = new mongoose.Schema(
  {
    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boutique',
      required: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    sku: {
      type: String,
      required: true,
      trim: true
    },

    barcode: { type: String, trim: true },
    description: { type: String, trim: true },
    brand: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    subCategory: { type: String, trim: true },

    tags: [{ type: String, trim: true }],

    images: {
        type: [String],
        required: true,
        validate: {
            validator: (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((v) => typeof v === 'string' && v.trim().length > 0),
            message: 'Au moins une image est obligatoire'
        }
    },

    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0 },
    promotion: { type: promotionSchema, default: null },

    currency: {
      type: String,
      default: 'MGA',
      uppercase: true,
      trim: true
    },

    taxRate: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'piece', trim: true },

    weight: { type: Number, min: 0 },
    dimensions: dimensionsSchema,

    trackStock: { type: Boolean, default: true },
    stockQuantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    allowBackorder: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      default: 'DRAFT',
      index: true
    },

    isPublished: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

productSchema.pre('validate', function () {
  if (this.sku) this.sku = this.sku.toUpperCase();

  if (
    typeof this.salePrice === 'number' &&
    typeof this.price === 'number' &&
    this.salePrice > this.price
  ) {
    this.invalidate('salePrice', 'salePrice cannot be greater than price');
  }

  if (!this.trackStock) {
    this.stockQuantity = 0;
  }

  if (this.promotion && this.promotion.enabled) {
    const { percentage, startsAt, durationDays } = this.promotion;

    if (typeof percentage !== 'number') {
      this.invalidate('promotion.percentage', 'promotion.percentage is required when promotion is enabled');
    }

    if (!startsAt) {
      this.invalidate('promotion.startsAt', 'promotion.startsAt is required when promotion is enabled');
    }

    if (!durationDays || durationDays < 1) {
      this.invalidate('promotion.durationDays', 'promotion.durationDays must be >= 1');
    }

    if (startsAt && durationDays >= 1) {
      const startDate = new Date(startsAt);
      const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      this.promotion.endsAt = endDate;
    }
  }
});

productSchema.virtual('isPromotionActive').get(function () {
  if (!this.promotion || !this.promotion.enabled) return false;
  if (!this.promotion.startsAt || !this.promotion.endsAt) return false;

  const now = new Date();
  return now >= this.promotion.startsAt && now <= this.promotion.endsAt;
});

productSchema.virtual('promotionPrice').get(function () {
  if (!this.isPromotionActive) return null;
  if (typeof this.price !== 'number') return null;
  if (!this.promotion || typeof this.promotion.percentage !== 'number') return null;

  const discounted = this.price - (this.price * this.promotion.percentage) / 100;
  return roundPrice(Math.max(0, discounted));
});

productSchema.virtual('currentSellingPrice').get(function () {
  if (typeof this.promotionPrice === 'number') return this.promotionPrice;
  if (typeof this.salePrice === 'number') return this.salePrice;
  return this.price;
});

productSchema.index({ boutique: 1, sku: 1 }, { unique: true });
productSchema.index({ boutique: 1, name: 1 });

module.exports = mongoose.model('Product', productSchema);
