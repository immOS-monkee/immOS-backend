const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/visitaController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', ctrl.getVisitas);
router.post('/', ctrl.createVisita);
router.get('/:id', ctrl.getVisita);
router.post('/:id/confirmar', ctrl.confirmarVisita);
router.post('/:id/validar', ctrl.validarVisita);
router.post('/:id/checkin', ctrl.checkIn);
router.post('/:id/checkout', ctrl.checkOut);
router.post('/:id/no-show', ctrl.markNoShow);
router.post('/:id/justificar-no-show', ctrl.justifyNoShow);

module.exports = router;
