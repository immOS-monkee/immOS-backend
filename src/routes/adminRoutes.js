const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// All routes here are protected and require Super Admin role
router.use(authenticate);
router.use(authorize(['super_admin']));

// User Management
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.put('/users/:id/toggle', adminController.toggleUserStatus);
router.delete('/users/:id', adminController.deleteUser);
router.get('/users/:id/stats', adminController.getUserPerformanceStats);

// System Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// Audit & Logs
router.get('/logs', adminController.getActivityLogs);
router.get('/login-logs', adminController.getLoginLogs);
router.get('/stats', adminController.getSystemStats);

// Tags & Achievements
router.get('/tags', adminController.getTags);
router.post('/tags', adminController.upsertTag);
router.get('/achievements', adminController.getAchievements);
router.post('/achievements', adminController.upsertAchievement);

// Notification Templates
router.get('/templates', adminController.getTemplates);
router.put('/templates/:id', adminController.updateTemplate);

// Session Management
router.get('/sessions', adminController.getSessions);
router.delete('/sessions/:id', adminController.revokeSession);

// SYSTEM DESTRUCTION (DANGER ZONE)
router.post('/master-reset', adminController.masterReset);

module.exports = router;
