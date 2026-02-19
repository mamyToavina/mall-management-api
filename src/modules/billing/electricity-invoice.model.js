const mongoose = require('mongoose');

const electricityInvoiceSchema = new mongoose.Schema(
  {
    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boutique',
      required: true,
      index: true
    },
    box: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Box',
      required: true,
      index: true
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      index: true
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 3000,
      index: true
    },
    meterNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    netAmount: {
      type: Number,
      required: true,
      min: 0
    },
    commissionAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    sourceFilePath: {
      type: String,
      required: true
    },
    sourceFileName: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

electricityInvoiceSchema.index(
  { boutique: 1, meterNumber: 1, month: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model('ElectricityInvoice', electricityInvoiceSchema);
