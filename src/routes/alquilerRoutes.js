const express = require('express');
const router = express.Router();
const alquilerController = require('../controllers/alquilerController');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/', authenticate, alquilerController.createAlquiler);
router.get('/', authenticate, alquilerController.getAlquileres);
router.post('/pago', authenticate, alquilerController.registrarPago);
router.get('/:alquilerId/pagos', authenticate, alquilerController.getPagosByAlquiler);

module.exports = router;
