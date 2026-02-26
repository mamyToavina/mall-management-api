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
      next(err);
    }
};
  
module.exports = { createTenant };
