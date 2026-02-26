const mongoose = require("mongoose");

const contractSchema = new mongoose.Schema({

  boutique: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Boutique',
    required: true,
    index: true
  },

  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  durationMonths: {
    type: Number,
    required: true,
    min: 1,
    max: 240
  },

  monthlyRent: {
    type: Number,
    required: true,
    min: 0,
    max: 1000000000
  },

  penaltyFee: {
    type: Number,
    required: true,
    min: 0,
    max: 1000000000,
    default: 0
  },

  penaltyGrowthFactor: {
    type: Number,
    required: true,
    min: 1,
    max: 1000,
    default: 1
  },

  terminationFee: {
    type: Number,
    required: true,
    min: 0,
    max: 1000000000,
    default: 0
  },

  onlineSalesCommissionPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0
  },

  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },

  status: {
    type: String,
    enum: ['ACTIVE', 'SCHEDULED', 'TERMINATED', 'EXPIRED'],
    default: 'ACTIVE',
    index: true
  }

}, { timestamps: true });


contractSchema.pre('save', function(next) {
  if (this.startDate && this.durationMonths && !this.endDate) {
    const computedEndDate = new Date(this.startDate);
    computedEndDate.setMonth(computedEndDate.getMonth() + this.durationMonths);
    this.endDate = computedEndDate;
  }

  if (this.endDate && this.startDate && this.endDate <= this.startDate) {
    return next(new Error("End date must be after start date"));
  }

  if (this.status === 'SCHEDULED' && this.endDate && this.endDate <= new Date()) {
    this.status = 'EXPIRED';
  }

  if (this.status === 'SCHEDULED' && this.startDate && this.startDate <= new Date() && this.endDate > new Date()) {
    this.status = 'ACTIVE';
  }

  if (this.status === 'ACTIVE' && this.endDate && this.endDate < new Date()) {
    this.status = 'EXPIRED';
  }

  next();
});

contractSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  const payload = update.$set || update;
  const hasStartDate = payload.startDate !== undefined;
  const hasDuration = payload.durationMonths !== undefined;
  const hasEndDate = payload.endDate !== undefined;

  if ((hasStartDate || hasDuration) && !hasEndDate) {
    const currentStartDate = hasStartDate ? new Date(payload.startDate) : null;
    const currentDuration = hasDuration ? Number(payload.durationMonths) : null;

    if (currentStartDate && Number.isFinite(currentDuration)) {
      const computedEndDate = new Date(currentStartDate);
      computedEndDate.setMonth(computedEndDate.getMonth() + currentDuration);

      if (update.$set) {
        update.$set.endDate = computedEndDate;
      } else {
        update.endDate = computedEndDate;
      }
      this.setUpdate(update);
    }
  }

  next();
});

contractSchema.methods.getPenaltyForLateMonths = function(lateMonths) {
  const months = Number(lateMonths);
  if (!Number.isInteger(months) || months <= 0) return 0;

  const base = this.penaltyFee || 0;
  const factor = this.penaltyGrowthFactor || 0;
  if (months === 1 || factor <= 0) return base;

  return base * Math.pow(factor, months - 1);
};

contractSchema.pre('validate', function(next) {
  if (this.endDate && this.startDate && this.endDate <= this.startDate) {
    return next(new Error("End date must be after start date"));
  }
  next();
});

module.exports = mongoose.model('Contract', contractSchema);
