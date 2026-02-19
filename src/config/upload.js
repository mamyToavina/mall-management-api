const path = require("path");

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const FOLDERS = {
  user: "users",
  product: "products",
  boutique: "boutiques",
};

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

module.exports = {
  UPLOAD_ROOT,
  FOLDERS,
  IMAGE_MIME_TYPES,
};
