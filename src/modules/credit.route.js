const express = require("express");
const creditController = require("./credit.controller");

const router = express.Router();

router.post(
  "/generate",
  creditController.generate
);

router.patch(
  "/print/:id",
  creditController.print
);

router.post(
  "/use",
  creditController.use
);

router.get(
  "/",
  creditController.list
);

module.exports = router;
