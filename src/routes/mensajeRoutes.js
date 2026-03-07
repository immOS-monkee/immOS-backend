const express = require('express');
const router = express.Router();
const mensajeController = require('../controllers/mensajeController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/chats', mensajeController.getMisChats);
router.get('/:otherUserId', mensajeController.getMensajesConUsuario);
router.post('/', mensajeController.enviarMensaje);

module.exports = router;
