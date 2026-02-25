const boutiquePublicService = require('./boutique.public.service');

const createBoutique = async (req, res) => {
  res.json({ message: 'Boutique creee' });
};

const listPublic = async (req, res, next) => {
  try {
    const result = await boutiquePublicService.listPublicBoutiques({
      limit: req.query.limit,
      search: req.query.search
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getPublicById = async (req, res, next) => {
  try {
    const boutique = await boutiquePublicService.getPublicBoutiqueById(req.params.id);
    if (!boutique) return res.status(404).json({ message: 'Boutique introuvable' });
    res.json({ data: boutique });
  } catch (error) {
    next(error);
  }
};

const listPublicProducts = async (req, res, next) => {
  try {
    const result = await boutiquePublicService.listPublicBoutiqueProducts(req.params.id, {
      limit: req.query.limit
    });
    if (!result) return res.status(404).json({ message: 'Boutique introuvable' });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBoutique,
  listPublic,
  getPublicById,
  listPublicProducts
};
