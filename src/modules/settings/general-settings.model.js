const mongoose = require('mongoose');

const generalSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: 'GENERAL',
      immutable: true
    },
    mallAddress: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ''
    },
    mallLatitude: {
      type: Number,
      min: -90,
      max: 90,
      default: 0
    },
    mallLongitude: {
      type: Number,
      min: -180,
      max: 180,
      default: 0
    },
    defaultPenaltyFee: {
      type: Number,
      min: 0,
      max: 1000000000,
      default: 0
    },
    penaltyGrowthFactor: {
      type: Number,
      min: 0,
      max: 1000,
      default: 1
    },
    defaultTerminationFee: {
      type: Number,
      min: 0,
      max: 1000000000,
      default: 0
    },
    defaultOnlineSalesCommissionPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('GeneralSettings', generalSettingsSchema);
