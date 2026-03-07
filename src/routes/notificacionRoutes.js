const express = require('express');
const router = express.Router();
const notificacionController = require('../controllers/notificacionController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate); // All notification routes are protected

router.get('/', notificacionController.getMisNotificaciones);
router.patch('/leer-todas', notificacionController.leerTodas);
router.patch('/:id/leer', notificacionController.marcarLeida);
router.delete('/:id', notificacionController.eliminar);

module.exports = router;
