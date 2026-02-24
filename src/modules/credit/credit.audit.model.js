const mongoose = require("mongoose");

const creditAuditSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["GENERATE", "PRINT", "USE", "LIST", "STATS", "EXPIRE"],
      required: true
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    actorRole: {
      type: String,
      default: null
    },
    credit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Credit",
      default: null
    },
    ip: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  { timestamps: true }
);

creditAuditSchema.index({ action: 1, createdAt: -1 });
creditAuditSchema.index({ actor: 1, createdAt: -1 });
creditAuditSchema.index({ credit: 1, createdAt: -1 });

module.exports = mongoose.model("CreditAudit", creditAuditSchema);
