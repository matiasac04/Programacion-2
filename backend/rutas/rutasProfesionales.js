const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, requireAdmin } = require("../autenticacion");
const { errorFecha, errorHora } = require("../validaciones");

const generarEmailProfesional = () => `prof_${Date.now()}_${Math.floor(Math.random() * 1000000)}@barberia.local`;

const normalizarEmailOpcional = (email) => (email && String(email).trim() ? String(email).trim() : null);

router.get("/profesionales", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const incluirInactivos = req.query.incluirInactivos === "1";
    const queryBase = "SELECT idProfesional, LTRIM(RTRIM(nombre + ' ' + ISNULL(apellido, ''))) AS nombre, email, telefono, activo FROM Profesional";
    const query = incluirInactivos ? `${queryBase} ORDER BY idProfesional` : `${queryBase} WHERE activo = 1 ORDER BY idProfesional`;
    const result = await db.request().query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener profesionales." });
  }
});

router.post("/profesionales", jwtMiddleware, requireAdmin, async (req, res) => {
  const { nombre, apellido, email, telefono } = req.body;
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: "El nombre del profesional es obligatorio." });
  }
  try {
    const db = await getPool();
    const apellidoFinal = apellido && String(apellido).trim() ? String(apellido).trim() : null;

    const emailFinal = normalizarEmailOpcional(email) || generarEmailProfesional();
    const result = await db.request()
      .input("nombre", sql.VarChar, String(nombre).trim())
      .input("apellido", sql.VarChar, apellidoFinal)
      .input("email", sql.VarChar, emailFinal)
      .input("telefono", sql.VarChar, telefono || null)
      .query(`
        INSERT INTO Profesional (nombre, apellido, email, telefono)
        OUTPUT INSERTED.idProfesional
        VALUES (@nombre, @apellido, @email, @telefono)
      `);
    res.status(201).json({ mensaje: "Profesional registrado.", idProfesional: result.recordset[0].idProfesional });
  } catch (error) {

    const violacionUnica = error?.number === 2627 || error?.number === 2601;
    if (violacionUnica) {
      return res.status(409).json({ error: "Ya existe un profesional con ese mail. Usá otro o dejá el mail vacío." });
    }
    console.error(error);
    res.status(500).json({ error: "Error al registrar profesional." });
  }
});

router.delete("/profesionales/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE Profesional SET activo = 0 WHERE idProfesional = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Profesional no encontrado." });
    res.json({ mensaje: "Profesional dado de baja." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al dar de baja profesional." });
  }
});

router.patch("/profesionales/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    const id = req.params.id;
    const set = [];
    const reqPatch = db.request().input("id", sql.Int, id);

    if (req.body.nombre !== undefined) {
      set.push("nombre = @nombre");
      reqPatch.input("nombre", sql.VarChar, req.body.nombre);
    }
    if (req.body.apellido !== undefined) {
      set.push("apellido = @apellido");
      reqPatch.input("apellido", sql.VarChar, req.body.apellido && String(req.body.apellido).trim() ? String(req.body.apellido).trim() : null);
    }
    if (req.body.telefono !== undefined) {
      set.push("telefono = @telefono");
      reqPatch.input("telefono", sql.VarChar, req.body.telefono || null);
    }
    if (req.body.email !== undefined) {

      const cur = await db.request()
        .input("id", sql.Int, id)
        .query("SELECT email FROM Profesional WHERE idProfesional = @id");
      const emailActual = cur.recordset[0]?.email;
      const emailFinal = normalizarEmailOpcional(req.body.email) || (emailActual && String(emailActual).trim()) || generarEmailProfesional();
      set.push("email = @email");
      reqPatch.input("email", sql.VarChar, emailFinal);
    }

    if (typeof req.body.activo === "boolean") {
      set.push("activo = @activo");
      reqPatch.input("activo", sql.Bit, req.body.activo ? 1 : 0);
    }

    if (set.length === 0) return res.status(400).json({ error: "No hay campos para actualizar." });
    await reqPatch.query(`UPDATE Profesional SET ${set.join(", ")} WHERE idProfesional = @id`);
    res.json({ mensaje: "Profesional actualizado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar profesional." });
  }
});

router.get("/horarios", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .query(`
        SELECT idProfesional, diaSemana,
               CONVERT(varchar(5), horaEntrada, 108) AS horaEntrada,
               CONVERT(varchar(5), horaSalida, 108) AS horaSalida
        FROM HorarioLaboral
        WHERE horaEntrada IS NOT NULL AND horaSalida IS NOT NULL
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener horarios." });
  }
});

router.put("/profesionales/:id/horarios", jwtMiddleware, requireAdmin, async (req, res) => {
  const { horarios } = req.body;
  if (!Array.isArray(horarios)) return res.status(400).json({ error: "Falta la lista de horarios." });

  for (const h of horarios) {
    const dia = Number(h && h.diaSemana);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
      return res.status(400).json({ error: "El día de la semana debe ser un número del 0 (domingo) al 6 (sábado)." });
    }
    if (h.horaEntrada != null) {
      const e = errorHora(h.horaEntrada);
      if (e) return res.status(400).json({ error: `horaEntrada: ${e}` });
    }
    if (h.horaSalida != null) {
      const e = errorHora(h.horaSalida);
      if (e) return res.status(400).json({ error: `horaSalida: ${e}` });
    }

    if (h.horaEntrada != null && h.horaSalida != null && h.horaSalida <= h.horaEntrada) {
      return res.status(400).json({ error: "La hora de salida tiene que ser posterior a la de entrada." });
    }
  }
  try {
    const db = await getPool();
    const profesionalId = Number(req.params.id);

    const existe = await new sql.Request(db)
      .input("id", sql.Int, profesionalId)
      .query("SELECT idProfesional FROM Profesional WHERE idProfesional = @id");
    if (existe.recordset.length === 0) {
      return res.status(404).json({ error: "Profesional no encontrado." });
    }
    const transaction = new sql.Transaction(db);
    await transaction.begin();
    try {

      await new sql.Request(transaction)
        .input("id", sql.Int, profesionalId)
        .query("DELETE FROM HorarioLaboral WHERE idProfesional = @id");

      if (horarios.length > 0) {
        for (const h of horarios) {
          await new sql.Request(transaction)
            .input("idProfesional", sql.Int, profesionalId)
            .input("diaSemana", sql.Int, Number(h.diaSemana))
            .input("horaEntrada", sql.VarChar, h.horaEntrada != null ? h.horaEntrada : null)
            .input("horaSalida", sql.VarChar, h.horaSalida != null ? h.horaSalida : null)
            .query(`INSERT INTO HorarioLaboral (idProfesional, diaSemana, horaEntrada, horaSalida) VALUES (@idProfesional, @diaSemana, @horaEntrada, @horaSalida)`);
        }
      }

      await transaction.commit();
      res.json({ mensaje: "Horarios actualizados." });
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar horarios." });
  }
});

router.get("/bloqueos", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .query(`
        SELECT idProfesional, CONVERT(varchar(10), fecha, 23) AS fecha, hora
        FROM BloqueoHorario
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener bloqueos." });
  }
});

router.post("/profesionales/:id/bloqueos", jwtMiddleware, requireAdmin, async (req, res) => {
  const { fecha, diaCompleto, slots } = req.body || {};
  if (!fecha) return res.status(400).json({ error: "Falta la fecha." });
  const errFecha = errorFecha(fecha);
  if (errFecha) return res.status(400).json({ error: errFecha });

  if (!diaCompleto && !Array.isArray(slots)) {
    return res.status(400).json({ error: 'Mandá "diaCompleto": true para bloquear el día entero, o "slots": [] para desbloquearlo.' });
  }

  if (Array.isArray(slots)) {
    for (const slot of slots) {
      if (slot == null) continue;
      const errHora = errorHora(slot);
      if (errHora) return res.status(400).json({ error: `Horario inválido: ${errHora}` });
    }
  }
  try {
    const db = await getPool();

    const existe = await new sql.Request(db)
      .input("id", sql.Int, req.params.id)
      .query("SELECT idProfesional FROM Profesional WHERE idProfesional = @id");
    if (existe.recordset.length === 0) {
      return res.status(404).json({ error: "Profesional no encontrado." });
    }
    const transaction = new sql.Transaction(db);
    await transaction.begin();
    try {

      await new sql.Request(transaction)
        .input("id", sql.Int, req.params.id)
        .input("fecha", sql.Date, fecha)
        .query("DELETE FROM BloqueoHorario WHERE idProfesional = @id AND fecha = @fecha");

      if (diaCompleto) {
        await new sql.Request(transaction)
          .input("id", sql.Int, req.params.id)
          .input("fecha", sql.Date, fecha)
          .query("INSERT INTO BloqueoHorario (idProfesional, fecha, hora) VALUES (@id, @fecha, NULL)");
      }

      else if (Array.isArray(slots)) {
        for (const slot of slots) {

          if (slot == null) continue;
          await new sql.Request(transaction)
            .input("id", sql.Int, req.params.id)
            .input("fecha", sql.Date, fecha)
            .input("hora", sql.VarChar, slot)
            .query("INSERT INTO BloqueoHorario (idProfesional, fecha, hora) VALUES (@id, @fecha, @hora)");
        }
      }

      await transaction.commit();
      res.json({ mensaje: "Bloqueos actualizados." });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar bloqueos." });
  }
});

module.exports = router;
