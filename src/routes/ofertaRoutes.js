const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ofertaController');
const { validateRequest } = require('../middleware/validationMiddleware');
const { ofertaSchemas } = require('../validations/schemas');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/pipeline', ctrl.getPipeline);
router.get('/estadisticas', ctrl.getEstadisticas);
router.get('/', ctrl.getOfertas);
router.post('/', validateRequest(ofertaSchemas.create), ctrl.createOferta);
router.get('/:id', ctrl.getOferta);
router.post('/:id/cambiar-estado', ctrl.changeEstado);
router.post('/:id/contraoferta', ctrl.addContraoferta);

module.exports = router;
