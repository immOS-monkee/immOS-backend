const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// GET /api/v1/config/:clave -> Público
router.get('/:clave', configController.getConfigByClave);

// PATCH /api/v1/config/:clave -> Protegido (Super Admin y Marketing)
router.patch('/:clave',
    authenticate,
    authorize(['super_admin', 'marketing']),
    configController.updateConfig
);

module.exports = router;
