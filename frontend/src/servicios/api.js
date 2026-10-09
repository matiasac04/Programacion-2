const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const peticion = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const h = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers };
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch {

    const err = new Error("No pudimos conectar con el servidor. Revisá que esté levantado y que tu conexión a internet esté bien.");
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Error en la solicitud al servidor.");
    err.status = res.status;

    if (res.status === 429) {
      const esperar = Number(res.headers.get("Retry-After"));
      err.message = data.error || "Demasiados intentos. Esperá un momento y volvé a intentar.";
      if (Number.isFinite(esperar) && esperar > 0) {
        const min = Math.ceil(esperar / 60);
        err.message += ` Podés volver a intentar en unos ${min} minuto${min === 1 ? "" : "s"}.`;
      }
    }
    throw err;
  }
  return data;
};

export const registrarCliente = (datos) => peticion("/registro", { method: "POST", body: datos });

export const loginCliente = (email, password) => peticion("/login", { method: "POST", headers: { Authorization: `Basic ${btoa(`${email}:${password}`)}` } });

export const verificarToken = (token) => peticion("/verificar", { token });

export const obtenerProfesionales = (token, incluirInactivos = false) => peticion(`/profesionales${incluirInactivos ? "?incluirInactivos=1" : ""}`, { token });

export const crearProfesional = (datos, token) => peticion("/profesionales", { method: "POST", token, body: datos });
export const actualizarProfesional = (id, datos, token) => peticion(`/profesionales/${id}`, { method: "PATCH", token, body: datos });
export const eliminarProfesional = (id, token) => peticion(`/profesionales/${id}`, { method: "DELETE", token });

export const obtenerServicios = () => peticion("/servicios");
export const crearServicio = (datos, token) => peticion("/servicios", { method: "POST", token, body: datos });
export const actualizarServicio = (id, datos, token) => peticion(`/servicios/${id}`, { method: "PATCH", token, body: datos });
export const eliminarServicio = (id, token) => peticion(`/servicios/${id}`, { method: "DELETE", token });

export const obtenerTurnosCliente = (idCliente, token) => peticion(`/clientes/${idCliente}/turnos`, { token });

export const obtenerTurnos = (token) => peticion("/turnos", { token });

export const obtenerTurnosDisponibles = (fecha, idProfesional, token) => peticion(`/turnos/disponibles?fecha=${encodeURIComponent(fecha)}&idProfesional=${encodeURIComponent(idProfesional)}`, { token });

export const obtenerTurnosOcupados = (inicio, fin, token) => peticion(`/turnos/ocupados?inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}`, { token });
export const reservarTurno = (datos, token) => peticion("/turnos", { method: "POST", token, body: datos });
export const cancelarTurno = (idTurno, token) => peticion(`/turnos/${idTurno}/cancelar`, { method: "PATCH", token });
export const actualizarTurno = (idTurno, datos, token) => peticion(`/turnos/${idTurno}`, { method: "PATCH", token, body: datos });
export const eliminarTurno = (idTurno, token) => peticion(`/turnos/${idTurno}`, { method: "DELETE", token });

export const obtenerBloqueos = (token) => peticion("/bloqueos", { token });

export const obtenerHorarios = (token) => peticion("/horarios", { token });

export const guardarBloqueos = (id, body, token) => peticion(`/profesionales/${id}/bloqueos`, { method: "POST", token, body });

export const guardarHorarios = (id, horarios, token) => peticion(`/profesionales/${id}/horarios`, { method: "PUT", token, body: { horarios } });
