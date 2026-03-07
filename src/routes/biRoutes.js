const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/biController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Only Admins and Super Admins can see raw BI data
router.use(authenticate);
router.use(authorize(['super_admin', 'admin_oficina']));

router.get('/forecast', ctrl.getForecast);
router.get('/performance', ctrl.getPerformanceMetrics);

module.exports = router;
