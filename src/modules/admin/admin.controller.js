const { createBoutiqueWithContract } = require('./admin.service');

const createTenant = async (req, res, next) => {
    try {
      const result = await createBoutiqueWithContract(req.body);
  
      res.status(201).json(result);
  
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          message: err.message,
          ...(err.errors ? { errors: err.errors } : {})
        });
      }
      if (typeof next === 'function') {
        return next(err);
      }
      return res.status(500).json({
        message: err?.message || 'Erreur interne du serveur.'
      });
    }
};
  
module.exports = { createTenant };
