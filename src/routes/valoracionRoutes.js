const express = require('express');
const router = express.Router();
const valoracionController = require('../controllers/valoracionController');
const { authenticate } = require('../middleware/authMiddleware');

router.get('/:id', authenticate, valoracionController.getValoracion);
router.get('/stats/global', authenticate, valoracionController.getGlobalStats);

module.exports = router;
