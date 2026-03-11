const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/propiedadController');
const { authenticate } = require('../middleware/authMiddleware');

// Rutas Públicas (No requieren token)
router.get('/publica', ctrl.getPublicPropertiesFiltered);
router.get('/publica/:id', ctrl.getPropiedadPublica);

router.use(authenticate);

router.get('/', ctrl.getPropiedades);
router.post('/', ctrl.createPropiedad);
router.get('/:id', ctrl.getPropiedad);
router.put('/:id', ctrl.updatePropiedad);
router.put('/:id/galeria', ctrl.updateGallery);
router.delete('/:id', ctrl.deletePropiedad);
router.put('/:id/estado', ctrl.changeEstado);
router.get('/:id/metricas', ctrl.getPropiedadMetricas);
router.post('/convertir/:captacion_id', ctrl.convertFromCaptacion);

module.exports = router;
