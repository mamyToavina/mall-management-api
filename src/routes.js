/*const { Router } = require('express')
const path = require('path');
const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const boxRoutes = require('./modules/boxes/box.route');

const userRoutes = require(path.resolve(__dirname, './modules/users/user.routes.js'));
const creditRoutes = require(path.resolve(__dirname, './modules/credit.route.js'));

const router = Router()

router.use('/auth', authRoutes);
router.use('/users', userRoutes)
router.use('/admin', adminRoutes);
router.use('/boxes', boxRoutes);
router.use('/credit', creditRoutes);

module.exports = router*/

const { Router } = require('express');
const path = require('path');
const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const boxRoutes = require('./modules/boxes/box.route');
const productRoutes = require('./modules/products/product.route');
const billingRoutes = require('./modules/billing/billing.route');

const userRoutes = require(path.resolve(__dirname, './modules/users/user.routes.js'));
const creditRoutes = require(path.resolve(__dirname, './modules/credit.route.js'));

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/boxes', boxRoutes);
router.use('/products', productRoutes);
router.use('/billing', billingRoutes);
router.use('/credit', creditRoutes);

module.exports = router;

