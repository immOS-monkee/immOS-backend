const express = require('express');
const router = express.Router();
const officeAdminController = require('../controllers/officeAdminController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Protected routes for Office Admin and Super Admin
router.use(authenticate);
router.use(authorize(['admin_oficina', 'super_admin']));

// Team & Agents
router.get('/team', officeAdminController.getTeamMembers);
router.post('/assign', officeAdminController.assignToAgent);
router.put('/agent/:id/availability', officeAdminController.toggleAgentAvailability);

// Operations
router.put('/captations/:id/validate', officeAdminController.validateCaptation);

// Operational Oversight
router.get('/stats', officeAdminController.getOfficeStats);
router.get('/calendar', officeAdminController.getGlobalCalendar);

module.exports = router;
