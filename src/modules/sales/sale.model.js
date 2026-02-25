const mongoose = require("mongoose");

const saleLineSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Boutique",
      required: true,
      index: true
    },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    lineTax: { type: Number, default: 0, min: 0 },
    lineGrandTotal: { type: Number, default: 0, min: 0 },
    currency: { type: String, required: true, default: "MGA", uppercase: true, trim: true }
  },
  { _id: false }
);

const boutiqueBreakdownSchema = new mongoose.Schema(
  {
    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Boutique",
      required: true
    },
    boutiqueName: { type: String, required: true, trim: true },
    itemCount: { type: Number, required: true, min: 1 },
    quantityTotal: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "MGA", uppercase: true, trim: true },
    deliveryDate: { type: Date, required: true },
    fulfillmentStatus: {
      type: String,
      enum: [
        "SCHEDULED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "REJECTED"
      ],
      default: "SCHEDULED",
      required: true
    },
    fulfillmentNote: { type: String, default: null, trim: true },
    processedAt: { type: Date, default: null },
    refundedAmount: { type: Number, default: 0, min: 0 },
    refundedAt: { type: Date, default: null }
  },
  { _id: false }
);

const totalsSchema = new mongoose.Schema(
  {
    itemCount: { type: Number, required: true, min: 1 },
    quantityTotal: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, min: 0, default: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "MGA", uppercase: true, trim: true }
  },
  { _id: false }
);

const deliveryContactSchema = new mongoose.Schema(
  {
    pickupLocation: { type: String, required: true, trim: true },
    contactPhone: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    buyerSnapshot: {
      pseudo: { type: String, default: null },
      email: { type: String, default: null },
      firstName: { type: String, default: null },
      lastName: { type: String, default: null }
    },
    items: {
      type: [saleLineSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one item is required"
      }
    },
    boutiqueBreakdown: {
      type: [boutiqueBreakdownSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one boutique breakdown entry is required"
      }
    },
    totals: {
      type: totalsSchema,
      required: true
    },
    deliveryContact: {
      type: deliveryContactSchema,
      required: true
    },
    deliveryCapacityPolicy: {
      type: String,
      enum: ["AUTO_NEXT_AVAILABLE", "CANCEL_IF_FULL"],
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ["CREDIT"],
      required: true,
      default: "CREDIT"
    },
    paymentStatus: {
      type: String,
      enum: ["PAID"],
      required: true,
      default: "PAID"
    },
    status: {
      type: String,
      enum: ["PLACED", "PROCESSING", "DELIVERED", "CANCELLED"],
      required: true,
      default: "PLACED"
    },
    idempotencyKeyHash: {
      type: String,
      default: null
    },
    placedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

saleSchema.index(
  { buyer: 1, idempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKeyHash: { $type: "string" } }
  }
);

module.exports = mongoose.model("Sale", saleSchema);
