const express = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');
const {
  upsertMyReview,
  listMyReviews,
  listReviewsByUserForAdmin
} = require('./review.controller');

const router = express.Router();

router.use(protect, authorize('USER', 'ADMIN'));
router.post('/boutiques/:boutiqueId', upsertMyReview);
router.get('/me', listMyReviews);
router.get('/users/:userId', authorize('ADMIN'), listReviewsByUserForAdmin);

module.exports = router;
