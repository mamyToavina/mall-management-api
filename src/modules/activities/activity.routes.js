const express = require("express");
const activityController = require("./activity.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { FOLDERS } = require("../../config/upload");
const { createImageUploader } = require("../../middlewares/upload.middleware");
const {
  validatePublicUpcoming,
  validateListForManagement,
  validateId,
  validateCreate,
  validateUpdate,
} = require("./activity.validation");

const router = express.Router();

const uploadActivityImage = createImageUploader({
  subFolder: FOLDERS.activity,
  fieldName: "image",
  maxSizeMB: 5,
});

router.get("/public/upcoming", validatePublicUpcoming, activityController.listPublicUpcoming);

router.use(protect, authorize("ADMIN", "BOUTIQUE"));


router.get("/", validateListForManagement, activityController.list);
router.get("/:id", validateId, activityController.getById);
router.post("/", uploadActivityImage, validateCreate, activityController.create);
router.patch("/:id", validateUpdate, activityController.update);
router.patch("/:id/photo", uploadActivityImage, validateId, activityController.replacePhoto);
router.delete("/:id", validateId, activityController.delete);

module.exports = router;
