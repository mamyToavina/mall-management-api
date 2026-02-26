const { Router } = require('express');
const {
  createBoutique,
  listPublic,
  getPublicById,
  listPublicProducts
} = require('./boutique.controller.js');
const {
  postBoutiqueRenewalRequest,
  getBoutiqueRenewalRequests
} = require('../contracts/contract.controller.js');
const { protect } = require('../../middlewares/auth.middleware.js');
const { authorize } = require('../../middlewares/role.middleware.js');

const router = Router();

router.get('/public', listPublic);
router.get('/public/:id', getPublicById);
router.get('/public/:id/products', listPublicProducts);

router.post('/', protect, authorize('ADMIN'), createBoutique);

router.get(
  '/contract-renewals',
  protect,
  authorize('BOUTIQUE'),
  getBoutiqueRenewalRequests
);

router.post(
  '/contract-renewals',
  protect,
  authorize('BOUTIQUE'),
  postBoutiqueRenewalRequest
);

module.exports = router;
