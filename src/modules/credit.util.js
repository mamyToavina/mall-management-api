const crypto = require("crypto");

const generateCreditCode = () => {
  const buffer = crypto.randomBytes(10);
  return buffer.toString("hex").toUpperCase();
};

module.exports = { generateCreditCode };
