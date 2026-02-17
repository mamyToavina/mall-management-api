const mongoose = require("mongoose");

const creditSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    value: {
      type: Number,
      required: true,
      enum: [20000, 100000, 400000]
    },

    status: {
      type: String,
      enum: ["active", "used", "expired"],
      default: "active"
    },

    isPrinted: {
      type: Boolean,
      default: false
    },

    printedAt: {
      type: Date,
      default: null
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    expiresAt: {
      type: Date,
      required: true
    },

    usedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Credit", creditSchema);
