const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/automatizacionesController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

// Catalog
router.get('/catalogo', ctrl.getCatalogo);

// Rules CRUD (admin)
router.get('/', ctrl.getReglas);
router.post('/', ctrl.createRegla);
router.put('/:id/toggle', ctrl.toggleRegla);
router.delete('/:id', ctrl.deleteRegla);

// History & Test
router.get('/historial', ctrl.getHistorial);
router.post('/:id/test', ctrl.testRegla);

module.exports = router;
