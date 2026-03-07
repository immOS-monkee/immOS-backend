const express = require('express');
const router = express.Router();
const agentStatsController = require('../controllers/agentStatsController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/metrics', agentStatsController.getAgentMetrics);
router.get('/achievements', agentStatsController.getAgentAchievements);

module.exports = router;
