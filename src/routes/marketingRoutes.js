const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/marketingController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

// Only marketing and admins can see these stats
router.get('/stats', (req, res, next) => {
    const allowed = ['marketing', 'super_admin', 'admin_oficina'];
    if (!allowed.includes(req.user.rol)) {
        return res.status(403).json({ error: 'No autorizado para ver estadísticas de marketing' });
    }
    next();
}, ctrl.getMarketingStats);

module.exports = router;
