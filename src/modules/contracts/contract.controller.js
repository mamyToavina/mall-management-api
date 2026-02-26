const {
  listContracts,
  updateContractStatus,
  createRenewalRequestByBoutique,
  listRenewalRequestsForBoutique,
  listRenewalRequestsForAdmin,
  approveRenewalRequestByAdmin,
  rejectRenewalRequestByAdmin
} = require('./contract.service');

const getContracts = async (req, res, next) => {
  try {
    const result = await listContracts(req.query || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

const patchContractStatus = async (req, res, next) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status.trim().toUpperCase() : '';
    const contract = await updateContractStatus(req.params.id, status);

    return res.json({
      message: 'Statut du contrat mis a jour.',
      contract
    });
  } catch (error) {
    return next(error);
  }
};

const postBoutiqueRenewalRequest = async (req, res, next) => {
  try {
    const data = await createRenewalRequestByBoutique({
      userId: req.user.id,
      payload: req.body || {}
    });

    return res.status(201).json({
      message: 'Demande de renouvellement enregistree.',
      data
    });
  } catch (error) {
    return next(error);
  }
};

const getBoutiqueRenewalRequests = async (req, res, next) => {
  try {
    const result = await listRenewalRequestsForBoutique(req.user.id, req.query || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

const getAdminRenewalRequests = async (req, res, next) => {
  try {
    const result = await listRenewalRequestsForAdmin(req.query || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

const approveAdminRenewalRequest = async (req, res, next) => {
  try {
    const data = await approveRenewalRequestByAdmin({
      requestId: req.params.id,
      adminUserId: req.user.id,
      payload: req.body || {}
    });

    return res.json({
      message: 'Demande de renouvellement approuvee.',
      data
    });
  } catch (error) {
    return next(error);
  }
};

const rejectAdminRenewalRequest = async (req, res, next) => {
  try {
    const data = await rejectRenewalRequestByAdmin({
      requestId: req.params.id,
      adminUserId: req.user.id,
      payload: req.body || {}
    });

    return res.json({
      message: 'Demande de renouvellement rejetee.',
      data
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getContracts,
  patchContractStatus,
  postBoutiqueRenewalRequest,
  getBoutiqueRenewalRequests,
  getAdminRenewalRequests,
  approveAdminRenewalRequest,
  rejectAdminRenewalRequest
};
