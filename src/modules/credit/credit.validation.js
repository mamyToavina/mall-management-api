const { body, query, param, header, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const VALID_VALUES = [20000, 100000, 400000];
const VALID_STATUSES = ["active", "used", "expired"];
const VALID_SORT_FIELDS = ["createdAt", "value", "expiresAt", "usedAt"];

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((entry) => ({
        field: entry.path,
        message: entry.msg
      }))
    });
  }
  next();
};

const validateGenerate = [
  body("value")
    .exists()
    .withMessage("value is required")
    .bail()
    .isInt()
    .withMessage("value must be an integer")
    .bail()
    .custom((value) => VALID_VALUES.includes(Number(value)))
    .withMessage(`value must be one of: ${VALID_VALUES.join(", ")}`),
  body("quantity")
    .exists()
    .withMessage("quantity is required")
    .bail()
    .isInt({ min: 1, max: 1000 })
    .withMessage("quantity must be an integer between 1 and 1000"),
  handleValidation
];

const validatePrint = [
  param("id")
    .exists()
    .withMessage("id is required")
    .bail()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("id must be a valid ObjectId"),
  handleValidation
];

const validateUse = [
  body("code")
    .exists()
    .withMessage("code is required")
    .bail()
    .isString()
    .withMessage("code must be a string")
    .bail()
    .trim()
    .isLength({ min: 8, max: 128 })
    .withMessage("code length must be between 8 and 128 characters"),
  header("idempotency-key")
    .exists()
    .withMessage("idempotency-key header is required")
    .bail()
    .isString()
    .withMessage("idempotency-key must be a string")
    .bail()
    .trim()
    .isLength({ min: 8, max: 255 })
    .withMessage("idempotency-key length must be between 8 and 255"),
  handleValidation
];

const filterValidationRules = [
  query("status")
    .optional()
    .custom((value) => VALID_STATUSES.includes(String(value)))
    .withMessage(`status must be one of: ${VALID_STATUSES.join(", ")}`),
  query("value")
    .optional()
    .isInt()
    .withMessage("value must be an integer")
    .bail()
    .custom((value) => VALID_VALUES.includes(Number(value)))
    .withMessage(`value must be one of: ${VALID_VALUES.join(", ")}`),
  query("createdBy")
    .optional()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("createdBy must be a valid ObjectId"),
  query("usedBy")
    .optional()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("usedBy must be a valid ObjectId"),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO date")
];

const validateList = [
  ...filterValidationRules,
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage("limit must be between 1 and 200"),
  query("sortBy")
    .optional()
    .custom((value) => VALID_SORT_FIELDS.includes(String(value)))
    .withMessage(`sortBy must be one of: ${VALID_SORT_FIELDS.join(", ")}`),
  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("sortOrder must be asc or desc"),
  handleValidation
];

const validateStats = [...filterValidationRules, handleValidation];

module.exports = {
  VALID_VALUES,
  validateGenerate,
  validatePrint,
  validateUse,
  validateList,
  validateStats
};
