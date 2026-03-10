const express = require('express');
const router = express.Router();
const mensajeController = require('../controllers/mensajeController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

// Middleware de log específico para mensajes
router.use((req, res, next) => {
    console.log(`[CHAT-ROUTE] ${req.method} ${req.originalUrl}`);
    next();
});

// Chat Grupal (Deben ir antes de las rutas con :id)
router.get('/grupal/todos', mensajeController.getMensajesGrupales);
router.post('/grupal/enviar', mensajeController.enviarMensajeGrupal);

router.get('/chats', mensajeController.getMisChats);
router.get('/:otherUserId', mensajeController.getMensajesConUsuario);
router.post('/', mensajeController.enviarMensaje);

module.exports = router;
