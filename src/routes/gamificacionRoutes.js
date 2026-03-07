const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/gamificacionController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/mis-puntos', ctrl.getMisPuntos);
router.get('/ranking-semanal', ctrl.getRankingSemanal);
router.get('/ranking-mensual', ctrl.getRankingMensual);
router.get('/logros', ctrl.getLogros);
router.post('/admin/config', ctrl.updateConfig);

module.exports = router;
