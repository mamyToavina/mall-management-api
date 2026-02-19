const express = require('express');
const { login, refresh, logout, completeBoutiqueProfile } = require('./auth.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/complete-boutique-profile', completeBoutiqueProfile);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);

module.exports = router;
