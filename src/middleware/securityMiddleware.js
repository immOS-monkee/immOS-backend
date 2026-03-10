const rateLimit = require('express-rate-limit');

/**
 * Global API rate limiter
 */
exports.globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Relajado para desarrollo (100 -> 1000)
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiadas peticiones desde esta IP. Por favor, inténtelo de nuevo en 15 minutos.'
    }
});

/**
 * Strict limiter for authentication routes (login/register)
 */
exports.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiados intentos de acceso. Por seguridad, su IP ha sido bloqueada temporalmente.'
    }
});

/**
 * Simple Input Sanitization middleware
 */
exports.sanitizeInput = (req, res, next) => {
    const sanitize = (data) => {
        if (typeof data === 'string') {
            // Remove <script> tags and other potentially dangerous HTML
            return data
                .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                .replace(/on\w+="[^"]*"/gim, "")
                .trim();
        }
        if (typeof data === 'object' && data !== null) {
            for (let key in data) {
                data[key] = sanitize(data[key]);
            }
        }
        return data;
    };

    if (req.body) req.body = sanitize(req.body);
    if (req.query) req.query = sanitize(req.query);
    if (req.params) req.params = sanitize(req.params);

    next();
};
