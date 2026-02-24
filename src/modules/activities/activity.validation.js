const { body, query, param, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map((entry) => ({
        field: entry.path,
        message: entry.msg,
      })),
    });
  }
  next();
};

const validatePublicUpcoming = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage("limit must be between 1 and 20"),
  handleValidation,
];

const validateListForManagement = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be >= 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("published")
    .optional()
    .isIn(["true", "false"])
    .withMessage("published must be true or false"),
  query("upcoming")
    .optional()
    .isIn(["true", "false"])
    .withMessage("upcoming must be true or false"),
  handleValidation,
];

const idRule = param("id")
  .custom((value) => mongoose.Types.ObjectId.isValid(value))
  .withMessage("id must be a valid ObjectId");

const validateId = [idRule, handleValidation];

const validateCreate = [
  body("title")
    .exists()
    .withMessage("title is required")
    .bail()
    .isString()
    .withMessage("title must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("title cannot be empty"),
  body("description")
    .exists()
    .withMessage("description is required")
    .bail()
    .isString()
    .withMessage("description must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("description cannot be empty"),
  body("dateIso")
    .exists()
    .withMessage("dateIso is required")
    .bail()
    .isISO8601()
    .withMessage("dateIso must be a valid ISO date"),
  body("durationDays")
    .exists()
    .withMessage("durationDays is required")
    .bail()
    .isInt({ min: 1, max: 365 })
    .withMessage("durationDays must be an integer between 1 and 365"),
  body("location")
    .exists()
    .withMessage("location is required")
    .bail()
    .isString()
    .withMessage("location must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("location cannot be empty"),
  body("tag")
    .exists()
    .withMessage("tag is required")
    .bail()
    .isString()
    .withMessage("tag must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("tag cannot be empty"),
  body("isPublished")
    .optional()
    .isIn(["true", "false", true, false])
    .withMessage("isPublished must be true or false"),
  handleValidation,
];

const validateUpdate = [
  idRule,
  body("title")
    .optional()
    .isString()
    .withMessage("title must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("title cannot be empty"),
  body("description")
    .optional()
    .isString()
    .withMessage("description must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("description cannot be empty"),
  body("dateIso")
    .optional()
    .isISO8601()
    .withMessage("dateIso must be a valid ISO date"),
  body("durationDays")
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage("durationDays must be an integer between 1 and 365"),
  body("location")
    .optional()
    .isString()
    .withMessage("location must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("location cannot be empty"),
  body("tag")
    .optional()
    .isString()
    .withMessage("tag must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("tag cannot be empty"),
  body("isPublished")
    .optional()
    .isIn(["true", "false", true, false])
    .withMessage("isPublished must be true or false"),
  handleValidation,
];

module.exports = {
  validatePublicUpcoming,
  validateListForManagement,
  validateId,
  validateCreate,
  validateUpdate,
};
