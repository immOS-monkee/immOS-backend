const express = require('express');
const router = express.Router();
const documentoController = require('../controllers/documentoController');
const { authenticate } = require('../middleware/authMiddleware'); // Assuming this is the naming based on previous fixes

// Routes for PDF generation - Protected
router.get('/factura/:ofertaId', authenticate, documentoController.generarFacturaComision);
router.get('/arras/:ofertaId', authenticate, documentoController.generarContratoArras);
router.get('/alquiler/:alquilerId', authenticate, documentoController.generarContratoAlquiler);

module.exports = router;
