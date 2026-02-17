const Box = require('./box.model');
const paginate = require('../../utils/pagination');
const Boutique = require('../boutique/boutique.model');
const Contract = require('../contracts/contract.model');

class BoxService {

  /* ===============================
     LISTE AVEC PAGINATION + FILTRES
  =============================== */
  async findAll(queryParams) {
    const {
      page = 1,
      limit = 10,
      floor,
      minSurface,
      maxSurface,
      minRent,
      maxRent,
      status // libre | occupied
    } = queryParams;
  
    const query = {};
  
    /* ===============================
       CONSTRUCTION DES FILTRES
    =============================== */
  
    if (floor) {
      query.floor = Number(floor);
    }
  
    if (minSurface || maxSurface) {
      query.surface = {};
      if (minSurface) query.surface.$gte = Number(minSurface);
      if (maxSurface) query.surface.$lte = Number(maxSurface);
    }
  
    if (minRent || maxRent) {
      query.monthlyRent = {};
      if (minRent) query.monthlyRent.$gte = Number(minRent);
      if (maxRent) query.monthlyRent.$lte = Number(maxRent);
    }
  
    if (status === 'libre') {
      query.boutique = null;
    }
  
    if (status === 'occupied') {
      query.boutique = { $ne: null };
    }
  
    /* ===============================
       PAGINATION + STATS EN PARALLÈLE
    =============================== */
  
    const [paginatedResult, total, free, occupied] = await Promise.all([
      paginate(Box, query, page, limit),
      Box.countDocuments(query),
      Box.countDocuments({ ...query, boutique: null }),
      Box.countDocuments({ ...query, boutique: { $ne: null } })
    ]);
  
    return {
      ...paginatedResult,
      stats: {
        total,
        free,
        occupied
      }
    };
  }
  

  /* ===============================
     STATISTIQUES
  =============================== */
  async getStatistics() {
    const [total, free, occupied] = await Promise.all([
      Box.countDocuments(),
      Box.countDocuments({ boutique: null }),
      Box.countDocuments({ boutique: { $ne: null } })
    ]);

    return {
      total,
      free,
      occupied
    };
  }

  /* ===============================
     DETAIL COMPLET BOX
  =============================== */
  async getFullDetails(boxId) {
    const box = await Box.findById(boxId)
      .populate({
        path: 'boutique',
        populate: {
          path: 'owner',
          select: '-password -refreshTokenHash'
        }
      });

    if (!box) return null;

    let contract = null;

    if (box.boutique) {
      contract = await Contract.findOne({
        boutique: box.boutique._id,
        status: 'ACTIVE'
      });
    }

    return {
      box,
      contract
    };
  }

  async create(data) {
    return Box.create(data);
  }

  async update(id, data) {
    return Box.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true
    });
  }

  async delete(id) {
    return Box.findByIdAndDelete(id);
  }
}

module.exports = new BoxService();
