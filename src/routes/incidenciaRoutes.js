const express = require('express');
const router = express.Router();
const incidenciaController = require('../controllers/incidenciaController');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/', authenticate, incidenciaController.createIncidencia);
router.get('/', authenticate, incidenciaController.getIncidencias);
router.patch('/:id', authenticate, incidenciaController.updateIncidencia);

module.exports = router;
