const mongoose = require('mongoose');

const boutiqueReviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    boutique: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boutique',
      required: true,
      index: true
    },
    rating: {
      type: Number,
      required: true,
      min: 0,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    }
  },
  { timestamps: true }
);

boutiqueReviewSchema.index({ user: 1, boutique: 1 }, { unique: true });

module.exports = mongoose.model('BoutiqueReview', boutiqueReviewSchema);
