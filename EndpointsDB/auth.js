const jwt = require("jsonwebtoken");

const JWT_SECRET = "ClaveSecretaDeLaBarberiaMatias123";

function basicAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).json({ error: "Autenticación requerida. Ingrese usuario y contraseña." });
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [usuario, password] = credentials.split(':');

    if (usuario === 'admin' && password === '123') {
        return next();
    }

    return res.status(401).json({ error: "Credenciales inválidas. Acceso denegado." });
}

function jwtMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Acceso denegado. Token requerido." });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Token inválido o expirado." });
    }
}

module.exports = { basicAuthMiddleware, jwtMiddleware, JWT_SECRET };