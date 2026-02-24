const express = require('express');
const controller = require('./product.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');
const { FOLDERS } = require('../../config/upload');
const { createImageUploader } = require('../../middlewares/upload.middleware');

const router = express.Router();

const uploadProductImage = createImageUploader({
  subFolder: FOLDERS.product,
  fieldName: 'image',
  maxSizeMB: 5
});

router.get('/public/promotions', controller.listPublicPromotions);

router.use(protect, authorize('BOUTIQUE'));

router.get('/', controller.listMine);
router.get('/:id', controller.getMineById);
router.get('/:id/stock-movements', controller.listStockMovements);

router.post('/', uploadProductImage, controller.createMine);
router.post('/:id/images', uploadProductImage, controller.addImageMine);
router.patch('/:id', controller.updateMine);
router.patch('/:id/images/replace', uploadProductImage, controller.replaceImageMine);
router.patch('/:id/stock', controller.adjustStock);
router.patch('/:id/promotion', controller.setPromotion);
router.delete('/:id/images', controller.removeImageMine);
router.delete('/:id/promotion', controller.clearPromotion);
router.delete('/:id', controller.deleteMine);

module.exports = router;
