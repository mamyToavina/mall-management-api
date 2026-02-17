const { createBoutiqueWithContract } = require('./admin.service');

const createTenant = async (req, res, next) => {
    try {
      const result = await createBoutiqueWithContract(req.body);
  
      res.status(201).json(result);
  
    } catch (err) {
      next(err);
    }
};
  
module.exports = { createTenant };
