const express = require('express');
const { login, refresh, logout, completeBoutiqueProfile } = require('./auth.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { FOLDERS } = require('../../config/upload');
const { createImageUploader } = require('../../middlewares/upload.middleware');

const router = express.Router();

const uploadBoutiqueLogo = createImageUploader({
  subFolder: FOLDERS.boutique,
  fieldName: 'logo',
  maxSizeMB: 5
});

router.post('/login', login);
router.post('/complete-boutique-profile', uploadBoutiqueLogo, completeBoutiqueProfile);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);

module.exports = router;
