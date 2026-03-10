const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/propiedadController');
const { authenticate } = require('../middleware/authMiddleware');

// Ruta Pública (No requiere token)
router.get('/publica/:id', ctrl.getPropiedadPublica);

router.use(authenticate);

router.get('/', ctrl.getPropiedades);
router.post('/', ctrl.createPropiedad);
router.get('/:id', ctrl.getPropiedad);
router.put('/:id', ctrl.updatePropiedad);
router.delete('/:id', ctrl.deletePropiedad);
router.put('/:id/estado', ctrl.changeEstado);
router.post('/convertir/:captacion_id', ctrl.convertFromCaptacion);

module.exports = router;
