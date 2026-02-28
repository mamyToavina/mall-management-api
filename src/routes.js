const { Router } = require('express');
const path = require('path');
const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const boxRoutes = require('./modules/boxes/box.route');
const productRoutes = require('./modules/products/product.route');
const billingRoutes = require('./modules/billing/billing.route');
const activityRoutes = require('./modules/activities/activity.routes');
const saleRoutes = require('./modules/sales/sale.routes');
const boutiqueRoutes = require('./modules/boutique/boutique.route');
const reviewRoutes = require('./modules/reviews/review.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const publicRoutes = require('./modules/public/public.routes');

const userRoutes = require(path.resolve(__dirname, './modules/users/user.routes.js'));
const creditRoutes = require(path.resolve(__dirname, './modules/credit/credit.routes.js'));

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/boxes', boxRoutes);
router.use('/products', productRoutes);
router.use('/boutiques', boutiqueRoutes);
router.use('/billing', billingRoutes);
router.use('/credit', creditRoutes);
router.use('/activities', activityRoutes);
router.use('/sales', saleRoutes);
router.use('/reviews', reviewRoutes);
router.use('/settings', settingsRoutes);
router.use('/public', publicRoutes);

module.exports = router;
