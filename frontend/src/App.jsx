import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

import Admin from './components/admin/Admin';
import Inicio from './components/cliente/Inicio';
import IniciarSesion from './components/ingreso/IniciarSesion';
import MisTurnos from './components/cliente/MisTurnos';
import WhatsApp from './components/comunes/WhatsApp';

import { horariosFijos } from './datos/semilla';

import { actualizarProfesional, actualizarServicio, actualizarTurno, cancelarTurno, crearProfesional, crearServicio, eliminarProfesional, eliminarServicio, eliminarTurno, guardarBloqueos, guardarHorarios, loginCliente, obtenerBloqueos, obtenerHorarios, obtenerProfesionales, obtenerServicios, obtenerTurnos, obtenerTurnosCliente, obtenerTurnosDisponibles, obtenerTurnosOcupados, registrarCliente, reservarTurno, verificarToken } from './servicios/api';

import { sePuedeCancelar, formatoFecha, bloqueosDeLaFecha, patronDelDia, horariosDeLaSemana, horariosPasados, esDiaCerrado, estadoDelTurno, datosDelDia, fechaAIso } from './utilidades/funciones';

const today = new Date(), calendarStart = new Date(today), calendarEnd = new Date(today);
calendarStart.setHours(0, 0, 0, 0); calendarEnd.setDate(calendarEnd.getDate() + 30); calendarEnd.setHours(23, 59, 59, 999);

const initialCalendarDate = fechaAIso(calendarStart);

function App() {

  const [vista, setVista] = useState('cliente');
  const [token, setToken] = useState(() => { try { return localStorage.getItem('token') ?? ''; } catch { return ''; } });
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem('currentUser') ?? 'null'); } catch { return null; } });
  const sesionIniciada = Boolean(token && currentUser);

  const [pantallaAcceso, setPantallaAcceso] = useState('ingreso');
  const [correoIngreso, setCorreoIngreso] = useState(''); const [claveIngreso, setClaveIngreso] = useState('');
  const [formularioRegistro, setFormularioRegistro] = useState({ nombre: '', apellido: '', email: '', telefono: '', password: '' });

  const [avisoAcceso, setAvisoAcceso] = useState({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });

  const [profesionales, setProfesionales] = useState([]);
  const [todosProfesionales, setTodosProfesionales] = useState([]);
  const [servicios, setServicios] = useState([]);

  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState(null);
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(initialCalendarDate);
  const [horaSeleccionada, setHoraSeleccionada] = useState('09:00');
  const [nombreCliente, setNombreCliente] = useState(''); const [telefonoCliente, setTelefonoCliente] = useState('');

  const [turnosConfirmados, setTurnosConfirmados] = useState([]);

  const [aviso, setAviso] = useState({ type: 'idle', message: 'Elegí profesional, día y horario para reservar.' });
  const [enviando, setSubmitting] = useState(false);

  const [horariosOcupadosApi, setHorariosOcupadosApi] = useState([]);
  const [cargandoDisponibilidad, setLoadingAvailability] = useState(true);
  const [bloqueosPorFecha, setBloqueosPorFecha] = useState([]);
  const [horarioLaboral, setHorarioLaboral] = useState([]);
  const [rangoReservado, setBookedRange] = useState([]);

  const [errorCarga, setErrorCarga] = useState('');

const [intentoRecarga, setIntentoRecarga] = useState(0);

  useEffect(() => { if (profesionales.length > 0 && !profesionales.some((b) => b.id === profesionalSeleccionado)) setProfesionalSeleccionado(profesionales[0].id); }, [profesionales, profesionalSeleccionado]);
  useEffect(() => { if (servicios.length > 0 && !servicios.some((s) => s.id === servicioSeleccionado)) setServicioSeleccionado(servicios[0].id); }, [servicioSeleccionado, servicios]);

  useEffect(() => { setNombreCliente(currentUser?.name ?? ''); setTelefonoCliente(currentUser?.phone ?? ''); }, [currentUser]);

  const expulsarPorSesion = useCallback(() => {
    setToken(''); setCurrentUser(null); setTurnosConfirmados([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setPantallaAcceso('ingreso'); setCorreoIngreso(''); setClaveIngreso('');
    setAvisoAcceso({ type: 'error', message: 'Tu sesión venció. Iniciá sesión de nuevo para continuar.' });
  }, []);

  useEffect(() => {
    let cancelado = false;
    if (!token || !currentUser || currentUser.provider === 'google') return;
    verificarToken(token)
      .then(() => { if (cancelado) return; setAvisoAcceso({ type: 'success', message: currentUser.role === 'admin' ? 'Bienvenido administrador.' : `Sesión iniciada con ${currentUser.email}.` }); })
      .catch(() => { if (!cancelado) expulsarPorSesion(); });
    return () => { cancelado = true; };
  }, [token, currentUser, expulsarPorSesion]);

  const cargarProfesionales = useCallback(async () => {
    if (!token) return;
    try {
      const p = await obtenerProfesionales(token);
      if (Array.isArray(p) && p.length > 0) setProfesionales(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' })));
    } catch (error) { console.warn('No se pudieron obtener los profesionales:', error); }
  }, [token]);

  const cargarTodosProfesionales = useCallback(async () => {
    if (!token) return;
    try {
      const p = await obtenerProfesionales(token, true);
      if (Array.isArray(p)) setTodosProfesionales(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false })));
    } catch (error) { console.warn('No se pudieron obtener todos los profesionales:', error); }
  }, [token]);

  const cargarServicios = useCallback(async () => {
    try {
      const s = await obtenerServicios();
      if (Array.isArray(s) && s.length > 0) setServicios(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos })));
    } catch (error) { console.warn('No se pudieron obtener los servicios:', error); }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;

    const valor = (resultado, etiqueta) => {
      if (resultado.status === 'rejected') { console.warn(`[carga inicial] Falló ${etiqueta}:`, resultado.reason); return null; }
      return resultado.value;
    };
    Promise.allSettled([obtenerProfesionales(token), obtenerProfesionales(token, true), obtenerServicios(), obtenerBloqueos(token), obtenerHorarios(token), obtenerTurnosOcupados(initialCalendarDate, fechaAIso(calendarEnd), token)])
      .then(([rp, rpa, rs, rb, rh, ro]) => {
        if (cancelado) return;
        const fallidas = [];
        const p = valor(rp, 'profesionales') ?? (fallidas.push('profesionales'), null);
        const pa = valor(rpa, 'todos los profesionales') ?? (fallidas.push('todos los profesionales'), null);
        const s = valor(rs, 'servicios') ?? (fallidas.push('servicios'), null);
        const b = valor(rb, 'bloqueos') ?? (fallidas.push('bloqueos'), null);
        const h = valor(rh, 'horarios') ?? (fallidas.push('horarios'), null);
        const o = valor(ro, 'turnos ocupados') ?? (fallidas.push('turnos ocupados'), null);
        if (Array.isArray(p) && p.length > 0) setProfesionales(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' })));
        if (Array.isArray(pa)) setTodosProfesionales(pa.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false })));
        if (Array.isArray(s) && s.length > 0) setServicios(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos })));
        if (Array.isArray(b)) setBloqueosPorFecha(b);
        if (Array.isArray(h)) setHorarioLaboral(h);
        if (Array.isArray(o)) setBookedRange(o);
        setErrorCarga(fallidas.length ? `No se pudo cargar: ${fallidas.join(', ')}. Revisá que el backend esté corriendo.` : '');
      });
return () => { cancelado = true; };
    }, [token, intentoRecarga]);

  const refrescarOcupados = useCallback(() => {
    if (!token) return;
    obtenerTurnosOcupados(initialCalendarDate, fechaAIso(calendarEnd), token)
      .then((o) => { if (Array.isArray(o)) setBookedRange(o); })
      .catch(() => {});
  }, [token]);

  const normalizarHoraApi = useCallback((valor) => {
    if (!valor) return '';
    const s = String(valor).trim();
    const hhmmss = s.includes('T') ? s.split('T')[1].replace('Z', '') : s;
    const p = hhmmss.slice(0, 8).split(':');
    if (!p[1]) { console.warn('[horaApi] No se pudo normalizar la hora que llegó del backend:', valor); return ''; }
    return `${p[0].padStart(2, '0')}:${p[1].padStart(2, '0')}`;
  }, []);

  const cargarDisponibilidad = useCallback(() => {
    if (!token || !fechaSeleccionada || !profesionalSeleccionado) return;
    setLoadingAvailability(true);
    obtenerTurnosDisponibles(fechaSeleccionada, profesionalSeleccionado, token)
      .then((r) => setHorariosOcupadosApi((r?.turnosOcupados ?? []).map((t) => normalizarHoraApi(t.horaInicio)).filter(Boolean)))
      .catch(() => setHorariosOcupadosApi([]))
      .finally(() => setLoadingAvailability(false));
  }, [token, fechaSeleccionada, profesionalSeleccionado, normalizarHoraApi]);
  useEffect(() => { cargarDisponibilidad(); }, [cargarDisponibilidad]);

  const cargarMisTurnos = useCallback(async () => {
    if (!currentUser?.idCliente || !token) return;
    try {
      const res = await obtenerTurnosCliente(currentUser.idCliente, token);
      const lista = Array.isArray(res) ? res : (res?.turnos ?? res?.data ?? []);
      if (!Array.isArray(lista)) return;
      setTurnosConfirmados(lista.map((t) => {
        const fechaIso = fechaAIso(t.fecha), hora = normalizarHoraApi(t.horaInicio);
        const estado = estadoDelTurno(t.estado, fechaIso, hora);
        return { id: t.idTurno, emailCliente: currentUser.email, idProfesional: t.idProfesional ?? null, nombreProfesional: t.profesional, nombreServicio: t.servicio, precioServicio: t.precioTotal, fecha: fechaIso, hora, nombreCliente: currentUser.name, estado, ...datosDelDia(fechaIso) };
      }));
    } catch (error) { if (error?.status === 401) expulsarPorSesion(); }
  }, [currentUser, token, expulsarPorSesion, normalizarHoraApi]);
  useEffect(() => { if (sesionIniciada && currentUser?.role !== 'admin') cargarMisTurnos(); }, [sesionIniciada, cargarMisTurnos, currentUser?.role]);

  useEffect(() => {
    if (!sesionIniciada || currentUser?.role === 'admin') return;
    const onVisible = () => { if (document.visibilityState === 'visible') cargarMisTurnos(); };
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => { if (document.visibilityState === 'visible') cargarMisTurnos(); }, 20000);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [sesionIniciada, currentUser?.role, cargarMisTurnos]);

  const cargarTurnosAdmin = useCallback(async () => {
    if (!token) return;
    try {
      const res = await obtenerTurnos(token);
      const lista = Array.isArray(res) ? res : (res?.turnos ?? res?.data ?? []);
      if (!Array.isArray(lista)) return;
      setTurnosConfirmados(lista.map((t) => {
        const fechaIso = fechaAIso(t.fecha), hora = normalizarHoraApi(t.horaInicio);
        const estado = estadoDelTurno(t.estado, fechaIso, hora);
        return { id: t.idTurno, idCliente: t.idCliente ?? null, emailCliente: t.email ?? '', idProfesional: t.idProfesional ?? null, idServicio: t.idServicio ?? null, nombreProfesional: t.profesional, nombreServicio: t.servicio, precioServicio: t.precioTotal, fecha: fechaIso, hora, nombreCliente: t.nombreCliente ?? '', telefonoCliente: t.telefono ?? '', estado, ...datosDelDia(fechaIso) };
      }));
    } catch (error) { if (error?.status === 401) expulsarPorSesion(); }
  }, [token, expulsarPorSesion, normalizarHoraApi]);
  useEffect(() => { if (sesionIniciada && currentUser?.role === 'admin') cargarTurnosAdmin(); }, [sesionIniciada, cargarTurnosAdmin, currentUser?.role]);

  const turnosOcupados = useMemo(() => {
    const snap = {};
    const meter = (idProfesional, dayKey, time) => {
      if (idProfesional == null || dayKey == null || !time) return;
      const bs = snap[idProfesional] ?? (snap[idProfesional] = {});
      bs[dayKey] = [...(bs[dayKey] ?? []), time];
    };
    rangoReservado.forEach((t) => {
      const hora = normalizarHoraApi(t.horaInicio);
      if (!hora) return;
      meter(t.idProfesional, fechaAIso(t.fecha), hora);
    });
    turnosConfirmados.forEach((b) => meter(b.idProfesional, fechaAIso(b.fecha), b.hora));
    return snap;
  }, [rangoReservado, turnosConfirmados, normalizarHoraApi]);

  const profesionalActual = profesionales.find((b) => b.id === profesionalSeleccionado) ?? profesionales[0] ?? null;
  const servicioActual = servicios.find((s) => s.id === servicioSeleccionado) ?? servicios[0] ?? null;
  const diaSeleccionado = new Date(`${fechaSeleccionada}T00:00:00`);
  const patronDiaSeleccionado = patronDelDia(diaSeleccionado);
  const fechaFormateada = formatoFecha(diaSeleccionado);
  const diaActual = { id: patronDiaSeleccionado ?? 'dom', label: fechaFormateada.label, date: fechaFormateada.date };

  const horariosDelDia = patronDiaSeleccionado ? horariosDeLaSemana(horarioLaboral, profesionalSeleccionado, patronDiaSeleccionado, horariosFijos) : [];

  const horariosBloqueadosLocales = patronDiaSeleccionado ? [...(turnosOcupados[profesionalSeleccionado]?.[fechaSeleccionada] ?? []), ...bloqueosDeLaFecha(bloqueosPorFecha, profesionalSeleccionado, fechaSeleccionada, horariosDelDia)] : horariosDelDia;

  const horariosPasadosHoy = horariosPasados(fechaSeleccionada, horariosDelDia);
  const horariosNoDisponibles = [...new Set([...horariosBloqueadosLocales, ...horariosOcupadosApi, ...horariosPasadosHoy])];

  const horariosLibres = horariosDelDia.filter((s) => !horariosNoDisponibles.includes(s));

  useEffect(() => { if (horariosLibres.length === 0) { setHoraSeleccionada(''); return; } if (!horariosLibres.includes(horaSeleccionada)) setHoraSeleccionada(horariosLibres[0]); }, [horariosLibres, horaSeleccionada]);
  const horaEstaOcupada = horaSeleccionada ? horariosNoDisponibles.includes(horaSeleccionada) : true;

  const esDomingoOLunes = esDiaCerrado(diaSeleccionado.getDay());
  const fueraDeRango = diaSeleccionado < calendarStart || diaSeleccionado > calendarEnd;

  const cambiarFechaCalendario = (nextDate) => {
    const nextDateObject = new Date(`${nextDate}T00:00:00`);
    if (Number.isNaN(nextDateObject.getTime())) return;
    if (nextDateObject < calendarStart || nextDateObject > calendarEnd) { setAviso({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (esDiaCerrado(nextDateObject.getDay())) { setAviso({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    setFechaSeleccionada(nextDate);
  };

  const cerrarSesion = () => {
    setToken(''); setCurrentUser(null); setTurnosConfirmados([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setVista('cliente'); setPantallaAcceso('ingreso'); setCorreoIngreso(''); setClaveIngreso('');
    setFormularioRegistro({ nombre: '', apellido: '', email: '', telefono: '', password: '' });
    setAvisoAcceso({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });
  };

  const iniciarSesion = async (event) => {
    event.preventDefault();
    const cred = correoIngreso.trim(), pass = claveIngreso.trim();
    if (!cred || !pass) { setAvisoAcceso({ type: 'error', message: 'Completá usuario/mail y contraseña para iniciar sesión.' }); return; }
    try {
      setAvisoAcceso({ type: 'idle', message: 'Iniciando sesión...' });
      const r = await loginCliente(cred, pass);
      if (r?.role === 'admin') {
        const admin = { idCliente: null, idAdmin: r.admin?.idAdmin ?? null, name: r.admin?.nombre ?? 'Administrador', email: r.admin?.email ?? cred, role: 'admin' };
        setToken(r.token); setCurrentUser(admin);
        try { localStorage.setItem('token', r.token); localStorage.setItem('currentUser', JSON.stringify(admin)); } catch {}
        setVista('admin'); setAvisoAcceso({ type: 'success', message: 'Acceso de administrador habilitado.' });
      } else {
        const u = { idCliente: r.cliente?.idCliente ?? null, name: r.cliente?.nombre ?? cred.split('@')[0], email: cred, role: 'cliente', phone: r.cliente?.telefono ?? '' };
        setToken(r.token); setCurrentUser(u);
        try { localStorage.setItem('token', r.token); localStorage.setItem('currentUser', JSON.stringify(u)); } catch {}
        setVista('cliente'); setAvisoAcceso({ type: 'success', message: `Sesión iniciada con ${cred}.` });
      }
    } catch (error) { setAvisoAcceso({ type: 'error', message: error.message || 'Credenciales incorrectas.' }); }
  };

  const ingresarConGoogle = () => {
    setPantallaAcceso('ingreso');
    setAvisoAcceso({
      type: 'error',
      message: 'El acceso con Google todavía no está habilitado. Iniciá sesión con tu mail y contraseña, o registrate.',
    });
  };

  const crearCuenta = async (event) => {
    event.preventDefault(); const { nombre, apellido, email, telefono, password } = formularioRegistro;
    if (!nombre.trim() || !apellido.trim() || !email.trim() || !password.trim() || !telefono.trim()) { setAvisoAcceso({ type: 'error', message: 'Completá nombre, apellido, mail, contraseña y whatsapp para registrarte.' }); return; }

    if (password.length < 8) { setAvisoAcceso({ type: 'error', message: 'La contraseña tiene que tener al menos 8 caracteres.' }); return; }
    try {
      setAvisoAcceso({ type: 'idle', message: 'Creando tu cuenta...' });
      await registrarCliente({ nombre: nombre.trim(), apellido: apellido.trim(), email: email.trim(), telefono: telefono.trim(), password });
      setPantallaAcceso('ingreso'); setCorreoIngreso(email.trim()); setClaveIngreso('');
      setAvisoAcceso({ type: 'success', message: `¡Cuenta creada! Ya podés iniciar sesión con ${email.trim()}.` });
    } catch (error) { setAvisoAcceso({ type: 'error', message: error.message || 'Error al registrar el cliente.' }); }
  };

  const registrarTurno = async (event) => {
    event.preventDefault();
    if (!nombreCliente.trim() || !telefonoCliente.trim()) { setAviso({ type: 'error', message: 'Completá tu nombre y teléfono para confirmar el turno.' }); return; }
    if (!currentUser?.idCliente) { setAviso({ type: 'error', message: 'Tu cuenta no está vinculada a un cliente de la base. Iniciá sesión con tu cuenta registrada.' }); return; }
    if (esDomingoOLunes) { setAviso({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    if (fueraDeRango) { setAviso({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (!horaSeleccionada || horaEstaOcupada) { setAviso({ type: 'error', message: 'Elegí un horario disponible antes de confirmar.' }); return; }
    if (enviando) return;
    try {
      setSubmitting(true);
      setAviso({ type: 'idle', message: 'Confirmando tu turno...' });
      await reservarTurno({ idCliente: currentUser.idCliente, idProfesional: profesionalSeleccionado, idServicio: servicioSeleccionado, fecha: fechaSeleccionada, horaInicio: horaSeleccionada, telefono: telefonoCliente.trim() }, token);
      setAviso({ type: 'success', message: `Turno confirmado para ${nombreCliente.trim()} con ${profesionalActual.name} (${servicioActual.name}, $${servicioActual.price.toLocaleString('es-AR')}) el ${fechaFormateada.label} ${fechaFormateada.date} a las ${horaSeleccionada}.` });
      setNombreCliente(currentUser?.name ?? ''); setTelefonoCliente(currentUser?.phone ?? ''); setHoraSeleccionada('');

      cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos();
    } catch (error) { setAviso({ type: 'error', message: error.message || 'Error al reservar el turno.' }); }
    finally { setSubmitting(false); }
  };

  const cantidadOcupados = horariosDelDia.length - horariosLibres.length;
  const emailUsuario = currentUser?.email ?? '';

  const turnosDelUsuario = useMemo(
    () => turnosConfirmados.filter((b) => b.emailCliente === emailUsuario).slice().sort((l, r) => `${l.fecha}T${l.hora}`.localeCompare(`${r.fecha}T${r.hora}`)),
    [turnosConfirmados, emailUsuario]
  );

  const turnosPendientes = turnosDelUsuario.filter((b) => b.estado === 'Confirmado');
  const turnosExpirados = turnosDelUsuario.filter((b) => b.estado === 'Expirado'); const proximosTurnos = turnosPendientes.slice(0, 3);

  const anularTurno = async (bookingId) => {
    if (!window.confirm('¿Seguro que querés cancelar este turno?')) return;
    try { await cancelarTurno(bookingId, token); setAviso({ type: 'success', message: 'Turno cancelado correctamente.' }); cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos(); }
    catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al cancelar el turno.' }); }
  };

  const reprogramarTurno = async (bookingId, fecha, hora) => {
    if (!window.confirm('¿Confirmás el nuevo día y horario?')) return;
    try {
      setAviso({ type: 'idle', message: 'Reprogramando tu turno...' });
      await actualizarTurno(bookingId, { fecha, horaInicio: hora }, token);
      setTurnosConfirmados((p) => p.map((b) => (b.id === bookingId ? { ...b, fecha, hora, ...datosDelDia(fecha) } : b)));
      cargarDisponibilidad(); refrescarOcupados();
      await cargarMisTurnos();
      setAviso({ type: 'success', message: 'Turno reprogramado correctamente.' });
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setAviso({ type: 'error', message: error.message || 'Error al reprogramar el turno.' });
    }
  };

  const dividirNombre = (nombreCompleto) => {
    const partes = String(nombreCompleto).trim().split(/\s+/);
    return { nombre: partes[0] ?? '', apellido: partes.slice(1).join(' ') };
  };

  const registrarProfesional = async (nombreCompleto, email, telefono) => {
    const { nombre, apellido } = dividirNombre(nombreCompleto);
    try {
      await crearProfesional({ nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al agregar el profesional.' }; }
  };

  const editarProfesional = async (id, nombreCompleto, email, telefono) => {
    const { nombre, apellido } = dividirNombre(nombreCompleto);
    try {
      await actualizarProfesional(id, { nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al actualizar el profesional.' }; }
  };

  const borrarProfesional = async (id) => {
    if (!window.confirm('¿Eliminar a este profesional? Sus turnos se mantienen, pero ya no recibirá reservas nuevas.')) return { ok: false };
    try {
      await eliminarProfesional(id, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al eliminar el profesional.' }; }
  };

  const cambiarActivoProfesional = async (id, activo) => {
    try {
      await actualizarProfesional(id, { activo: !activo }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al cambiar el estado del profesional.' }); return false; }
  };

  const registrarServicio = async (name, price, durationMinutes) => {
    try {
      await crearServicio({ nombre: name, precio: price, duracion_minutos: durationMinutes }, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al agregar el servicio.' }); return false; }
  };
  const editarServicio = async (id, name, price, durationMinutes) => {
    try {
      await actualizarServicio(id, { nombre: name, precio: price, duracion_minutos: durationMinutes }, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al actualizar el servicio.' }); return false; }
  };

  const borrarServicio = async (id) => {
    if (!window.confirm('¿Eliminar este servicio del catálogo?')) return false;
    try {
      await eliminarServicio(id, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al eliminar el servicio.' }); return false; }
  };

  const guardarBloqueosFecha = useCallback(async (idProfesional, fecha, body) => {
    try {
      await guardarBloqueos(idProfesional, { fecha, ...body }, token);
      const b = await obtenerBloqueos(token);
      if (Array.isArray(b)) setBloqueosPorFecha(b);
      return true;
    } catch (error) {
      if (error?.status === 401) expulsarPorSesion();
      return false;
    }
  }, [token, expulsarPorSesion]);

  const guardarHorariosSemanales = useCallback(async (idProfesional, horarios) => {
    try {
      await guardarHorarios(idProfesional, horarios, token);
      const h = await obtenerHorarios(token);
      if (Array.isArray(h)) setHorarioLaboral(h);
      return true;
    } catch (error) {
      if (error?.status === 401) expulsarPorSesion();
      return false;
    }
  }, [token, expulsarPorSesion]);

  const editarTurno = async (bookingId, updates) => {
    try {
      setAviso({ type: 'idle', message: 'Guardando el turno...' });
      await actualizarTurno(bookingId, {
        idProfesional: updates.idProfesional ? Number(updates.idProfesional) : undefined,
        idServicio: updates.idServicio ? Number(updates.idServicio) : undefined,
        fecha: updates.fecha || undefined,
        horaInicio: updates.hora || undefined,

        estado: ['Confirmado', 'Completado', 'NoSePresento', 'Cancelado'].includes(updates.estado) ? updates.estado : undefined,
        nombreCliente: updates.nombreCliente !== undefined ? updates.nombreCliente : undefined,
        telefono: updates.telefonoCliente,
      }, token);
      setTurnosConfirmados((p) => p.map((b) => { if (b.id !== bookingId) return b; const nb = profesionales.find((x) => x.id === Number(updates.idProfesional)) ?? profesionales[0]; const ns = servicios.find((x) => x.id === Number(updates.idServicio)) ?? servicios[0]; return { ...b, ...updates, idProfesional: updates.idProfesional != null ? Number(updates.idProfesional) : b.idProfesional, nombreProfesional: nb?.name ?? b.nombreProfesional, nombreServicio: ns?.name ?? b.nombreServicio, precioServicio: ns?.price ?? b.precioServicio, ...datosDelDia(updates.fecha) }; }));
      await cargarTurnosAdmin(); refrescarOcupados();
      setAviso({ type: 'success', message: 'Turno actualizado en la base de datos.' });
      return true;
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setAviso({ type: 'error', message: error.message || 'Error al actualizar el turno.' });
      return false;
    }
  };

  const borrarTurno = async (bookingId) => {
    if (!window.confirm('¿Eliminar este turno definitivamente?')) return;
    try {
      await eliminarTurno(bookingId, token);
      setTurnosConfirmados((p) => p.filter((b) => b.id !== bookingId));
      cargarDisponibilidad(); refrescarOcupados();
      await cargarTurnosAdmin();
      setAviso({ type: 'success', message: 'Turno eliminado definitivamente.' });
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setAviso({ type: 'error', message: error.message || 'Error al eliminar el turno.' });
    }
  };

  const verMisTurnos = () => { setVista('mis-turnos'); try { history.pushState({ view: 'mis-turnos' }, '', '#mis-turnos'); } catch {} };
  const volverAlCliente = () => { setVista('cliente'); try { history.pushState({ view: 'cliente' }, '', window.location.pathname); } catch {} };

  useEffect(() => {
    const onPop = () => {
      const isMyBookings = window.location.hash === '#mis-turnos';
      setVista(isMyBookings ? 'mis-turnos' : 'cliente');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (!sesionIniciada) return (
    <>
      <IniciarSesion pantallaAcceso={pantallaAcceso} avisoAcceso={avisoAcceso} ingresarConGoogle={ingresarConGoogle} iniciarSesion={iniciarSesion} crearCuenta={crearCuenta} correoIngreso={correoIngreso} claveIngreso={claveIngreso} onMostrarIngreso={() => setPantallaAcceso('ingreso')} onMostrarRegistro={() => setPantallaAcceso('registro')} formularioRegistro={formularioRegistro} setCorreoIngreso={setCorreoIngreso} setClaveIngreso={setClaveIngreso} setFormularioRegistro={setFormularioRegistro} />
      <WhatsApp />
    </>
  );

  if (currentUser?.role !== 'admin' && (profesionales.length === 0 || servicios.length === 0)) return (
    <main className="simple-page" style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: '1.5rem', minHeight: '100svh', textAlign: 'center' }}>
      <div style={{ display: 'grid', gap: '0.65rem', maxWidth: '34rem' }}>
        <p role="alert" style={{ color: errorCarga ? 'var(--err)' : 'var(--text-mid)', margin: 0 }}>
          {errorCarga || 'Cargando datos...'}
        </p>
        {errorCarga && (
          <p style={{ color: 'var(--text-low)', fontSize: '0.92rem', margin: 0 }}>
            No pudimos cargar la agenda. Podés reintentar o cerrar sesión e entrar de nuevo.
          </p>
        )}
      </div>
      {errorCarga && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => { setErrorCarga(''); setIntentoRecarga((n) => n + 1); }}
            style={{ minHeight: '48px', padding: '0 1.6rem', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--gold-gradient)', color: '#241a08', fontWeight: 700, cursor: 'pointer' }}
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={cerrarSesion}
            style={{ minHeight: '48px', padding: '0 1.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--card-soft)', color: 'var(--text-hi)', border: '1px solid var(--line)', fontWeight: 600, cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </main>
  );
  return (
    <>
      {currentUser?.role === 'admin' ? (
        <Admin todosProfesionales={todosProfesionales} profesionales={profesionales} turnos={turnosConfirmados} currentUser={currentUser} bloqueosPorFecha={bloqueosPorFecha} errorCarga={errorCarga} horarioLaboral={horarioLaboral} onRegistrarProfesional={registrarProfesional} onRegistrarServicio={registrarServicio} onBorrarProfesional={borrarProfesional} onBorrarTurno={borrarTurno} onBorrarServicio={borrarServicio} onCerrarSesion={cerrarSesion} onGuardarBloqueos={guardarBloqueosFecha} onGuardarHorarios={guardarHorariosSemanales} onCambiarActivoProfesional={cambiarActivoProfesional} onEditarProfesional={editarProfesional} onEditarTurno={editarTurno} onEditarServicio={editarServicio} servicios={servicios} horariosFijos={horariosFijos} />
      ) : vista === 'mis-turnos' ? (
        <MisTurnos calendarMax={fechaAIso(calendarEnd)} calendarMin={initialCalendarDate} sePuedeCancelar={sePuedeCancelar} currentUser={currentUser} bloqueosPorFecha={bloqueosPorFecha} turnosExpirados={turnosExpirados} horarioLaboral={horarioLaboral} onVolver={volverAlCliente} onCancelarTurno={anularTurno} onReprogramarTurno={reprogramarTurno} turnosPendientes={turnosPendientes} turnosOcupados={turnosOcupados} horariosFijos={horariosFijos} />
      ) : (
        <Inicio horariosLibres={horariosLibres} profesionales={profesionales} profesionalActual={profesionalActual} servicioActual={servicioActual} diaActual={diaActual} nombreCliente={nombreCliente} telefonoCliente={telefonoCliente} bloqueosPorFecha={bloqueosPorFecha} horariosDelDia={horariosDelDia} horarioLaboral={horarioLaboral} aviso={aviso} registrarTurno={registrarTurno} cargandoDisponibilidad={cargandoDisponibilidad} proximosTurnos={proximosTurnos} cantidadOcupados={cantidadOcupados} onCerrarSesion={cerrarSesion} onVerMisTurnos={verMisTurnos} currentUser={currentUser} profesionalSeleccionado={profesionalSeleccionado} servicioSeleccionado={servicioSeleccionado} fechaSeleccionada={fechaSeleccionada} horaSeleccionada={horaSeleccionada} horaEstaOcupada={horaEstaOcupada} setNombreCliente={setNombreCliente} setTelefonoCliente={setTelefonoCliente} setProfesionalSeleccionado={setProfesionalSeleccionado} setServicioSeleccionado={setServicioSeleccionado} setFechaSeleccionada={cambiarFechaCalendario} setHoraSeleccionada={setHoraSeleccionada} servicios={servicios} enviando={enviando} horariosFijos={horariosFijos} horariosNoDisponibles={horariosNoDisponibles} turnosOcupados={turnosOcupados} diaCalendarMin={initialCalendarDate} diaCalendarMax={fechaAIso(calendarEnd)} />
      )}
      <WhatsApp />
    </>
  );
}
export default App;
