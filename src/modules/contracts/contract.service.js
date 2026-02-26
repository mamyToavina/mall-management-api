const Contract = require('./contract.model');
const Box = require('../boxes/box.model');

const MAX_LIMIT = 200;

const mapContractStatusFilter = (status) => {
  if (!status) return {};
  if (status === 'ACTIVE' || status === 'TERMINATED' || status === 'EXPIRED') {
    return { status };
  }
  return null;
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const synchronizeExpiredContracts = async () => {
  await Contract.updateMany(
    { status: 'ACTIVE', endDate: { $lt: new Date() } },
    { $set: { status: 'EXPIRED' } }
  );
};

const listContracts = async ({ page = 1, limit = 20, status }) => {
  await synchronizeExpiredContracts();

  const safePage = toPositiveInt(page, 1);
  const safeLimit = Math.min(toPositiveInt(limit, 20), MAX_LIMIT);

  const statusFilter = mapContractStatusFilter(status);
  if (status && !statusFilter) {
    const err = new Error('Statut de contrat invalide.');
    err.statusCode = 400;
    err.errors = [{ field: 'status', message: 'Valeurs acceptees: ACTIVE, TERMINATED, EXPIRED.' }];
    throw err;
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
  if (!['ACTIVE', 'TERMINATED'].includes(status)) {
    const err = new Error('Statut de contrat invalide.');
    err.statusCode = 400;
    err.errors = [{ field: 'status', message: 'Valeurs acceptees: ACTIVE, TERMINATED.' }];
    throw err;
  }

  const contract = await Contract.findById(id);
  if (!contract) {
    const err = new Error('Contrat introuvable.');
    err.statusCode = 404;
    throw err;
  }

  if (status === 'ACTIVE' && contract.endDate < new Date()) {
    const err = new Error('Impossible de reactiver un contrat deja expire.');
    err.statusCode = 400;
    err.errors = [{ field: 'status', message: 'Le contrat est deja expire.' }];
    throw err;
  }

  contract.status = status;
  await contract.save();

  return contract;
};

module.exports = {
  listContracts,
  updateContractStatus
};
