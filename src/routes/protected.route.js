const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");

router.get(
  "/admin",
  auth,
  authorize("admin"),
  (req, res) => {
    res.json({ message: "Welcome Admin" });
  }
);

router.get(
  "/boutique",
  auth,
  authorize("boutique"),
  (req, res) => {
    res.json({ message: "Welcome Boutique" });
  }
);

router.get(
  "/acheteur",
  auth,
  authorize("acheteur", "admin"),
  (req, res) => {
    res.json({ message: "Welcome Acheteur" });
  }
);

module.exports = router;
