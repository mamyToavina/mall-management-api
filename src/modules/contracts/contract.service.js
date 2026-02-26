const mongoose = require('mongoose');
const Contract = require('./contract.model');
const ContractRenewalRequest = require('./contract-renewal-request.model');
const Box = require('../boxes/box.model');
const User = require('../users/user.model');
const Boutique = require('../boutique/boutique.model');
const BillingCycle = require('../billing/billing-cycle.model');

const MAX_LIMIT = 200;
const MAX_AMOUNT = 1000000000;

const createAppError = (message, statusCode = 400, errors = []) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors.length > 0) {
    err.errors = errors;
  }
  return err;
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, '').replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const addMonths = (fromDate, months) => {
  const endDate = new Date(fromDate);
  endDate.setMonth(endDate.getMonth() + Number(months || 0));
  return endDate;
};

const lineRemaining = (cycle, key) => {
  const map = {
    rent: ['rentDue', 'rentAutoPaid', 'rentManualPaid'],
    electricity: ['electricityDue', 'electricityAutoPaid', 'electricityManualPaid'],
    penalty: ['penaltyDue', 'penaltyAutoPaid', 'penaltyManualPaid']
  };
  const [dueKey, autoKey, manualKey] = map[key];
  const due = Number(cycle?.[dueKey]) || 0;
  const paid = (Number(cycle?.[autoKey]) || 0) + (Number(cycle?.[manualKey]) || 0);
  return Math.max(0, due - paid);
};

const mapContractStatusFilter = (status) => {
  if (!status) return {};
  const allowed = ['ACTIVE', 'SCHEDULED', 'TERMINATED', 'EXPIRED'];
  if (allowed.includes(status)) {
    return { status };
  }
  return null;
};

const mapRenewalStatusFilter = (status) => {
  if (!status) return {};
  const upper = String(status).trim().toUpperCase();
  const allowed = ['PENDING', 'APPROVED', 'REJECTED'];
  if (allowed.includes(upper)) {
    return { adminDecision: upper };
  }
  return null;
};

const sanitizeTerms = (rawTerms = {}, fallbackTerms = {}) => {
  const errors = [];

  const durationMonthsRaw = parseNumber(rawTerms.durationMonths);
  const durationMonths =
    durationMonthsRaw !== undefined ? durationMonthsRaw : Number(fallbackTerms.durationMonths) || 0;
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 240) {
    errors.push({
      field: 'durationMonths',
      message: 'Duree invalide (1 a 240 mois).'
    });
  }

  const monthlyRentRaw = parseNumber(rawTerms.monthlyRent);
  const monthlyRent = monthlyRentRaw !== undefined ? monthlyRentRaw : Number(fallbackTerms.monthlyRent) || 0;
  if (!Number.isFinite(monthlyRent) || monthlyRent < 0 || monthlyRent > MAX_AMOUNT) {
    errors.push({
      field: 'monthlyRent',
      message: `Loyer invalide (0 a ${MAX_AMOUNT}).`
    });
  }

  const penaltyFeeRaw = parseNumber(rawTerms.penaltyFee);
  const penaltyFee = penaltyFeeRaw !== undefined ? penaltyFeeRaw : Number(fallbackTerms.penaltyFee) || 0;
  if (!Number.isFinite(penaltyFee) || penaltyFee < 0 || penaltyFee > MAX_AMOUNT) {
    errors.push({
      field: 'penaltyFee',
      message: `Frais de penalite invalide (0 a ${MAX_AMOUNT}).`
    });
  }

  const penaltyGrowthFactorRaw = parseNumber(rawTerms.penaltyGrowthFactor);
  const penaltyGrowthFactor =
    penaltyGrowthFactorRaw !== undefined
      ? penaltyGrowthFactorRaw
      : Math.max(1, Number(fallbackTerms.penaltyGrowthFactor) || 1);
  if (!Number.isFinite(penaltyGrowthFactor) || penaltyGrowthFactor < 1 || penaltyGrowthFactor > 1000) {
    errors.push({
      field: 'penaltyGrowthFactor',
      message: 'Coefficient de penalite invalide (1 a 1000).'
    });
  }

  const terminationFeeRaw = parseNumber(rawTerms.terminationFee);
  const terminationFee =
    terminationFeeRaw !== undefined ? terminationFeeRaw : Number(fallbackTerms.terminationFee) || 0;
  if (!Number.isFinite(terminationFee) || terminationFee < 0 || terminationFee > MAX_AMOUNT) {
    errors.push({
      field: 'terminationFee',
      message: `Frais de rupture invalide (0 a ${MAX_AMOUNT}).`
    });
  }

  const commissionRaw = parseNumber(rawTerms.onlineSalesCommissionPercent);
  const onlineSalesCommissionPercent =
    commissionRaw !== undefined ? commissionRaw : Number(fallbackTerms.onlineSalesCommissionPercent) || 0;
  if (
    !Number.isFinite(onlineSalesCommissionPercent) ||
    onlineSalesCommissionPercent < 0 ||
    onlineSalesCommissionPercent > 100
  ) {
    errors.push({
      field: 'onlineSalesCommissionPercent',
      message: 'Commission invalide (0 a 100).'
    });
  }

  const notes = normalizeString(rawTerms.notes || fallbackTerms.notes || '');
  if (notes.length > 1000) {
    errors.push({
      field: 'notes',
      message: 'Note trop longue (1000 caracteres max).'
    });
  }

  if (errors.length > 0) {
    throw createAppError('Parametres du renouvellement invalides.', 400, errors);
  }

  return {
    durationMonths,
    monthlyRent,
    penaltyFee,
    penaltyGrowthFactor,
    terminationFee,
    onlineSalesCommissionPercent,
    notes
  };
};

const formatRenewalRequest = (doc) => ({
  _id: doc._id,
  boutique: doc.boutique
    ? {
        _id: doc.boutique._id,
        name: doc.boutique.name || ''
      }
    : null,
  requesterUser: doc.requesterUser
    ? {
        _id: doc.requesterUser._id,
        firstName: doc.requesterUser.firstName || '',
        lastName: doc.requesterUser.lastName || '',
        email: doc.requesterUser.email || ''
      }
    : null,
  currentContract: doc.currentContract
    ? {
        _id: doc.currentContract._id,
        startDate: doc.currentContract.startDate,
        endDate: doc.currentContract.endDate,
        durationMonths: doc.currentContract.durationMonths,
        monthlyRent: doc.currentContract.monthlyRent,
        penaltyFee: doc.currentContract.penaltyFee,
        penaltyGrowthFactor: doc.currentContract.penaltyGrowthFactor,
        terminationFee: doc.currentContract.terminationFee,
        onlineSalesCommissionPercent: doc.currentContract.onlineSalesCommissionPercent,
        notes: doc.currentContract.notes || '',
        status: doc.currentContract.status
      }
    : null,
  requestedTerms: doc.requestedTerms,
  requestNote: doc.requestNote || '',
  adminDecision: doc.adminDecision,
  reviewNote: doc.reviewNote || '',
  reviewedAt: doc.reviewedAt || null,
  reviewedBy: doc.reviewedBy
    ? {
        _id: doc.reviewedBy._id,
        firstName: doc.reviewedBy.firstName || '',
        lastName: doc.reviewedBy.lastName || '',
        email: doc.reviewedBy.email || ''
      }
    : null,
  approvedContract: doc.approvedContract
    ? {
        _id: doc.approvedContract._id,
        startDate: doc.approvedContract.startDate,
        endDate: doc.approvedContract.endDate,
        status: doc.approvedContract.status
      }
    : null,
  settlementSnapshot: doc.settlementSnapshot || null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt
});

const synchronizeExpiredContracts = async () => {
  const now = new Date();

  await Promise.all([
    Contract.updateMany(
      { status: 'ACTIVE', endDate: { $lt: now } },
      { $set: { status: 'EXPIRED' } }
    ),
    Contract.updateMany(
      { status: 'SCHEDULED', startDate: { $lte: now }, endDate: { $gt: now } },
      { $set: { status: 'ACTIVE' } }
    ),
    Contract.updateMany(
      { status: 'SCHEDULED', endDate: { $lte: now } },
      { $set: { status: 'EXPIRED' } }
    )
  ]);
};

const computeOutstandingByBoutique = async (boutiqueId) => {
  const cycles = await BillingCycle.find({ boutique: boutiqueId }).lean();
  const totals = {
    rentOutstanding: 0,
    electricityOutstanding: 0,
    penaltyOutstanding: 0
  };

  for (const cycle of cycles) {
    totals.rentOutstanding += lineRemaining(cycle, 'rent');
    totals.electricityOutstanding += lineRemaining(cycle, 'electricity');
    totals.penaltyOutstanding += lineRemaining(cycle, 'penalty');
  }

  const outstandingTotal = totals.rentOutstanding + totals.electricityOutstanding + totals.penaltyOutstanding;
  return {
    ...totals,
    outstandingTotal
  };
};

const resolveBoutiqueFromBoutiqueUser = async (userId) => {
  const user = await User.findById(userId).select('_id role boutique');
  if (!user) throw createAppError('Utilisateur introuvable.', 404);
  if (user.role !== 'BOUTIQUE') throw createAppError('Acces refuse.', 403);

  let boutique = null;
  if (user.boutique) {
    boutique = await Boutique.findById(user.boutique).select('_id owner name');
  }
  if (!boutique) {
    boutique = await Boutique.findOne({ owner: user._id }).select('_id owner name');
  }
  if (!boutique) {
    throw createAppError('Boutique introuvable pour cet utilisateur.', 404);
  }
  return { user, boutique };
};

const listContracts = async ({ page = 1, limit = 20, status }) => {
  await synchronizeExpiredContracts();

  const safePage = toPositiveInt(page, 1);
  const safeLimit = Math.min(toPositiveInt(limit, 20), MAX_LIMIT);

  const statusFilter = mapContractStatusFilter(status);
  if (status && !statusFilter) {
    throw createAppError('Statut de contrat invalide.', 400, [
      { field: 'status', message: 'Valeurs acceptees: ACTIVE, SCHEDULED, TERMINATED, EXPIRED.' }
    ]);
  }

  const query = { ...(statusFilter || {}) };

  const [contracts, total] = await Promise.all([
    Contract.find(query)
      .populate({
        path: 'boutique',
        select: 'name owner box',
        populate: { path: 'owner', select: 'firstName lastName email status' }
      })
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Contract.countDocuments(query)
  ]);

  const boutiqueIds = contracts
    .map((item) => item?.boutique?._id)
    .filter(Boolean);

  const boxes = await Box.find({ boutique: { $in: boutiqueIds } }).select('number floor boutique');
  const boxByBoutiqueId = new Map(
    boxes
      .filter((box) => box.boutique)
      .map((box) => [String(box.boutique), { id: box._id, number: box.number, floor: box.floor }])
  );

  const data = contracts.map((contract) => {
    const boutique = contract.boutique || null;
    const tenant = boutique?.owner || null;
    const box = boutique ? boxByBoutiqueId.get(String(boutique._id)) || null : null;

    return {
      _id: contract._id,
      startDate: contract.startDate,
      endDate: contract.endDate,
      durationMonths: contract.durationMonths,
      monthlyRent: contract.monthlyRent,
      penaltyFee: contract.penaltyFee,
      penaltyGrowthFactor: contract.penaltyGrowthFactor,
      terminationFee: contract.terminationFee,
      onlineSalesCommissionPercent: contract.onlineSalesCommissionPercent,
      notes: contract.notes || '',
      status: contract.status,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      boutique: boutique
        ? { _id: boutique._id, name: boutique.name }
        : null,
      tenant: tenant
        ? {
            _id: tenant._id,
            firstName: tenant.firstName || '',
            lastName: tenant.lastName || '',
            email: tenant.email || '',
            status: tenant.status || ''
          }
        : null,
      box
    };
  });

  return {
    data,
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

const updateContractStatus = async (id, status) => {
  if (!['ACTIVE', 'TERMINATED', 'SCHEDULED'].includes(status)) {
    throw createAppError('Statut de contrat invalide.', 400, [
      { field: 'status', message: 'Valeurs acceptees: ACTIVE, TERMINATED, SCHEDULED.' }
    ]);
  }

  const contract = await Contract.findById(id);
  if (!contract) {
    throw createAppError('Contrat introuvable.', 404);
  }

  if (status === 'ACTIVE' && contract.endDate < new Date()) {
    throw createAppError('Impossible de reactiver un contrat deja expire.', 400, [
      { field: 'status', message: 'Le contrat est deja expire.' }
    ]);
  }

  contract.status = status;
  await contract.save();

  return contract;
};

const createRenewalRequestByBoutique = async ({ userId, payload = {} }) => {
  await synchronizeExpiredContracts();

  const { user, boutique } = await resolveBoutiqueFromBoutiqueUser(userId);

  const currentContract = await Contract.findOne({
    boutique: boutique._id,
    status: { $in: ['ACTIVE', 'SCHEDULED'] }
  }).sort({ endDate: -1 });

  if (!currentContract) {
    throw createAppError('Aucun contrat actif pour cette boutique.', 400);
  }

  const settlement = await computeOutstandingByBoutique(boutique._id);
  if (settlement.outstandingTotal > 0) {
    throw createAppError('Renouvellement impossible: solde du superieur a 0.', 400, [
      { field: 'outstandingTotal', message: 'Veuillez solder toutes les dettes avant de demander un renouvellement.' }
    ]);
  }

  const existingPending = await ContractRenewalRequest.findOne({
    boutique: boutique._id,
    currentContract: currentContract._id,
    adminDecision: 'PENDING'
  });
  if (existingPending) {
    throw createAppError('Une demande de renouvellement est deja en attente.', 409);
  }

  const requestedTerms = sanitizeTerms(payload.requestedTerms || payload, {
    durationMonths: currentContract.durationMonths,
    monthlyRent: currentContract.monthlyRent,
    penaltyFee: currentContract.penaltyFee,
    penaltyGrowthFactor: currentContract.penaltyGrowthFactor,
    terminationFee: currentContract.terminationFee,
    onlineSalesCommissionPercent: currentContract.onlineSalesCommissionPercent,
    notes: currentContract.notes || ''
  });

  const requestNote = normalizeString(payload.requestNote || payload.note || '');
  if (requestNote.length > 1000) {
    throw createAppError('Note de demande trop longue.', 400, [
      { field: 'requestNote', message: 'Maximum 1000 caracteres.' }
    ]);
  }

  const created = await ContractRenewalRequest.create({
    boutique: boutique._id,
    requesterUser: user._id,
    currentContract: currentContract._id,
    requestedTerms,
    requestNote,
    settlementSnapshot: settlement
  });

  const populated = await ContractRenewalRequest.findById(created._id)
    .populate('boutique', 'name')
    .populate('requesterUser', 'firstName lastName email')
    .populate('currentContract')
    .populate('approvedContract', 'startDate endDate status')
    .populate('reviewedBy', 'firstName lastName email');

  return formatRenewalRequest(populated);
};

const listRenewalRequestsForBoutique = async (userId, query = {}) => {
  const { boutique } = await resolveBoutiqueFromBoutiqueUser(userId);
  const safePage = toPositiveInt(query.page, 1);
  const safeLimit = Math.min(toPositiveInt(query.limit, 20), MAX_LIMIT);

  const statusFilter = mapRenewalStatusFilter(query.status);
  if (query.status && !statusFilter) {
    throw createAppError('Statut de demande invalide.', 400, [
      { field: 'status', message: 'Valeurs acceptees: PENDING, APPROVED, REJECTED.' }
    ]);
  }

  const where = { boutique: boutique._id, ...(statusFilter || {}) };

  const [rows, total] = await Promise.all([
    ContractRenewalRequest.find(where)
      .populate('boutique', 'name')
      .populate('requesterUser', 'firstName lastName email')
      .populate('currentContract')
      .populate('approvedContract', 'startDate endDate status')
      .populate('reviewedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    ContractRenewalRequest.countDocuments(where)
  ]);

  return {
    data: rows.map(formatRenewalRequest),
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

const listRenewalRequestsForAdmin = async (query = {}) => {
  const safePage = toPositiveInt(query.page, 1);
  const safeLimit = Math.min(toPositiveInt(query.limit, 20), MAX_LIMIT);
  const statusFilter = mapRenewalStatusFilter(query.status);

  if (query.status && !statusFilter) {
    throw createAppError('Statut de demande invalide.', 400, [
      { field: 'status', message: 'Valeurs acceptees: PENDING, APPROVED, REJECTED.' }
    ]);
  }

  const where = { ...(statusFilter || {}) };
  if (query.boutiqueId) {
    where.boutique = query.boutiqueId;
  }

  const [rows, total] = await Promise.all([
    ContractRenewalRequest.find(where)
      .populate('boutique', 'name')
      .populate('requesterUser', 'firstName lastName email')
      .populate('currentContract')
      .populate('approvedContract', 'startDate endDate status')
      .populate('reviewedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    ContractRenewalRequest.countDocuments(where)
  ]);

  return {
    data: rows.map(formatRenewalRequest),
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

const approveRenewalRequestByAdmin = async ({ requestId, adminUserId, payload = {} }) => {
  await synchronizeExpiredContracts();
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const request = await ContractRenewalRequest.findById(requestId).session(session);
    if (!request) {
      throw createAppError('Demande de renouvellement introuvable.', 404);
    }
    if (request.adminDecision !== 'PENDING') {
      throw createAppError('Cette demande a deja ete traitee.', 409);
    }

    const currentContract = await Contract.findById(request.currentContract).session(session);
    if (!currentContract) {
      throw createAppError('Contrat courant introuvable.', 404);
    }

    const settlement = await computeOutstandingByBoutique(request.boutique);
    if (settlement.outstandingTotal > 0) {
      throw createAppError('Validation impossible: la boutique a encore un solde du.', 400, [
        { field: 'outstandingTotal', message: 'La boutique doit solder ses dettes avant approbation.' }
      ]);
    }

    const finalTerms = sanitizeTerms(payload.finalTerms || payload.requestedTerms || {}, request.requestedTerms);
    const reviewNote = normalizeString(payload.reviewNote || '');
    if (reviewNote.length > 1000) {
      throw createAppError('Note admin trop longue.', 400, [
        { field: 'reviewNote', message: 'Maximum 1000 caracteres.' }
      ]);
    }

    const renewalStartDate = new Date(currentContract.endDate);
    if (Number.isNaN(renewalStartDate.getTime())) {
      throw createAppError('Date de fin du contrat courant invalide.', 400);
    }
    const renewalEndDate = addMonths(renewalStartDate, finalTerms.durationMonths);
    const now = new Date();

    const newContractStatus = renewalStartDate > now ? 'SCHEDULED' : 'ACTIVE';

    const newContract = new Contract({
      boutique: request.boutique,
      startDate: renewalStartDate,
      endDate: renewalEndDate,
      durationMonths: finalTerms.durationMonths,
      monthlyRent: finalTerms.monthlyRent,
      penaltyFee: finalTerms.penaltyFee,
      penaltyGrowthFactor: finalTerms.penaltyGrowthFactor,
      terminationFee: finalTerms.terminationFee,
      onlineSalesCommissionPercent: finalTerms.onlineSalesCommissionPercent,
      notes: finalTerms.notes,
      status: newContractStatus
    });

    await newContract.save({ session });

    if (renewalStartDate <= now && currentContract.status === 'ACTIVE') {
      currentContract.status = 'TERMINATED';
      await currentContract.save({ session });
    }

    request.adminDecision = 'APPROVED';
    request.reviewNote = reviewNote;
    request.reviewedBy = adminUserId;
    request.reviewedAt = new Date();
    request.approvedContract = newContract._id;
    request.settlementSnapshot = settlement;
    request.requestedTerms = finalTerms;
    await request.save({ session });

    await session.commitTransaction();

    const populated = await ContractRenewalRequest.findById(request._id)
      .populate('boutique', 'name')
      .populate('requesterUser', 'firstName lastName email')
      .populate('currentContract')
      .populate('approvedContract', 'startDate endDate status')
      .populate('reviewedBy', 'firstName lastName email');

    return formatRenewalRequest(populated);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const rejectRenewalRequestByAdmin = async ({ requestId, adminUserId, payload = {} }) => {
  const reviewNote = normalizeString(payload.reviewNote || payload.reason || '');
  if (!reviewNote) {
    throw createAppError('Un motif de refus est requis.', 400, [
      { field: 'reviewNote', message: 'Veuillez renseigner un motif de refus.' }
    ]);
  }
  if (reviewNote.length > 1000) {
    throw createAppError('Motif trop long.', 400, [{ field: 'reviewNote', message: 'Maximum 1000 caracteres.' }]);
  }

  const request = await ContractRenewalRequest.findById(requestId);
  if (!request) {
    throw createAppError('Demande de renouvellement introuvable.', 404);
  }
  if (request.adminDecision !== 'PENDING') {
    throw createAppError('Cette demande a deja ete traitee.', 409);
  }

  request.adminDecision = 'REJECTED';
  request.reviewNote = reviewNote;
  request.reviewedBy = adminUserId;
  request.reviewedAt = new Date();
  await request.save();

  const populated = await ContractRenewalRequest.findById(request._id)
    .populate('boutique', 'name')
    .populate('requesterUser', 'firstName lastName email')
    .populate('currentContract')
    .populate('approvedContract', 'startDate endDate status')
    .populate('reviewedBy', 'firstName lastName email');

  return formatRenewalRequest(populated);
};

module.exports = {
  listContracts,
  updateContractStatus,
  createRenewalRequestByBoutique,
  listRenewalRequestsForBoutique,
  listRenewalRequestsForAdmin,
  approveRenewalRequestByAdmin,
  rejectRenewalRequestByAdmin
};
