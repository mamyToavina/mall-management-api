const User = require('./user.model.js');
const Sale = require('../sales/sale.model');
const Credit = require('../credit/credit.model');
const Boutique = require('../boutique/boutique.model');
const BoutiqueReview = require('../reviews/review.model');
const paginate = require('../../utils/pagination.js');
const { sendAccountBlockedEmail } = require('../../utils/mailer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_GENDERS = ['Male', 'Female', 'Other'];
const MAX_BLOCK_REASON_LENGTH = 500;

const formatUser = (user) => ({
  id: user._id,
  pseudo: user.pseudo,
  email: user.email,
  avatar: user.avatar || null,
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  gender: user.gender || undefined,
  role: user.role,
  status: user.status,
  credit: Number(user.credit || 0)
});

const cleanupUploadedFile = (file) => {
  if (!file?.path) return;
  if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
};

const cleanupAvatarByPath = (avatarPath) => {
  if (!avatarPath || typeof avatarPath !== 'string') return;
  if (!avatarPath.startsWith('/uploads/')) return;
  const absolutePath = path.join(process.cwd(), avatarPath.replace(/^\//, ''));
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
};

const parseAmount = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const normalizeHistoryType = (value) => {
  const raw = String(value || 'ALL').trim().toUpperCase();
  if (raw === 'CREDIT') return 'CREDIT_USAGE';
  if (raw === 'PURCHASE' || raw === 'REVIEW' || raw === 'CREDIT_USAGE') return raw;
  return 'ALL';
};

const registerUser = async (req, res) => {
  try {
    const { email, password, pseudo, firstName, lastName, gender } = req.body;

    if (!email || !password || !pseudo) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Pseudo, email et mot de passe obligatoires' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Email deja utilise' });
    }

    const user = await User.create({
      pseudo,
      email,
      firstName,
      lastName,
      gender,
      password,
      role: 'USER',
      status: 'ACTIVE',
      isAccountCompleted: true,
      avatar: req.file ? `/uploads/users/${req.file.filename}` : null
    });

    res.status(201).json({
      message: 'Compte cree',
      user: {
        id: user._id,
        pseudo: user.pseudo,
        email: user.email,
        avatar: user.avatar,
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        role: user.role,
        status: user.status
      }
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (err.code === 11000) {
      return res.status(400).json({ message: 'Email deja utilise' });
    }
    return res.status(500).json({ message: err.message });
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;

    const query = {
      role: 'USER',
      ...(status && { status }),
      ...(search && {
        $or: [{ pseudo: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }]
      })
    };

    const data = await paginate(User, query, page, limit);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    return res.json(user);
  } catch (err) {
    return next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    return res.json({ user: formatUser(user) });
  } catch (err) {
    return next(err);
  }
};

const updateMe = async (req, res, next) => {
  let avatarPersisted = false;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      cleanupUploadedFile(req.file);
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const errors = [];
    const has = (field) => Object.prototype.hasOwnProperty.call(req.body, field);

    if (has('pseudo')) {
      const pseudo = String(req.body.pseudo || '').trim();
      if (!pseudo) {
        errors.push({ field: 'pseudo', message: 'Le pseudo est obligatoire.' });
      } else {
        const existingPseudo = await User.findOne({ pseudo, _id: { $ne: user._id } });
        if (existingPseudo) {
          errors.push({ field: 'pseudo', message: 'Ce pseudo est deja utilise.' });
        }
      }
    }

    if (has('email')) {
      const email = String(req.body.email || '').trim();
      if (!email || !EMAIL_REGEX.test(email)) {
        errors.push({ field: 'email', message: 'L email n est pas valide.' });
      } else {
        const existingEmail = await User.findOne({ email, _id: { $ne: user._id } });
        if (existingEmail) {
          errors.push({ field: 'email', message: 'Cet email est deja utilise.' });
        }
      }
    }

    if (has('gender')) {
      const gender = String(req.body.gender || '').trim();
      if (gender && !ALLOWED_GENDERS.includes(gender)) {
        errors.push({ field: 'gender', message: 'Le genre selectionne est invalide.' });
      }
    }

    const nextPassword = String(req.body.newPassword || '');
    const currentPassword = String(req.body.currentPassword || '');
    if (nextPassword) {
      if (!currentPassword) {
        errors.push({
          field: 'currentPassword',
          message: 'Le mot de passe actuel est obligatoire pour changer le mot de passe.'
        });
      }
      if (nextPassword.length < 8) {
        errors.push({
          field: 'newPassword',
          message: 'Le nouveau mot de passe doit contenir au moins 8 caracteres.'
        });
      }
    }

    if (errors.length > 0) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({
        message: 'Veuillez corriger les champs invalides.',
        errors
      });
    }

    if (has('pseudo')) user.pseudo = String(req.body.pseudo || '').trim();
    if (has('email')) user.email = String(req.body.email || '').trim();
    if (has('firstName')) user.firstName = String(req.body.firstName || '').trim();
    if (has('lastName')) user.lastName = String(req.body.lastName || '').trim();
    if (has('gender')) {
      const gender = String(req.body.gender || '').trim();
      user.gender = gender || undefined;
    }

    if (nextPassword) {
      const passwordMatches = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatches) {
        cleanupUploadedFile(req.file);
        return res.status(400).json({
          message: 'Veuillez corriger les champs invalides.',
          errors: [{ field: 'currentPassword', message: 'Le mot de passe actuel est incorrect.' }]
        });
      }
      user.password = nextPassword;
    }

    const previousAvatar = user.avatar;
    if (req.file) {
      user.avatar = `/uploads/users/${req.file.filename}`;
    }

    await user.save();
    avatarPersisted = !!req.file;

    if (req.file && previousAvatar && previousAvatar !== user.avatar) {
      cleanupAvatarByPath(previousAvatar);
    }

    return res.json({
      message: 'Profil mis a jour.',
      user: formatUser(user)
    });
  } catch (err) {
    if (req.file && !avatarPersisted) cleanupUploadedFile(req.file);
    return next(err);
  }
};

const blockUser = async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason || reason.length < 3 || reason.length > MAX_BLOCK_REASON_LENGTH) {
      return res.status(400).json({
        message: `Le motif est obligatoire (3 a ${MAX_BLOCK_REASON_LENGTH} caracteres).`
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    user.status = 'BLOCKED';
    user.blockedAt = new Date();
    user.blockedReason = reason;
    await user.save();

    try {
      if (user.email) {
        await sendAccountBlockedEmail({
          to: user.email,
          pseudo: user.pseudo,
          reason,
          blockedAt: user.blockedAt
        });
      }
    } catch (mailError) {
      console.error('[users:blockUser] email send failed', mailError?.message || mailError);
    }

    return res.json(user);
  } catch (err) {
    return next(err);
  }
};

const unblockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'ACTIVE', blockedAt: null, blockedReason: null },
      { new: true }
    );
    return res.json(user);
  } catch (err) {
    return next(err);
  }
};

const getUserHistory = async (req, res, next) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'ID utilisateur invalide.' });
    }

    const user = await User.findById(userId).select('_id pseudo email firstName lastName');
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 20));
    const type = normalizeHistoryType(req.query.type);
    const search = String(req.query.search || '').trim().toLowerCase();
    const from = parseDateStart(req.query.from);
    const to = parseDateEnd(req.query.to);
    const minAmount = parseAmount(req.query.minAmount);
    const maxAmount = parseAmount(req.query.maxAmount);
    const rating = req.query.rating !== undefined ? parseAmount(req.query.rating) : null;
    const boutiqueId = String(req.query.boutiqueId || '').trim();
    const hasBoutiqueFilter = boutiqueId && mongoose.Types.ObjectId.isValid(boutiqueId);

    const creditQuery = { usedBy: user._id };
    const saleQuery = { buyer: user._id };
    const reviewQuery = { user: user._id };

    if (from || to) {
      const dateRange = {};
      if (from) dateRange.$gte = from;
      if (to) dateRange.$lte = to;
      creditQuery.usedAt = dateRange;
      saleQuery.placedAt = dateRange;
      reviewQuery.createdAt = dateRange;
    }

    if (hasBoutiqueFilter) {
      saleQuery['boutiqueBreakdown.boutique'] = new mongoose.Types.ObjectId(boutiqueId);
      reviewQuery.boutique = new mongoose.Types.ObjectId(boutiqueId);
    }

    const tasks = [];
    if (type === 'ALL' || type === 'CREDIT_USAGE') {
      tasks.push(
        Credit.find(creditQuery)
          .select('_id code value usedAt status updatedAt createdAt')
          .sort({ usedAt: -1, createdAt: -1 })
          .lean()
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    if (type === 'ALL' || type === 'PURCHASE') {
      tasks.push(
        Sale.find(saleQuery)
          .select('reference totals items boutiqueBreakdown placedAt createdAt status')
          .sort({ placedAt: -1, createdAt: -1 })
          .lean()
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    if (type === 'ALL' || type === 'REVIEW') {
      tasks.push(
        BoutiqueReview.find(reviewQuery)
          .select('_id boutique rating comment createdAt updatedAt')
          .sort({ createdAt: -1 })
          .lean()
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    const [credits, sales, reviews] = await Promise.all(tasks);

    const allBoutiqueIds = new Set();
    for (const sale of sales) {
      for (const row of sale.boutiqueBreakdown || []) {
        if (row?.boutique) allBoutiqueIds.add(String(row.boutique));
      }
    }
    for (const review of reviews) {
      if (review?.boutique) allBoutiqueIds.add(String(review.boutique));
    }

    const boutiques = await Boutique.find({
      _id: { $in: [...allBoutiqueIds].filter((id) => mongoose.Types.ObjectId.isValid(id)) }
    })
      .select('_id name')
      .lean();

    const boutiqueMap = new Map(boutiques.map((item) => [String(item._id), item.name]));

    let entries = [];

    entries = entries.concat(
      credits.map((credit) => ({
        id: `credit:${credit._id}`,
        entryType: 'CREDIT_USAGE',
        title: `Utilisation credit ${credit.code}`,
        occurredAt: credit.usedAt || credit.updatedAt || credit.createdAt,
        amount: Number(credit.value || 0),
        rating: null,
        boutiqueName: null,
        reference: credit.code,
        details: {
          code: credit.code,
          status: credit.status,
          value: Number(credit.value || 0)
        }
      }))
    );

    entries = entries.concat(
      sales.map((sale) => {
        const quantities = (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const boutiqueNames = [...new Set((sale.boutiqueBreakdown || [])
          .map((row) => boutiqueMap.get(String(row.boutique)) || row.boutiqueName)
          .filter(Boolean))];

        return {
          id: `sale:${sale._id}`,
          entryType: 'PURCHASE',
          title: `Achat ${sale.reference}`,
          occurredAt: sale.placedAt || sale.createdAt,
          amount: Number(sale?.totals?.grandTotal || 0),
          rating: null,
          boutiqueName: boutiqueNames.join(', ') || null,
          reference: sale.reference,
          details: {
            reference: sale.reference,
            quantityTotal: quantities,
            itemCount: Number(sale?.totals?.itemCount || 0),
            grandTotal: Number(sale?.totals?.grandTotal || 0),
            status: sale.status,
            boutiques: boutiqueNames,
            items: (sale.items || []).map((item) => ({
              productName: item.productName,
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPrice || 0),
              lineTotal: Number(item.lineTotal || 0)
            }))
          }
        };
      })
    );

    entries = entries.concat(
      reviews.map((review) => {
        const bName = boutiqueMap.get(String(review.boutique)) || null;
        return {
          id: `review:${review._id}`,
          entryType: 'REVIEW',
          title: 'Avis boutique',
          occurredAt: review.createdAt,
          amount: null,
          rating: Number(review.rating || 0),
          boutiqueName: bName,
          reference: null,
          details: {
            boutiqueId: review.boutique,
            boutiqueName: bName,
            rating: Number(review.rating || 0),
            comment: review.comment || ''
          }
        };
      })
    );

    if (rating !== null) {
      entries = entries.filter((entry) => entry.entryType !== 'REVIEW' || Number(entry.rating) === Number(rating));
    }

    if (minAmount !== null) {
      entries = entries.filter((entry) => entry.amount === null || Number(entry.amount) >= minAmount);
    }

    if (maxAmount !== null) {
      entries = entries.filter((entry) => entry.amount === null || Number(entry.amount) <= maxAmount);
    }

    if (search) {
      entries = entries.filter((entry) => {
        const haystacks = [
          entry.title,
          entry.boutiqueName,
          entry.reference,
          entry.details?.comment,
          entry.details?.code
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        return haystacks.some((value) => value.includes(search));
      });
    }

    entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    const total = entries.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * limit;
    const data = entries.slice(start, start + limit);

    const summary = entries.reduce(
      (acc, entry) => {
        acc.byType[entry.entryType] = (acc.byType[entry.entryType] || 0) + 1;
        if (typeof entry.amount === 'number') acc.totalAmount += Number(entry.amount);
        return acc;
      },
      { totalAmount: 0, byType: { CREDIT_USAGE: 0, PURCHASE: 0, REVIEW: 0 } }
    );

    return res.json({
      data,
      meta: {
        total,
        page: safePage,
        limit,
        pages
      },
      summary
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  registerUser,
  getAllUsers,
  getUserById,
  getMe,
  updateMe,
  blockUser,
  unblockUser,
  getUserHistory
};
