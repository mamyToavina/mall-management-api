const express = require('express');
const { createTenant } = require('./admin.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

router.post(
  '/create-tenant',
  protect,
  authorize('ADMIN'),
  createTenant
);

module.exports = router;
