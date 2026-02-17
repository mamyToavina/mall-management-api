const boxService = require('./box.service');

class BoxController {

  async findAll(req, res, next) {
    try {
      const result = await boxService.findAll(req.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getStatistics(req, res, next) {
    try {
      const stats = await boxService.getStatistics();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }

  async getFullDetails(req, res, next) {
    try {
      const result = await boxService.getFullDetails(req.params.id);

      if (!result) {
        return res.status(404).json({ message: 'Box not found' });
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const box = await boxService.create(req.body);
      res.status(201).json(box);
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const box = await boxService.update(req.params.id, req.body);
      if (!box) return res.status(404).json({ message: 'Box not found' });
      res.json(box);
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const box = await boxService.delete(req.params.id);
      if (!box) return res.status(404).json({ message: 'Box not found' });
      res.json({ message: 'Deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BoxController();
