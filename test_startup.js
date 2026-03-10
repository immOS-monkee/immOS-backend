try {
    console.log("Iniciando carga de dependencias...");
    require('express');
    require('cors');
    require('helmet');
    require('morgan');
    require('cookie-parser');
    require('dotenv').config();
    console.log("Dependencias base OK");

    require('./src/utils/logger');
    console.log("Logger OK");

    require('./src/middleware/securityMiddleware');
    console.log("Security Middleware OK");

    // Probar una ruta
    require('./src/routes/authRoutes');
    console.log("Auth Routes OK");

    const app = require('express')();
    console.log("Express app creada");

} catch (e) {
    console.error("ERROR DETECTADO:", e.message);
    console.error(e.stack);
    process.exit(1);
}
