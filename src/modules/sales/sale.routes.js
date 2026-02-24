const express = require("express");
const saleController = require("./sale.controller");
const { protect } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const {
  validateCheckout,
  validateListMySales,
  validateMySaleId,
  validateListBoutiqueOrders,
  validateBoutiqueSaleId,
  validateBoutiqueOrderUpdate
} = require("./sale.validation");

const router = express.Router();

router.use(protect, authorize("USER", "ADMIN", "BOUTIQUE"));

router.post("/checkout", validateCheckout, saleController.checkout);
router.get("/my", validateListMySales, saleController.listMine);
router.get("/my/:id", validateMySaleId, saleController.getMineById);
router.get("/boutique/orders", authorize("BOUTIQUE", "ADMIN"), validateListBoutiqueOrders, saleController.listForBoutique);
router.get("/boutique/orders/:id", authorize("BOUTIQUE", "ADMIN"), validateBoutiqueSaleId, saleController.getForBoutiqueById);
router.patch(
  "/boutique/orders/:id",
  authorize("BOUTIQUE", "ADMIN"),
  validateBoutiqueOrderUpdate,
  saleController.updateBoutiqueOrder
);

module.exports = router;
