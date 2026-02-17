const { Router } = require('express')
const path = require('path');
const authRoutes = require('./modules/auth/auth.routes');

const router = Router()

router.use('/auth', authRoutes);

module.exports = router
