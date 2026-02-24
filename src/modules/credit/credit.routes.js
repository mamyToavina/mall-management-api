const express = require("express");
const creditController = require("./credit.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const {
  validateGenerate,
  validatePrint,
  validateUse,
  validateList,
  validateStats
} = require("./credit.validation");

const router = express.Router();

router.use(protect);

router.post(
  "/generate",
  authorize("ADMIN"),
  validateGenerate,
  creditController.generate
);

router.patch(
  "/print/:id",
  authorize("ADMIN"),
  validatePrint,
  creditController.print
);

router.post(
  "/use",
  authorize("USER", "ADMIN", "BOUTIQUE"),
  validateUse,
  creditController.use
);

router.get(
  "/",
  authorize("ADMIN"),
  validateList,
  creditController.list
);

router.get(
  "/stats",
  authorize("ADMIN"),
  validateStats,
  creditController.stats
);

module.exports = router;
