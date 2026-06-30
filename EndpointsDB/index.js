const express = require("express");

const { sql, config, getPool } = require("./conexion");

const { basicAuthMiddleware, jwtMiddleware, JWT_SECRET } = require("./auth");

const jwt = require("jsonwebtoken");



const app = express();
app.use(express.json());



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

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const db = await getPool();
    const result = await db.request()
      .input("email", sql.VarChar, email)
      .input("password", sql.VarChar, password)
      .query("SELECT idCliente, nombre FROM Cliente WHERE email = @email AND password = @password");
 
    if (result.recordset.length === 0) {
      return res.status(401).json({ error: "Email o password incorrectos." });
    }

    const clienteLogueado = result.recordset[0];

    const token = jwt.sign(
      { idCliente: clienteLogueado.idCliente, nombre: clienteLogueado.nombre },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ 
      mensaje: "Login exitoso.", 
      token: token,
      cliente: clienteLogueado 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al iniciar sesión." });
  }
});

// VER MIS TURNOS
app.get("/clientes/:idCliente/turnos", jwtMiddleware, async (req, res) => {
  try {
    if (req.user.idCliente != req.params.idCliente) {
        return res.status(403).json({ error: "No tenés permiso para ver los turnos de otro cliente." });
    }
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

app.post("/profesionales", basicAuthMiddleware, async (req, res) => {
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
app.delete("/profesionales/:id", basicAuthMiddleware, async (req, res) => {
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
app.put("/profesionales/:id/horarios", basicAuthMiddleware, async (req, res) => {
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
app.get("/profesionales/:id/agenda", basicAuthMiddleware, async (req, res) => {
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
app.post("/servicios", basicAuthMiddleware, async (req, res) => {
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
app.patch("/servicios/:id", basicAuthMiddleware, async (req, res) => {
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
app.delete("/servicios/:id", basicAuthMiddleware, async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});