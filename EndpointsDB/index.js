const express = require("express");
const sql = require("mssql");
const app = express();
const jwt = require("jsonwebtoken");
const JWT_SECRET = "RamirFSim2026";

app.use(express.json());

const dbConfig = {
  server: "localhost",
  database: "TurnosBarberiaQC",
  user: "sa",
  password: "324155",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(dbConfig);
  return pool;
}

function adminAuthJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token requerido." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.rol !== "admin") {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}



async function basicAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Barberia"');
    return res.status(401).send('Authentication required');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [email, password] = credentials.split(':');

  try {
    const db = await getPool();

    // 1. busco en admin
    const adminResult = await db.request()
      .input("email", sql.VarChar, email)
      .input("password", sql.VarChar, password)
      .query("select idadmin, nombre from Administrador where email = @email and password = @password");

    if (adminResult.recordset.length > 0) {
        req.user = adminResult.recordset[0];
        req.user.rol = "admin";
        return next();
    }

    // 2. busco en cliente
    const clienteResult = await db.request()
      .input("email", sql.VarChar, email)
      .input("password", sql.VarChar, password)
      .query("select idcliente, nombre from cliente where email = @email and password = @password");

    if (clienteResult.recordset.length > 0) {
    req.user = clienteResult.recordset[0];
    req.user.rol = "cliente";
    return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Barberia"');
    return res.status(401).send('Invalid credentials');

  } catch (error) {
    console.error(error);
    return res.status(500).send('Error al validar credenciales.');
  }
}






async function adminBasicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Barberia Admin"');
    return res.status(401).send('Authentication required');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [usuario, password] = credentials.split(':');

  try {
    const db = await getPool();
    const result = await db.request()
      .input("usuario", sql.VarChar, usuario)
      .input("password", sql.VarChar, password)
      .query("select idadmin, nombre from Administrador where usuario = @usuario and password = @password");

    if (result.recordset.length === 0) {
      res.set('WWW-Authenticate', 'Basic realm="Barberia Admin"');
      return res.status(401).send('Invalid credentials');
    }

    req.admin = result.recordset[0];
    next();

  } catch (error) {
    console.error(error);
    return res.status(500).send('Error al validar credenciales.');
  }
}



app.post("/registro", async (req, res) => {
  const { nombre, apellido, email, telefono, password } = req.body;
  try {
    const db = await getPool();
    const result = await db.request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("email", sql.VarChar, email)
      .input("telefono", sql.VarChar, telefono || null)
      .input("password", sql.VarChar, password)
      .query(`
        INSERT INTO Cliente (nombre, apellido, email, telefono, password)
        OUTPUT INSERTED.idCliente
        VALUES (@nombre, @apellido, @email, @telefono, @password)
      `);
    res.status(201).json({ mensaje: "Cliente registrado.", idCliente: result.recordset[0].idCliente });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al registrar cliente." });
  }
});

// LOGIN
app.post("/login/cliente", basicAuthMiddleware, (req, res) => {
  res.json({
    mensaje: "Login exitoso.",
    rol: req.user.rol,
    usuario: req.user
  });
});

///LOGIN ADMIN

app.post("/admin/login", adminBasicAuth, (req, res) => {
  const token = jwt.sign(
    { idadmin: req.admin.idadmin, nombre: req.admin.nombre, rol: "admin" },
    JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ mensaje: "Login exitoso.", token });
});


// VER MIS TURNOS
app.get("/clientes/:idCliente/turnos", async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input("idCliente", sql.Int, req.params.idCliente)
      .query(`
        SELECT t.idTurno, t.fecha, t.horaInicio, t.estado, t.precioTotal,
               p.nombre + ' ' + p.apellido AS profesional,
               s.nombre AS servicio
        FROM Turno t
        JOIN Profesional p ON t.idProfesional = p.idProfesional
        JOIN Servicio s ON t.idServicio = s.idServicio
        WHERE t.idCliente = @idCliente
        ORDER BY t.fecha DESC
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener turnos." });
  }
});




 
// VER TURNOS DISPONIBLES
app.get("/turnos/disponibles", async (req, res) => {
  const { fecha, idProfesional } = req.query;
  try {
    const db = await getPool();
    const ocupados = await db.request()
      .input("idProfesional", sql.Int, idProfesional)
      .input("fecha", sql.Date, fecha)
      .query("SELECT horaInicio, horaFin FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND estado = 'Confirmado'");
    res.json({ fecha, idProfesional, turnosOcupados: ocupados.recordset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar disponibilidad." });
  }
});
 
// RESERVAR TURNO
app.post("/turnos", async (req, res) => {
  const { idCliente, idProfesional, idServicio, fecha, horaInicio } = req.body;
  try {
    const db = await getPool();
 
    const servicio = await db.request()
      .input("idServicio", sql.Int, idServicio)
      .query("SELECT duracion_minutos, precio FROM Servicio WHERE idServicio = @idServicio");
 
    const { duracion_minutos, precio } = servicio.recordset[0];
 
    const result = await db.request()
      .input("idProfesional", sql.Int, idProfesional)
      .input("idCliente", sql.Int, idCliente)
      .input("idServicio", sql.Int, idServicio)
      .input("fecha", sql.Date, fecha)
      .input("horaInicio", sql.VarChar, horaInicio)
      .input("duracion", sql.Int, duracion_minutos)
      .input("precio", sql.Decimal(10, 2), precio)
      .query(`
        INSERT INTO Turno (idProfesional, idCliente, idServicio, fecha, horaInicio, duracionReal, precioTotal)
        OUTPUT INSERTED.idTurno
        VALUES (@idProfesional, @idCliente, @idServicio, @fecha, @horaInicio, @duracion, @precio)
      `);
 
    res.status(201).json({ mensaje: "Turno reservado.", idTurno: result.recordset[0].idTurno });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al reservar turno." });
  }
});
 
// CANCELAR TURNO
app.patch("/turnos/:id/cancelar", async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE Turno SET estado = 'Cancelado' WHERE idTurno = @id");
    res.json({ mensaje: "Turno cancelado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al cancelar turno." });
  }
});
 
// ── ADMIN ──
 
// CARGAR PROFESIONAL
app.post("/profesionales", adminAuthJWT, async (req, res) => {
  const { nombre, apellido, email, telefono } = req.body;
  try {
    const db = await getPool();
    const result = await db.request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("email", sql.VarChar, email)
      .input("telefono", sql.VarChar, telefono || null)
      .query(`
        INSERT INTO Profesional (nombre, apellido, email, telefono)
        OUTPUT INSERTED.idProfesional
        VALUES (@nombre, @apellido, @email, @telefono)
      `);
    res.status(201).json({ mensaje: "Profesional registrado.", idProfesional: result.recordset[0].idProfesional });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al registrar profesional." });
  }
});

 
// BAJAR PROFESIONAL
app.delete("/profesionales/:id", async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE Profesional SET activo = 0 WHERE idProfesional = @id");
    res.json({ mensaje: "Profesional dado de baja." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al dar de baja profesional." });
  }
});
 
// EDITAR HORARIOS
app.put("/profesionales/:id/horarios", async (req, res) => {
  const { horarios } = req.body;
  const db = await getPool();
  const transaction = new sql.Transaction(db);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM HorarioLaboral WHERE idProfesional = @id");
 
    for (const h of horarios) {
      await new sql.Request(transaction)
        .input("id", sql.Int, req.params.id)
        .input("dia", sql.Int, h.diaSemana)
        .input("entrada", sql.VarChar, h.horaEntrada)
        .input("salida", sql.VarChar, h.horaSalida)
        .query("INSERT INTO HorarioLaboral (idProfesional, diaSemana, horaEntrada, horaSalida) VALUES (@id, @dia, @entrada, @salida)");
    }
 
    await transaction.commit();
    res.json({ mensaje: "Horarios actualizados." });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: "Error al actualizar horarios." });
  }
});
 
// VER AGENDA
app.get("/profesionales/:id/agenda", async (req, res) => {
  const { fecha } = req.query;
  try {
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .input("fecha", sql.Date, fecha)
      .query(`
        SELECT t.idTurno, t.horaInicio, t.horaFin, t.estado,
               c.nombre + ' ' + c.apellido AS cliente, c.telefono,
               s.nombre AS servicio
        FROM Turno t
        JOIN Cliente c ON t.idCliente = c.idCliente
        JOIN Servicio s ON t.idServicio = s.idServicio
        WHERE t.idProfesional = @id AND t.fecha = @fecha
        ORDER BY t.horaInicio
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener agenda." });
  }
});
 
// CREAR SERVICIO
app.post("/servicios", async (req, res) => {
  const { nombre, precio, duracion_minutos } = req.body;
  try {
    const db = await getPool();
    const result = await db.request()
      .input("nombre", sql.VarChar, nombre)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("duracion", sql.Int, duracion_minutos)
      .query(`
        INSERT INTO Servicio (nombre, precio, duracion_minutos)
        OUTPUT INSERTED.idServicio
        VALUES (@nombre, @precio, @duracion)
      `);
    res.status(201).json({ mensaje: "Servicio creado.", idServicio: result.recordset[0].idServicio });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear servicio." });
  }
});
 
// ACTUALIZAR PRECIO / SERVICIO
app.patch("/servicios/:id", async (req, res) => {
  const { nombre, precio, duracion_minutos } = req.body;
  try {
    const db = await getPool();
    await db.request()
      .input("id", sql.Int, req.params.id)
      .input("nombre", sql.VarChar, nombre)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("duracion", sql.Int, duracion_minutos)
      .query("UPDATE Servicio SET nombre = @nombre, precio = @precio, duracion_minutos = @duracion WHERE idServicio = @id");
    res.json({ mensaje: "Servicio actualizado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar servicio." });
  }
});
 
// ELIMINAR SERVICIO
app.delete("/servicios/:id", async (req, res) => {
  try {
    const db = await getPool();
    await db.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Servicio WHERE idServicio = @id");
    res.json({ mensaje: "Servicio eliminado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar servicio." });
  }
});



const PORT = 3000;
app.listen(PORT, async () => {
  try {
    await getPool();
    console.log(`Servidor en http://localhost:${PORT}`);
    console.log("Conectado a SQL Server.");
  } catch (err) {
    console.error("No se pudo conectar:", err.message);
  }
});