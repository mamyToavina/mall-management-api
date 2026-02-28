const express = require('express');
const { searchPublic } = require('./public.controller');

const router = express.Router();

router.get('/search', searchPublic);

module.exports = router;
