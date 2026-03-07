const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const logger = require('./utils/logger');
const { globalLimiter, sanitizeInput } = require('./middleware/securityMiddleware');

// Routes (Imports)
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propiedadRoutes');
const clientRoutes = require('./routes/clienteRoutes');
const captureRoutes = require('./routes/captacionRoutes');
const visitaRoutes = require('./routes/visitaRoutes');
const ofertaRoutes = require('./routes/ofertaRoutes');
const comisionRoutes = require('./routes/comisionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const valoracionRoutes = require('./routes/valoracionRoutes');
const alquilerRoutes = require('./routes/alquilerRoutes');
const incidenciaRoutes = require('./routes/incidenciaRoutes');
const documentoRoutes = require('./routes/documentoRoutes');
const gamificacionRoutes = require('./routes/gamificacionRoutes');
const biRoutes = require('./routes/biRoutes');
const fidelizacionRoutes = require('./routes/fidelizacionRoutes');
const automatizacionesRoutes = require('./routes/automatizacionesRoutes');
const officeAdminRoutes = require('./routes/officeAdminRoutes');
const agentStatsRoutes = require('./routes/agentStatsRoutes');
const marketingRoutes = require('./routes/marketingRoutes');
const closingAgentRoutes = require('./routes/closingAgentRoutes');
const notificacionRoutes = require('./routes/notificacionRoutes');
const mensajeRoutes = require('./routes/mensajeRoutes');


const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet());
app.use(cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:5173', 'https://immos-monkee.web.app', 'https://immos-monkee.firebaseapp.com'],
    credentials: true
}));

// Rate Limiting
app.use(globalLimiter);

// Body Parsers & Sanitization
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(sanitizeInput);

// Request Logging (Simple Morgan-like log)
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Routes Integration
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/propiedades', propertyRoutes);
app.use('/api/v1/clientes', clientRoutes);
app.use('/api/v1/captaciones', captureRoutes);
app.use('/api/v1/visitas', visitaRoutes);
app.use('/api/v1/ofertas', ofertaRoutes);
app.use('/api/v1/comisiones', comisionRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/valoracion', valoracionRoutes);
app.use('/api/v1/alquileres', alquilerRoutes);
app.use('/api/v1/incidencias', incidenciaRoutes);
app.use('/api/v1/documento', documentoRoutes);
app.use('/api/v1/gamificacion', gamificacionRoutes);
app.use('/api/v1/bi', biRoutes);
app.use('/api/v1/fidelizacion', fidelizacionRoutes);
app.use('/api/v1/automatizaciones', automatizacionesRoutes);
app.use('/api/v1/office-admin', officeAdminRoutes);
app.use('/api/v1/agent-stats', agentStatsRoutes);
app.use('/api/v1/marketing', marketingRoutes);
app.use('/api/v1/closing-agent', closingAgentRoutes);
app.use('/api/v1/notificacion', notificacionRoutes);
app.use('/api/v1/mensaje', mensajeRoutes);


// Base Route
app.get('/', (req, res) => {
    res.json({
        message: 'InmoOS API - El Sistema Operativo Inmobiliario',
        status: 'online',
        version: '1.0.0'
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 InmoOS Backend running on http://localhost:${PORT}`);
});
