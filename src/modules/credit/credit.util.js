const crypto = require("crypto");

const generateCreditCode = () => {
  const buffer = crypto.randomBytes(10);
  return buffer.toString("hex").toUpperCase();
};

const hashIdempotencyKey = (userId, idempotencyKey) => {
  return crypto
    .createHash("sha256")
    .update(`${String(userId)}:${String(idempotencyKey).trim()}`)
    .digest("hex");
};

module.exports = { generateCreditCode, hashIdempotencyKey };
