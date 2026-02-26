const express = require('express');
const { readPublicGeneralSettings } = require('./settings.controller');

const router = express.Router();

router.get('/public', readPublicGeneralSettings);

module.exports = router;
