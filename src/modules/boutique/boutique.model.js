const mongoose = require("mongoose");

const deliverySettingsSchema = new mongoose.Schema(
  {
    workingDays: {
      type: [Number],
      default: [1, 2, 3, 4, 5],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length > 0 &&
          arr.every((value) => Number.isInteger(value) && value >= 0 && value <= 6),
        message: "workingDays must contain integers between 0 and 6"
      }
    },
    dailyOrderCapacity: {
      type: Number,
      default: 30,
      min: 1,
      max: 5000
    },
    preparationDays: {
      type: Number,
      default: 0,
      min: 0,
      max: 30
    }
  },
  { _id: false }
);

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

  activity: {
    type: String,
    trim: true,
    maxlength: 120,
    default: ''
  },

  offerings: {
    type: String,
    trim: true,
    maxlength: 240,
    default: ''
  },

  marketingTagline: {
    type: String,
    trim: true,
    maxlength: 200,
    default: 'Profitez de nos meilleures offres en boutique et en ligne.'
  },

  publicDescription: {
    type: String,
    trim: true,
    maxlength: 600,
    default: ''
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  box: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Box',
    index: true
  },

  onlineSalesEnabled: {
    type: Boolean,
    default: false
  },

  deliverySettings: {
    type: deliverySettingsSchema,
    default: () => ({})
  },

  status: {
    type: String,
    enum: ['ACTIVE', 'SUSPENDED'],
    default: 'ACTIVE',
    index: true
  }

}, { timestamps: true });

module.exports = mongoose.model('Boutique', boutiqueSchema);
