const publicService = require('./public.service');

const searchPublic = async (req, res, next) => {
  try {
    const result = await publicService.search({
      type: req.query.type,
      query: req.query.query,
      category: req.query.category,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      minRating: req.query.minRating,
      limit: req.query.limit
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  searchPublic
};
