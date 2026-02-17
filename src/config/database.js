const mongoose = require("mongoose");
const { MONGO_URI } = require("./env");

module.exports = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
