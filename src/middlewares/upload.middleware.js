const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { UPLOAD_ROOT, IMAGE_MIME_TYPES } = require("../config/upload");

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeExt(mimetype, originalname) {
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return map[mimetype] || path.extname(originalname).toLowerCase() || "";
}

/**
 * Factory: crée un middleware multer selon le dossier et les options.
 * @param {Object} options
 * @param {string} options.subFolder ex: "cars" / "users"
 * @param {string} options.fieldName ex: "photo"
 * @param {number} [options.maxSizeMB=5]
 */
function createImageUploader({ subFolder, fieldName, maxSizeMB = 5 }) {
  const dest = path.join(UPLOAD_ROOT, subFolder);
  ensureDirSync(dest);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const id = crypto.randomBytes(12).toString("hex");
      const ext = safeExt(file.mimetype, file.originalname);
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Type de fichier non autorisé (images seulement)."));
    }
    cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
  }).single(fieldName);
}

module.exports = { createImageUploader };
