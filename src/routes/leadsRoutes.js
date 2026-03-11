const express = require('express');
const router = express.Router();
const leadsController = require('../controllers/leadsController');
const { authenticate } = require('../middleware/authMiddleware');

// ==========================================
// Rutas Públicas
// ==========================================
// Permite que clientes inserten datos desde immos-monkee.web.app/contacto
router.post('/publico', leadsController.crearLeadPublico);

// ==========================================
// Rutas Protegidas (Marketing / Admin)
// ==========================================
router.get('/', authenticate, leadsController.obtenerLeads);
router.patch('/:id/estado', authenticate, leadsController.actualizarEstadoLead);
router.post('/:id/convertir', authenticate, leadsController.convertirLead);

module.exports = router;
