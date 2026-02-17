const express = require('express');
const {login, refresh, logout } = require('./auth.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);

module.exports = router;
