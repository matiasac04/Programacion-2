import { useState } from 'react';
import FiltrosTurnos from './FiltrosTurnos';
import { fechaAIso } from '../../utilidades/funciones';

function Turnos({ profesionales, formularioTurno, etiquetasEstado, clasesEstado, opcionesEstado, turnos, onCambioFormularioTurno, onGuardarTurno, onBorrarTurno, onEmpezarEdicionTurno, servicios, turnoSeleccionado }) {
  const [filtroProfesional, setFiltroProfesional] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroFecha, setFiltroFecha] = useState(() => fechaAIso(new Date()));
  const turnosFiltrados = turnos.filter((b) =>
    (filtroProfesional === 'todos' || String(b.idProfesional) === String(filtroProfesional)) &&
    (filtroEstado === 'todos' || b.estado === filtroEstado) &&
    (!filtroFecha || b.fecha === filtroFecha)
  );
  return (
    <article className="simple-card admin-panel">
      <h2>Editar turnos</h2>
      <p className="admin-note">Elegí un turno de la lista para cargarlo en el formulario y editarlo.</p>
      <FiltrosTurnos profesionales={profesionales} etiquetasEstado={etiquetasEstado} filtroProfesional={filtroProfesional} setFiltroProfesional={setFiltroProfesional} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado} filtroFecha={filtroFecha} setFiltroFecha={setFiltroFecha} />
      <div className="admin-divider"><span>Editar turno</span></div>
      {turnoSeleccionado ? (
        <form className="admin-form admin-booking-form" onSubmit={onGuardarTurno}>
          <div className="admin-inline-grid">
            <input type="text" placeholder="Nombre del cliente" value={formularioTurno.nombreCliente} onChange={(e) => onCambioFormularioTurno((p) => ({ ...p, nombreCliente: e.target.value }))} />
            <input type="tel" placeholder="Celular" value={formularioTurno.telefonoCliente} onChange={(e) => onCambioFormularioTurno((p) => ({ ...p, telefonoCliente: e.target.value }))} />
          </div>
          <div className="admin-inline-grid">
            <select value={formularioTurno.idProfesional} onChange={(e) => onCambioFormularioTurno((p) => ({ ...p, idProfesional: e.target.value }))}>
              {profesionales.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={formularioTurno.idServicio} onChange={(e) => onCambioFormularioTurno((p) => ({ ...p, idServicio: e.target.value }))}>
              {servicios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="admin-inline-grid">
            <input type="date" value={formularioTurno.fecha} onChange={(e) => onCambioFormularioTurno((p) => ({ ...p, fecha: e.target.value }))} />
            <input type="time" value={formularioTurno.hora} onChange={(e) => onCambioFormularioTurno((p) => ({ ...p, hora: e.target.value }))} />
          </div>
          <div className="admin-inline-grid">
            <select value={formularioTurno.estado} onChange={(e) => onCambioFormularioTurno((p) => ({ ...p, estado: e.target.value }))}>
              {opcionesEstado.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button className="simple-submit" type="submit">Guardar turno</button>
          </div>
        </form>
      ) : <p className="admin-note">No hay turnos para editar.</p>}
      <div className="admin-list">
        {turnosFiltrados.map((b) => (
          <div key={b.id} className="admin-row admin-booking-row">
            <div>
              <strong>{b.nombreCliente}</strong>
              <span>{b.nombreProfesional} · {b.nombreServicio} · {b.fecha} · {b.hora}</span>
              <span className={`booking-status ${clasesEstado[b.estado] ?? 'status-cancelled'}`}>{etiquetasEstado[b.estado] ?? b.estado}</span>
            </div>
            <div className="admin-row-actions">
              <button type="button" className="auth-submit tertiary" onClick={() => onEmpezarEdicionTurno(b)}>Editar</button>
              <button type="button" className="booking-cancel" onClick={() => onBorrarTurno(b.id)}>Eliminar</button>
            </div>
          </div>
        ))}
        {turnosFiltrados.length === 0 ? <p className="admin-empty">No hay turnos que coincidan con los filtros.</p> : null}
      </div>
    </article>
  );
}
export default Turnos;
