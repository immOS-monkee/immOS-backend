const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/securityMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const { authSchemas } = require('../validations/schemas');
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authLimiter, validateRequest(authSchemas.login), authController.login);
router.post('/refresh', authController.refresh);

module.exports = router;
