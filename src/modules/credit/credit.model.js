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
    },

    idempotencyKeyHash: {
      type: String,
      default: null
    },

    history: [
      {
        action: {
          type: String,
          enum: ["generated", "printed", "used", "expired", "cancelled"],
          required: true
        },
        by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null
        },
        at: {
          type: Date,
          default: Date.now
        },
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: null
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

creditSchema.index(
  { idempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKeyHash: { $type: "string" } }
  }
);

module.exports = mongoose.model("Credit", creditSchema);
