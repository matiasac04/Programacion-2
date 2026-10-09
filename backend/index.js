require('dotenv').config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const rutasSesion = require("./rutas/rutasSesion");
const rutasClientes = require("./rutas/rutasClientes");
const rutasTurnos = require("./rutas/rutasTurnos");
const rutasProfesionales = require("./rutas/rutasProfesionales");
const rutasServicios = require("./rutas/rutasServicios");
const { getPool } = require("./conexion");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,

  message: { error: "Demasiadas consultas. Esperá un rato y volvé a intentar." },
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  message: { error: "Demasiados intentos de acceso. Esperá 15 minutos y volvé a intentar." },
});
app.use(["/login", "/registro"], authLimiter);

app.use(rutasSesion);
app.use(rutasClientes);
app.use(rutasTurnos);
app.use(rutasProfesionales);
app.use(rutasServicios);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);

  getPool().catch((e) => console.error("No se pudo pre-calentar la conexión a la base:", e.message));
});

module.exports = app;
