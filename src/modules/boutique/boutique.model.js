const mongoose = require("mongoose");

const boutiqueSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  logo: {
    type: String
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  onlineSalesEnabled: {
    type: Boolean,
    default: false
  },

  status: {
    type: String,
    enum: ['ACTIVE', 'SUSPENDED'],
    default: 'ACTIVE',
    index: true
  }

}, { timestamps: true });

module.exports = mongoose.model('Boutique', boutiqueSchema);
