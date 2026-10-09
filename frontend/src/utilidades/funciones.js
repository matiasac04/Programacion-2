const formateadorFecha = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })

export const fechaAIso = (value) => {
  const d = value instanceof Date ? value : new Date(`${String(value).trim().split('T')[0]}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const esDiaCerrado = (weekday) => weekday === 0 || weekday === 1

export const formatoFecha = (date) => {
  const [weekday, day, month] = formateadorFecha.format(date).split(' ')
  return { label: weekday.replace('.', ''), date: `${day} ${month}` }
}

export const patronDelDia = (date) => {
  const weekday = date.getDay()
  if (esDiaCerrado(weekday)) return null
  const mapping = { 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab' }
  return mapping[weekday] ?? null
}

export const datosDelDia = (fechaIso) => {
  const dateStr = String(fechaIso).trim().split('T')[0]
  const d = new Date(`${dateStr}T00:00:00`)
  const pat = patronDelDia(d)
  const lbl = formatoFecha(d)
  return { idDia: pat ?? 'dom', etiquetaDia: lbl.label, fechaDia: lbl.date }
}

const MINUTOS_POR_SLOT = 30

export const DIAS_ATENCION = [2, 3, 4, 5, 6]

const patronADia = { mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 }

const horaAMinutos = (time) => {
  const p = String(time).split(':').map(Number)
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}

const minutosAHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const generarHorariosDelRango = (start, end) => {
  const slots = []
  const s = horaAMinutos(start)
  const e = horaAMinutos(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return slots
  for (let m = s; m <= e; m += MINUTOS_POR_SLOT) slots.push(minutosAHora(m))
  return slots
}

export const horariosDeLaSemana = (horarioLaboral, idProfesional, patronDia, horariosRespaldo) => {
  const diaJS = patronADia[patronDia]
  const rows = (Array.isArray(horarioLaboral) ? horarioLaboral : []).filter((r) =>
    String(r.idProfesional) === String(idProfesional) && Number(r.diaSemana) === diaJS &&
    r.horaEntrada != null && r.horaSalida != null
  )
  if (rows.length === 0) return Array.isArray(horariosRespaldo) ? [...horariosRespaldo] : []
  const ranges = rows.map((r) => ({ start: r.horaEntrada, end: r.horaSalida }))
  return [...new Set(ranges.flatMap((r) => generarHorariosDelRango(r.start, r.end)))].sort()
}

const fechaHoraDelTurno = (booking) => {
  if (!booking?.fecha || !booking?.hora) return null

  let dateStr = String(booking.fecha).trim()
  if (dateStr.includes('T')) dateStr = dateStr.split('T')[0]

  let timeStr = String(booking.hora).trim()
  if (timeStr.includes('T')) timeStr = timeStr.split('T')[1]
  timeStr = timeStr.replace('Z', '').slice(0, 8)

  const timeParts = timeStr.split(':')
  if (timeParts.length >= 2) {
    const hh = timeParts[0].padStart(2, '0')
    const mm = timeParts[1].padStart(2, '0')
    const ss = (timeParts[2] || '00').padStart(2, '0')
    timeStr = `${hh}:${mm}:${ss}`
  }

  const dt = new Date(`${dateStr}T${timeStr}`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export const sePuedeCancelar = (booking) => {
  const dt = fechaHoraDelTurno(booking)
  if (!dt) return false
  return (dt.getTime() - Date.now()) / 36e5 > 24
}

export const estadoDelTurno = (estado, fechaIso, hora) => {
  const e = String(estado ?? '')
  if (e === 'Cancelado') return 'Cancelado'
  if (e === 'Completado') return 'Completado'
  if (e === 'NoSePresento') return 'NoSePresento'
  const dateStr = String(fechaIso ?? '').split('T')[0]
  const yaPaso = dateStr && hora ? new Date(`${dateStr}T${hora}:00`) < new Date() : false
  return yaPaso ? 'Expirado' : 'Confirmado'
}

export const formatoCuentaRegresiva = (booking) => {
  const dt = fechaHoraDelTurno(booking)
  if (!dt) return ''
  const diff = dt.getTime() - Date.now()
  if (diff <= 0) return 'Ya pasó'
  const totalMin = Math.floor(diff / 6e4)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const minutes = totalMin % 60
  const t = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  if (days > 0) return `En ${days} día${days === 1 ? '' : 's'} a las ${t}`
  if (hours > 0) return `Hoy a las ${t} · faltan ${hours} h`
  return `En ${Math.max(minutes, 1)} min`
}

const filasDeBloqueo = (bloqueosPorFecha, idProfesional, fecha) => {
  if (!Array.isArray(bloqueosPorFecha)) return []
  const dateStr = String(fecha).trim().split('T')[0]
  return bloqueosPorFecha.filter((b) => String(b.idProfesional) === String(idProfesional) && String(b.fecha).trim().split('T')[0] === dateStr)
}

export const bloqueosDeLaFecha = (bloqueosPorFecha, idProfesional, fecha, horariosFijos) => {
  const rows = filasDeBloqueo(bloqueosPorFecha, idProfesional, fecha)
  if (rows.some((r) => r.hora === null || r.hora === undefined || r.hora === '')) return Array.isArray(horariosFijos) ? horariosFijos : []
  return rows.map((r) => r.hora)
}

export const horariosPasados = (fecha, horarios, ahora = new Date()) => {
  const dateStr = String(fecha).trim().split('T')[0]
  if (dateStr !== fechaAIso(ahora)) return []
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes()
  return (Array.isArray(horarios) ? horarios : []).filter((s) => horaAMinutos(s) <= minAhora)
}

export const horariosLibresDelDia = (turnosOcupados, idProfesional, fecha, horariosFijos, bloqueosPorFecha, horarioLaboral) => {
  const pat = patronDelDia(new Date(`${fecha}T00:00:00`))
  if (!pat) return []
  const daySlots = horariosDeLaSemana(horarioLaboral, idProfesional, pat, horariosFijos)
  const dateRows = filasDeBloqueo(bloqueosPorFecha, idProfesional, fecha)
  if (dateRows.some((r) => r.hora === null || r.hora === undefined || r.hora === '')) return []
  const dateKey = String(fecha).trim().split('T')[0]
  const blocked = new Set([...(turnosOcupados[idProfesional]?.[dateKey] ?? []), ...dateRows.map((r) => r.hora), ...horariosPasados(fecha, daySlots)])
  return daySlots.filter((s) => !blocked.has(s))
}
