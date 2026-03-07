const { verifyToken } = require('../utils/jwtHelper');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token, process.env.JWT_SECRET);

    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
};

const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.rol)) {
            return res.status(403).json({ error: 'Unauthorized role' });
        }
        next();
    };
};

module.exports = { authenticate, authorize };
