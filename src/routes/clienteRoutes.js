const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clienteController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', ctrl.getClientes);
router.post('/', ctrl.createCliente);
router.get('/:id', ctrl.getCliente);
router.put('/:id', ctrl.updateCliente);
router.get('/:id/timeline', ctrl.getTimeline);
router.post('/:id/timeline', ctrl.addTimelineEvent);
router.post('/:id/incidencia', ctrl.addIncidencia);

module.exports = router;
