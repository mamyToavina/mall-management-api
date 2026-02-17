const { Router } = require('express')
const { createBoutique } = require('./boutique.controller.js')
const auth = require('../../middlewares/auth.middleware.js')
const checkRole = require('../../middlewares/role.middleware.js')

const router = Router()

router.post('/', auth, checkRole('ADMIN'), createBoutique)

module.exports = router
