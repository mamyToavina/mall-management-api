const { body, header, param, query, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map((entry) => ({
        field: entry.path,
        message: entry.msg
      }))
    });
  }
  next();
};

const validateCheckout = [
  body("items")
    .exists()
    .withMessage("items is required")
    .bail()
    .isArray({ min: 1, max: 200 })
    .withMessage("items must be an array between 1 and 200"),
  body("items.*.productId")
    .exists()
    .withMessage("items.productId is required")
    .bail()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("items.productId must be a valid ObjectId"),
  body("items.*.quantity")
    .exists()
    .withMessage("items.quantity is required")
    .bail()
    .isInt({ min: 1, max: 9999 })
    .withMessage("items.quantity must be an integer between 1 and 9999"),
  body("deliveryCapacityPolicy")
    .exists()
    .withMessage("deliveryCapacityPolicy is required")
    .bail()
    .isIn(["AUTO_NEXT_AVAILABLE", "CANCEL_IF_FULL"])
    .withMessage("deliveryCapacityPolicy must be AUTO_NEXT_AVAILABLE or CANCEL_IF_FULL"),
  body("pickupLocation")
    .exists()
    .withMessage("pickupLocation is required")
    .bail()
    .isString()
    .withMessage("pickupLocation must be a string")
    .bail()
    .trim()
    .isLength({ min: 5, max: 300 })
    .withMessage("pickupLocation must be between 5 and 300 characters"),
  body("contactPhone")
    .exists()
    .withMessage("contactPhone is required")
    .bail()
    .isString()
    .withMessage("contactPhone must be a string")
    .bail()
    .trim()
    .matches(/^[+0-9\s\-()]{6,30}$/)
    .withMessage("contactPhone format is invalid"),
  header("idempotency-key")
    .optional()
    .isString()
    .withMessage("idempotency-key must be a string")
    .bail()
    .isLength({ min: 8, max: 128 })
    .withMessage("idempotency-key length must be between 8 and 128"),
  handleValidation
];

const validateListMySales = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  handleValidation
];

const VALID_FULFILLMENT_STATUS = [
  "SCHEDULED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REJECTED"
];

const validateListBoutiqueOrders = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("status")
    .optional()
    .isIn(VALID_FULFILLMENT_STATUS)
    .withMessage(`status must be one of: ${VALID_FULFILLMENT_STATUS.join(", ")}`),
  query("boutiqueId")
    .optional()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("boutiqueId must be a valid ObjectId"),
  handleValidation
];

const validateMySaleId = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("id must be a valid ObjectId"),
  handleValidation
];

const validateBoutiqueSaleId = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("id must be a valid ObjectId"),
  query("boutiqueId")
    .optional()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("boutiqueId must be a valid ObjectId"),
  handleValidation
];

const validateBoutiqueOrderUpdate = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("id must be a valid ObjectId"),
  body("fulfillmentStatus")
    .exists()
    .withMessage("fulfillmentStatus is required")
    .bail()
    .isIn(VALID_FULFILLMENT_STATUS)
    .withMessage(`fulfillmentStatus must be one of: ${VALID_FULFILLMENT_STATUS.join(", ")}`),
  body("fulfillmentNote")
    .optional()
    .isString()
    .withMessage("fulfillmentNote must be a string")
    .bail()
    .isLength({ max: 500 })
    .withMessage("fulfillmentNote must be at most 500 chars"),
  body("deliveryDate")
    .optional()
    .isISO8601()
    .withMessage("deliveryDate must be a valid ISO8601 date"),
  body("boutiqueId")
    .optional()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("boutiqueId must be a valid ObjectId"),
  handleValidation
];

module.exports = {
  validateCheckout,
  validateListMySales,
  validateMySaleId,
  validateListBoutiqueOrders,
  validateBoutiqueSaleId,
  validateBoutiqueOrderUpdate
};
