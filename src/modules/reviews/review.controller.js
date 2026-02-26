const mongoose = require('mongoose');
const Boutique = require('../boutique/boutique.model');
const BoutiqueReview = require('./review.model');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
};

const parseDateStart = (value) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
};

const parseDateEnd = (value) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
};

const formatPublicReview = (review) => ({
  id: String(review._id),
  rating: Number(review.rating || 0),
  comment: review.comment || '',
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  author: {
    id: review.user?._id ? String(review.user._id) : null,
    pseudo: review.user?.pseudo || 'Utilisateur',
    avatar: review.user?.avatar || null
  }
});

const listPublicReviewsByBoutique = async (req, res, next) => {
  try {
    const boutiqueId = String(req.params.boutiqueId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(boutiqueId)) {
      return res.status(400).json({ message: 'Boutique invalide.' });
    }

    const boutique = await Boutique.findById(boutiqueId).select('_id status');
    if (!boutique) return res.status(404).json({ message: 'Boutique introuvable.' });
    if (boutique.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Cette boutique est indisponible pour les avis.' });
    }

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
    const skip = (page - 1) * limit;

    const query = { boutique: boutique._id };

    const [data, total] = await Promise.all([
      BoutiqueReview.find(query)
        .populate('user', 'pseudo avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BoutiqueReview.countDocuments(query)
    ]);

    return res.json({
      data: data.map(formatPublicReview),
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (err) {
    return next(err);
  }
};

const upsertMyReview = async (req, res, next) => {
  try {
    const boutiqueId = String(req.params.boutiqueId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(boutiqueId)) {
      return res.status(400).json({ message: 'Boutique invalide.' });
    }

    const boutique = await Boutique.findById(boutiqueId).select('_id name status');
    if (!boutique) return res.status(404).json({ message: 'Boutique introuvable.' });
    if (boutique.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Cette boutique est indisponible pour les avis.' });
    }

    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim();

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return res.status(400).json({ message: 'La note doit etre comprise entre 0 et 5.' });
    }
    if (comment.length > 1000) {
      return res.status(400).json({ message: 'L avis est trop long (1000 caracteres max).' });
    }

    const payload = {
      user: req.user.id,
      boutique: boutique._id,
      rating,
      comment
    };

    const review = await BoutiqueReview.findOneAndUpdate(
      { user: req.user.id, boutique: boutique._id },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      message: 'Avis enregistre.',
      data: review
    });
  } catch (err) {
    return next(err);
  }
};

const listMyReviews = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
    const skip = (page - 1) * limit;

    const query = { user: req.user.id };

    const from = parseDateStart(req.query.from);
    const to = parseDateEnd(req.query.to);
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = from;
      if (to) query.createdAt.$lte = to;
    }

    if (req.query.rating !== undefined && req.query.rating !== '') {
      const rating = Number(req.query.rating);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return res.status(400).json({ message: 'rating invalide.' });
      }
      query.rating = rating;
    }

    const [data, total] = await Promise.all([
      BoutiqueReview.find(query)
        .populate('boutique', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BoutiqueReview.countDocuments(query)
    ]);

    return res.json({
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (err) {
    return next(err);
  }
};

const listReviewsByUserForAdmin = async (req, res, next) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Utilisateur invalide.' });
    }

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
    const skip = (page - 1) * limit;

    const query = { user: userId };

    const [data, total] = await Promise.all([
      BoutiqueReview.find(query)
        .populate('boutique', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BoutiqueReview.countDocuments(query)
    ]);

    return res.json({
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listPublicReviewsByBoutique,
  upsertMyReview,
  listMyReviews,
  listReviewsByUserForAdmin
};
