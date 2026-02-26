const express = require('express');
const { createTenant } = require('./admin.controller');
const { getContracts, patchContractStatus } = require('../contracts/contract.controller');
const { readGeneralSettings, updateGeneralSettings } = require('../settings/settings.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

router.post(
  '/create-tenant',
  protect,
  authorize('ADMIN'),
  createTenant
);

router.get(
  '/contracts',
  protect,
  authorize('ADMIN'),
  getContracts
);

router.patch(
  '/contracts/:id/status',
  protect,
  authorize('ADMIN'),
  patchContractStatus
);

router.get(
  '/settings/general',
  protect,
  authorize('ADMIN'),
  readGeneralSettings
);

router.put(
  '/settings/general',
  protect,
  authorize('ADMIN'),
  updateGeneralSettings
);

module.exports = router;
