const mongoose = require('mongoose');

const boxSchema = new mongoose.Schema({
  number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },

  floor: {
    type: Number,
    required: true,
    min: 0
  },

  surface: {
    type: Number,
    required: true,
    min: 1
  },

  monthlyRent: {
    type: Number,
    required: true,
    min: 0
  },

  electricityMeterNumber: {
    type: String,
    trim: true
  },

  // Si null → box libre
  boutique: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Boutique',
    default: null,
    index: true
  }

}, { timestamps: true });

module.exports = mongoose.model('Box', boxSchema);
