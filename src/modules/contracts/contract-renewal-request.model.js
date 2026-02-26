const mongoose = require('mongoose');

const amountMax = 1000000000;

const contractTermsSchema = new mongoose.Schema(
  {
    durationMonths: { type: Number, required: true, min: 1, max: 240 },
    monthlyRent: { type: Number, required: true, min: 0, max: amountMax },
    penaltyFee: { type: Number, required: true, min: 0, max: amountMax, default: 0 },
    penaltyGrowthFactor: { type: Number, required: true, min: 1, max: 1000, default: 1 },
    terminationFee: { type: Number, required: true, min: 0, max: amountMax, default: 0 },
    onlineSalesCommissionPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    notes: { type: String, trim: true, maxlength: 1000, default: '' }
  },
  { _id: false }
);

const contractRenewalRequestSchema = new mongoose.Schema(
  {
    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boutique',
      required: true,
      index: true
    },
    requesterUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    currentContract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract',
      required: true,
      index: true
    },
    requestedTerms: {
      type: contractTermsSchema,
      required: true
    },
    requestNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    adminDecision: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true
    },
    reviewNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    approvedContract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract',
      default: null
    },
    settlementSnapshot: {
      outstandingTotal: { type: Number, default: 0, min: 0 },
      rentOutstanding: { type: Number, default: 0, min: 0 },
      electricityOutstanding: { type: Number, default: 0, min: 0 },
      penaltyOutstanding: { type: Number, default: 0, min: 0 }
    }
  },
  { timestamps: true }
);

contractRenewalRequestSchema.index(
  { boutique: 1, currentContract: 1, adminDecision: 1 },
  { name: 'idx_boutique_contract_decision' }
);

module.exports = mongoose.model('ContractRenewalRequest', contractRenewalRequestSchema);
