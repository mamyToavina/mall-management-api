const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },

    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boutique',
      required: true,
      index: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: ['INITIAL', 'IN', 'OUT', 'SET'],
      required: true,
      index: true
    },

    quantity: { type: Number, required: true, min: 0 },
    previousStock: { type: Number, required: true, min: 0 },
    newStock: { type: Number, required: true, min: 0 },

    reason: { type: String, trim: true },
    note: { type: String, trim: true },
    reference: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockMovement', stockMovementSchema);
