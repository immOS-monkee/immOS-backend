const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/closingAgentController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate);
router.use(authorize(['agente_cierre', 'super_admin']));

// Dashboard
router.get('/dashboard', ctrl.getDashboardSummary);

// Properties
router.get('/properties', ctrl.getMyProperties);
router.post('/captations/convert', ctrl.convertCaptation);
router.put('/properties/:id/status', ctrl.updatePropertyStatus);

// Clients
router.get('/clients', ctrl.getMyClients);
router.post('/clients', ctrl.createClient);
router.get('/clients/:id/timeline', ctrl.getClientTimeline);

// Offers / Pipeline
router.get('/offers', ctrl.getMyOffers);
router.post('/offers', ctrl.createOffer);
router.put('/offers/:id/stage', ctrl.updateOfferStage);
router.put('/offers/:id/close', ctrl.closeOffer);

// Visits
router.post('/visits', ctrl.scheduleVisit);
router.put('/visits/:id/cancel', ctrl.cancelVisit);
router.put('/visits/:id/noshow', ctrl.justifyNoShow);

// Metrics
router.get('/metrics', ctrl.getMyMetrics);

// Rentals
router.get('/rentals', ctrl.getMyRentals);
router.post('/rentals/payment', ctrl.registerRentalPayment);
router.post('/rentals/incident', ctrl.createRentalIncident);

module.exports = router;
