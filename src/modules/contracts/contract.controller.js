const { listContracts, updateContractStatus } = require('./contract.service');

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

module.exports = {
  getContracts,
  patchContractStatus
};
