const mongoose = require('mongoose');

const billingTraceSchema = new mongoose.Schema(
  {
    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boutique',
      required: true,
      index: true
    },
    ownerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
    category: {
      type: String,
      required: true,
      enum: ['COMMISSION', 'RENT', 'ELECTRICITY', 'PENALTY'],
      index: true
    },
    action: {
      type: String,
      required: true,
      enum: ['AUTO_DEBIT', 'MANUAL_PAYMENT', 'SALE_COMMISSION'],
      index: true
    },
    automatic: {
      type: Boolean,
      default: false,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 0
    },
    remainingAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    status: {
      type: String,
      required: true,
      enum: ['APPLIED', 'PARTIAL', 'PENDING'],
      index: true
    },
    reason: {
      type: String,
      default: ''
    },
    referenceType: {
      type: String,
      default: ''
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    referenceLabel: {
      type: String,
      default: ''
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

billingTraceSchema.index({ boutique: 1, createdAt: -1 });
billingTraceSchema.index({ ownerUser: 1, createdAt: -1 });

module.exports = mongoose.model('BillingTrace', billingTraceSchema);
