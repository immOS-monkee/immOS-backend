const express = require('express');
const router = express.Router();
const captacionController = require('../controllers/captacionController');
const { authenticate } = require('../middleware/authMiddleware');

// All routes are protected
router.use(authenticate);

router.post('/', captacionController.createCapture);
router.get('/', captacionController.getCaptures);
router.patch('/:id/status', captacionController.updateStatus);

module.exports = router;
