const mongoose = require('mongoose');

const billingCycleSchema = new mongoose.Schema(
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
    rentDue: { type: Number, default: 0, min: 0 },
    rentAutoPaid: { type: Number, default: 0, min: 0 },
    rentManualPaid: { type: Number, default: 0, min: 0 },
    electricityDue: { type: Number, default: 0, min: 0 },
    electricityAutoPaid: { type: Number, default: 0, min: 0 },
    electricityManualPaid: { type: Number, default: 0, min: 0 },
    penaltyDue: { type: Number, default: 0, min: 0 },
    penaltyAutoPaid: { type: Number, default: 0, min: 0 },
    penaltyManualPaid: { type: Number, default: 0, min: 0 },
    rentDueDate: { type: Date, default: null },
    electricityDueDate: { type: Date, default: null },
    penaltyBreakdown: {
      rent: {
        baseFee: { type: Number, default: 0, min: 0 },
        monthsLate: { type: Number, default: 0, min: 0 },
        growthFactor: { type: Number, default: 1, min: 0 },
        amountDue: { type: Number, default: 0, min: 0 }
      },
      electricity: {
        baseFee: { type: Number, default: 0, min: 0 },
        monthsLate: { type: Number, default: 0, min: 0 },
        growthFactor: { type: Number, default: 1, min: 0 },
        amountDue: { type: Number, default: 0, min: 0 }
      }
    },
    lastAutoProcessedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

billingCycleSchema.index(
  { boutique: 1, month: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model('BillingCycle', billingCycleSchema);
