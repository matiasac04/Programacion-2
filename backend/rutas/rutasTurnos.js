const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, requireAdmin } = require("../autenticacion");
const { errorFecha, errorId } = require("../validaciones");
const { enviarMail, htmlConfirmacionTurno, formatearFecha } = require("../mailer");

const MS_24H = 24 * 60 * 60 * 1000;

const UTC_OFFSET_ARS = -3 * 60 * 60 * 1000;
const inicioDeTurno = (fechaIso, horaInicio) => {
  const f = new Date(`${String(fechaIso ?? '').trim()}T00:00:00Z`);
  if (Number.isNaN(f.getTime())) return null;
  const [h, m] = String(horaInicio ?? "00:00").slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const inicio = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate(), h, m, 0, 0) - UTC_OFFSET_ARS);
  return Number.isNaN(inicio.getTime()) ? null : inicio;
};

const tieneMenosDe24h = (fechaIso, horaInicio) => {
  const inicio = inicioDeTurno(fechaIso, horaInicio);
  if (!inicio) return false;
  return inicio.getTime() - Date.now() < MS_24H;
};

const horarioYaPaso = (fechaIso, horaInicio) => {
  const inicio = inicioDeTurno(fechaIso, horaInicio);
  if (!inicio) return false;
  return inicio.getTime() <= Date.now();
};

const normalizarHora = (valor) => {
  const p = String(valor ?? '').trim().slice(0, 5).split(':').map(Number);
  if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return '';
  if (p[0] < 0 || p[0] > 23 || p[1] < 0 || p[1] > 59) return '';
  return `${String(p[0]).padStart(2, '0')}:${String(p[1]).padStart(2, '0')}`;
};

const SLOTS_POR_DIA = 30;

const SLOTS_FALLBACK = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '15:00', '15:30', '16:00', '16:30', '17:00'];

const aMinutos = (hora) => {
  const p = String(hora ?? '').slice(0, 5).split(':').map(Number);
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
};

const desdeMinutos = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const slotsAtendiblesDelDia = async (db, idProfesional, diaSemana) => {
  const rows = await db.request()
    .input("idProfesional", sql.Int, idProfesional)
    .input("diaSemana", sql.Int, diaSemana)
    .query(`
      SELECT CONVERT(varchar(5), horaEntrada, 108) AS horaEntrada,
             CONVERT(varchar(5), horaSalida, 108) AS horaSalida
      FROM HorarioLaboral
      WHERE idProfesional = @idProfesional AND diaSemana = @diaSemana
        AND horaEntrada IS NOT NULL AND horaSalida IS NOT NULL
    `);
  if (rows.recordset.length === 0) return SLOTS_FALLBACK;
  const slots = new Set();
  for (const r of rows.recordset) {
    const desde = aMinutos(r.horaEntrada), hasta = aMinutos(r.horaSalida);
    if (hasta < desde) continue;
    for (let m = desde; m <= hasta; m += SLOTS_POR_DIA) slots.add(desdeMinutos(m));
  }
  return [...slots].sort();
};

const estaBloqueado = async (db, idProfesional, fecha, hora) => {
  const r = await db.request()
    .input("idProfesional", sql.Int, idProfesional)
    .input("fecha", sql.Date, fecha)
    .input("hora", sql.VarChar, hora)
    .query("SELECT idBloqueo FROM BloqueoHorario WHERE idProfesional = @idProfesional AND fecha = @fecha AND (hora IS NULL OR hora = @hora)");
  return r.recordset.length > 0;
};

const avisarReservaPorMail = async (db, { idCliente, idProfesional, idServicio, fecha, hora }) => {
  const r = await new sql.Request(db)
    .input("idCliente", sql.Int, idCliente)
    .input("idProfesional", sql.Int, idProfesional)
    .input("idServicio", sql.Int, idServicio)
    .query(`
      SELECT c.email,
             LTRIM(RTRIM(c.nombre + ' ' + ISNULL(c.apellido, ''))) AS cliente,
             LTRIM(RTRIM(p.nombre + ' ' + ISNULL(p.apellido, ''))) AS profesional,
             s.nombre AS servicio, s.precio, s.duracion_minutos
      FROM Cliente c
      CROSS JOIN Profesional p
      CROSS JOIN Servicio s
      WHERE c.idCliente = @idCliente
        AND p.idProfesional = @idProfesional
        AND s.idServicio = @idServicio
    `);
  if (r.recordset.length === 0) return;
  const { email, cliente, profesional, servicio, precio, duracion_minutos } = r.recordset[0];
  if (!email) return;
  await enviarMail({
    para: email,
    asunto: `Turno reservado: ${formatearFecha(fecha)} a las ${hora} hs`,
    html: htmlConfirmacionTurno({ cliente, servicio, profesional, fecha, hora, precio, duracion: duracion_minutos }),
  });
};

router.get("/turnos/disponibles", jwtMiddleware, async (req, res) => {
  const { fecha, idProfesional } = req.query;

  const errFecha = errorFecha(fecha);
  if (errFecha) return res.status(400).json({ error: errFecha });
  const errId = errorId(idProfesional);
  if (errId) return res.status(400).json({ error: errId });
  try {
    const db = await getPool();
    const ocupados = await db.request()
      .input("idProfesional", sql.Int, Number(idProfesional))
      .input("fecha", sql.Date, fecha)
      .query("SELECT CONVERT(varchar(5), horaInicio, 108) AS horaInicio, CONVERT(varchar(5), horaFin, 108) AS horaFin FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND (estado IS NULL OR estado <> 'Cancelado')");
    res.json({ fecha, idProfesional: Number(idProfesional), turnosOcupados: ocupados.recordset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar disponibilidad." });
  }
});

router.get("/turnos/ocupados", jwtMiddleware, async (req, res) => {
  const { inicio, fin } = req.query;

  const errInicio = errorFecha(inicio);
  if (errInicio) return res.status(400).json({ error: `Parámetro "inicio": ${errInicio}` });
  const errFin = errorFecha(fin);
  if (errFin) return res.status(400).json({ error: `Parámetro "fin": ${errFin}` });

  if (inicio > fin) {
    return res.status(400).json({ error: 'El rango de fechas está invertido: "inicio" tiene que ser anterior a "fin".' });
  }

  const dias = (new Date(`${fin}T00:00:00`) - new Date(`${inicio}T00:00:00`)) / 86400000;
  if (dias > 93) {
    return res.status(400).json({ error: "El rango es demasiado grande (máximo 3 meses)." });
  }
  try {
    const db = await getPool();
    const ocupados = await db.request()
      .input("inicio", sql.Date, inicio)
      .input("fin", sql.Date, fin)
      .query("SELECT idProfesional, CONVERT(varchar(10), fecha, 23) AS fecha, CONVERT(varchar(5), horaInicio, 108) AS horaInicio FROM Turno WHERE fecha BETWEEN @inicio AND @fin AND (estado IS NULL OR estado <> 'Cancelado')");
    res.json(ocupados.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar turnos ocupados." });
  }
});

router.get("/turnos", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .query(`
        SELECT t.idTurno, t.idCliente, t.idProfesional, t.idServicio, CONVERT(varchar(10), t.fecha, 23) AS fecha, CONVERT(varchar(5), t.horaInicio, 108) AS horaInicio, t.estado, t.precioTotal,
               c.nombre + ' ' + c.apellido AS nombreCliente, c.email, COALESCE(t.telefono, c.telefono) AS telefono,
               p.nombre + ' ' + p.apellido AS profesional,
               s.nombre AS servicio
        FROM Turno t
        JOIN Cliente c ON t.idCliente = c.idCliente
        JOIN Profesional p ON t.idProfesional = p.idProfesional
        JOIN Servicio s ON t.idServicio = s.idServicio
        ORDER BY t.fecha DESC, t.horaInicio ASC
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener turnos." });
  }
});

router.post("/turnos", jwtMiddleware, async (req, res) => {
  const { idCliente, idProfesional, idServicio, fecha, horaInicio, telefono } = req.body;

  if (!idCliente || !idProfesional || !idServicio || !fecha || !horaInicio) {
    return res.status(400).json({ error: "Cliente, profesional, servicio, fecha y horario son obligatorios." });
  }

  const hora = normalizarHora(horaInicio);
  if (!hora) {
    return res.status(400).json({ error: "El horario no tiene un formato válido (se espera HH:MM)." });
  }

  if (Number(req.user.idCliente) !== Number(idCliente)) {
    return res.status(403).json({ error: "No podés reservar un turno a nombre de otro cliente." });
  }

  const fechaObj = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(fechaObj.getTime())) {
    return res.status(400).json({ error: "La fecha indicada no es válida." });
  }
  const diaNum = fechaObj.getDay();
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
  const hoyFin = new Date(hoyInicio); hoyFin.setDate(hoyFin.getDate() + 30); hoyFin.setHours(23, 59, 59, 999);
  if (diaNum === 0 || diaNum === 1) {
    return res.status(400).json({ error: "No se pueden pedir turnos los domingos ni los lunes (cerrado)." });
  }
  if (fechaObj < hoyInicio || fechaObj > hoyFin) {
    return res.status(400).json({ error: "Solo se pueden pedir turnos desde hoy hasta dentro de un mes." });
  }

  if (horarioYaPaso(fecha, hora)) {
    return res.status(400).json({ error: "Ese horario ya pasó. Elegí uno más adelante." });
  }

  try {
    const db = await getPool();

    const servicio = await db.request()
      .input("idServicio", sql.Int, idServicio)
      .query("SELECT duracion_minutos, precio FROM Servicio WHERE idServicio = @idServicio");

    if (servicio.recordset.length === 0) {
      return res.status(404).json({ error: "El servicio elegido no existe." });
    }
    const { duracion_minutos, precio } = servicio.recordset[0];

    const profesional = await db.request()
      .input("id", sql.Int, idProfesional)
      .query("SELECT activo FROM Profesional WHERE idProfesional = @id");
    if (profesional.recordset.length === 0) {
      return res.status(404).json({ error: "El profesional elegido no existe." });
    }
    if (profesional.recordset[0].activo !== true) {
      return res.status(400).json({ error: "Ese profesional no está disponible para recibir reservas." });
    }

    const slots = await slotsAtendiblesDelDia(db, idProfesional, diaNum);
    if (!slots.includes(hora)) {
      return res.status(400).json({ error: "Ese horario está fuera del horario de atención del profesional." });
    }

    if (await estaBloqueado(db, idProfesional, fecha, hora)) {
      return res.status(409).json({ error: "Ese horario está bloqueado. Elegí otro horario disponible." });
    }

    const transaction = new sql.Transaction(db);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const ocupado = await new sql.Request(transaction)
        .input("idProfesional", sql.Int, idProfesional)
        .input("fecha", sql.Date, fecha)
        .input("horaInicio", sql.VarChar, hora)
        .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND (estado IS NULL OR estado <> 'Cancelado')");

      if (ocupado.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ error: "Ese horario ya fue reservado. Elegí otro horario disponible." });
      }

      const result = await new sql.Request(transaction)
        .input("idProfesional", sql.Int, idProfesional)
        .input("idCliente", sql.Int, idCliente)
        .input("idServicio", sql.Int, idServicio)
        .input("fecha", sql.Date, fecha)
        .input("horaInicio", sql.VarChar, hora)
        .input("duracion", sql.Int, duracion_minutos)
        .input("precio", sql.Decimal(10, 2), precio)
        .input("telefono", sql.VarChar, telefono || null)
        .input("estado", sql.VarChar, 'Confirmado')
        .query(`
          INSERT INTO Turno (idProfesional, idCliente, idServicio, fecha, horaInicio, duracionReal, precioTotal, telefono, estado)
          OUTPUT INSERTED.idTurno
          VALUES (@idProfesional, @idCliente, @idServicio, @fecha, @horaInicio, @duracion, @precio, @telefono, @estado)
        `);

      await transaction.commit();
      res.status(201).json({ mensaje: "Turno reservado.", idTurno: result.recordset[0].idTurno });

      avisarReservaPorMail(db, { idCliente, idProfesional, idServicio, fecha, hora })
        .then(() => console.log("Mail de confirmación enviado."))
        .catch((e) => console.error("No se pudo enviar el mail de confirmación:", e.message));
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al reservar turno." });
  }
});

router.patch("/turnos/:id/cancelar", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();

    const turno = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("SELECT idCliente, CONVERT(varchar(10), fecha, 23) AS fecha, CONVERT(varchar(5), horaInicio, 108) AS horaIso FROM Turno WHERE idTurno = @id");
    if (turno.recordset.length === 0) return res.status(404).json({ error: "Turno no encontrado." });
    const { idCliente, fecha, horaIso } = turno.recordset[0];

    if (req.user.role !== 'admin' && Number(req.user.idCliente) !== Number(idCliente)) {
      return res.status(403).json({ error: "No tenés permiso para cancelar este turno." });
    }

    if (req.user.role !== 'admin' && tieneMenosDe24h(fecha, horaIso)) {
      return res.status(400).json({ error: "No se puede cancelar con menos de 24 horas de antelación. Contactanos al local." });
    }
    await db.request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE Turno SET estado = 'Cancelado' WHERE idTurno = @id");
    res.json({ mensaje: "Turno cancelado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al cancelar turno." });
  }
});

router.patch("/turnos/:id", jwtMiddleware, async (req, res) => {
  const { idProfesional, idServicio, fecha, horaInicio, estado, nombreCliente, telefono } = req.body;
  try {
    const db = await getPool();
    const turno = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("SELECT idCliente, idProfesional, fecha, CONVERT(varchar(10), fecha, 23) AS fechaIso, CONVERT(varchar(5), horaInicio, 108) AS horaIso FROM Turno WHERE idTurno = @id");
    if (turno.recordset.length === 0) return res.status(404).json({ error: "Turno no encontrado." });
    const turnoActual = turno.recordset[0];
    const idCliente = turnoActual.idCliente;
    if (req.user.role !== 'admin' && Number(req.user.idCliente) !== Number(idCliente)) {
      return res.status(403).json({ error: "No tenés permiso para editar este turno." });
    }

    if (estado !== undefined && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Solo el administrador puede cambiar el estado de un turno." });
    }

    if (estado !== undefined) {
      const estadosValidos = ['Confirmado', 'Completado', 'NoSePresento', 'Cancelado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ error: "El estado indicado no es válido." });
      }
    }

    if (req.user.role !== 'admin' && (fecha !== undefined || horaInicio !== undefined) && tieneMenosDe24h(turnoActual.fechaIso, turnoActual.horaIso)) {
      return res.status(400).json({ error: "No se puede reprogramar con menos de 24 horas de antelación. Contactanos al local." });
    }

    if (fecha !== undefined) {
      const fechaObj = new Date(`${fecha}T00:00:00`);
      const diaNum = fechaObj.getDay();
      const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
      const hoyFin = new Date(hoyInicio); hoyFin.setDate(hoyFin.getDate() + 30); hoyFin.setHours(23, 59, 59, 999);
      if (Number.isNaN(fechaObj.getTime()) || diaNum === 0 || diaNum === 1) {
        return res.status(400).json({ error: "La fecha elegida es domingo o lunes: la barbería está cerrada." });
      }
      if (fechaObj < hoyInicio || fechaObj > hoyFin) {
        return res.status(400).json({ error: "Solo se pueden pedir turnos desde hoy hasta dentro de un mes." });
      }
    }

    const profFinal = idProfesional != null ? idProfesional : turnoActual.idProfesional;

    const fechaFinal = fecha !== undefined ? fecha : turnoActual.fechaIso;
    const horaFinal = horaInicio !== undefined ? normalizarHora(horaInicio) : turnoActual.horaIso;

    if (req.user.role !== 'admin' && (fecha !== undefined || horaInicio !== undefined || idProfesional !== undefined)) {
      if (!horaFinal) return res.status(400).json({ error: "El horario no tiene un formato válido (se espera HH:MM)." });

      if (horarioYaPaso(fechaFinal, horaFinal)) {
        return res.status(400).json({ error: "Ese horario ya pasó. Elegí uno más adelante." });
      }
      const diaFinal = new Date(`${fechaFinal}T00:00:00`).getDay();
      const slotsFinal = await slotsAtendiblesDelDia(db, profFinal, diaFinal);
      if (!slotsFinal.includes(horaFinal)) {
        return res.status(400).json({ error: "Ese horario está fuera del horario de atención del profesional." });
      }
      if (await estaBloqueado(db, profFinal, fechaFinal, horaFinal)) {
        return res.status(409).json({ error: "Ese horario está bloqueado. Elegí otro horario disponible." });
      }
    }

    const transaction = new sql.Transaction(db);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {

      const ocupado = await new sql.Request(transaction)
        .input("idProfesional", sql.Int, profFinal)
        .input("fecha", sql.Date, fechaFinal)
        .input("horaInicio", sql.VarChar, horaFinal)
        .input("id", sql.Int, req.params.id)
        .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND idTurno <> @id AND (estado IS NULL OR estado <> 'Cancelado')");
      if (ocupado.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ error: "Ese horario ya fue reservado para ese profesional. Elegí otro horario disponible." });
      }

      const set = [];
      const reqPatch = new sql.Request(transaction).input("id", sql.Int, req.params.id);
      if (idProfesional !== undefined) { set.push("idProfesional = @idProfesional"); reqPatch.input("idProfesional", sql.Int, idProfesional); }
      if (idServicio !== undefined) { set.push("idServicio = @idServicio"); reqPatch.input("idServicio", sql.Int, idServicio); }
      if (fecha !== undefined) { set.push("fecha = @fecha"); reqPatch.input("fecha", sql.Date, fecha); }

      if (horaInicio !== undefined) { set.push("horaInicio = @horaInicio"); reqPatch.input("horaInicio", sql.VarChar, horaFinal); }
      if (estado !== undefined) {

        set.push("estado = @estado");
        reqPatch.input("estado", sql.VarChar, estado);
      }
      if (set.length > 0) await reqPatch.query(`UPDATE Turno SET ${set.join(", ")} WHERE idTurno = @id`);

      if (idCliente != null && (nombreCliente !== undefined || telefono !== undefined)) {
        const cs = [];
        const cReq = new sql.Request(transaction).input("idCliente", sql.Int, idCliente);
        if (nombreCliente !== undefined) {

          const partes = String(nombreCliente).trim().split(/\s+/);
          cs.push("nombre = @nombre", "apellido = @apellido");
          cReq.input("nombre", sql.VarChar, partes[0] ?? '');
          cReq.input("apellido", sql.VarChar, partes.slice(1).join(' ') || '');
        }
        if (telefono !== undefined) { cs.push("telefono = @telefono"); cReq.input("telefono", sql.VarChar, telefono || null); }
        if (cs.length > 0) await cReq.query(`UPDATE Cliente SET ${cs.join(", ")} WHERE idCliente = @idCliente`);
      }

      await transaction.commit();
      res.json({ mensaje: "Turno actualizado." });
    } catch (error) {

      try { await transaction.rollback(); } catch {}
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el turno." });
  }
});

router.delete("/turnos/:id", jwtMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Solo el administrador puede eliminar turnos." });
    }
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Turno WHERE idTurno = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Turno no encontrado." });
    res.json({ mensaje: "Turno eliminado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar el turno." });
  }
});

module.exports = router;
