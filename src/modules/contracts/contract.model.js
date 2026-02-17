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
    min: 3
  },

  monthlyRent: {
    type: Number,
    required: true,
    min: 0
  },

  details: {
    type: String,
    trim: true
  },

  status: {
    type: String,
    enum: ['ACTIVE', 'TERMINATED', 'EXPIRED'],
    default: 'ACTIVE',
    index: true
  }

}, { timestamps: true });


contractSchema.pre('save', function(next) {
  if (this.endDate <= this.startDate) {
    return next(new Error("End date must be after start date"));
  }
  next();
});

module.exports = mongoose.model('Contract', contractSchema);
