const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fidelizacionController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/cliente/:clientId', ctrl.getClientFidelityStatus);
router.post('/encuesta', ctrl.registerSatisfactionSurvey);

module.exports = router;
