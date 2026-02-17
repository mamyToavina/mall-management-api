require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET || "secret123!!=)",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d"
};
