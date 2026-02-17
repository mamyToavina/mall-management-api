const express = require('express');
const controller = require('./box.controller');

const router = express.Router();

router.get('/', controller.findAll);
router.get('/statistics', controller.getStatistics);
router.get('/:id/full-details', controller.getFullDetails);

router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
