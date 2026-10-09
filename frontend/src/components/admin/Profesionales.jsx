function Profesionales({ todosProfesionales, profesionales, formularioProfesional, onCambioFormularioProfesional, onGuardarProfesional, onBorrarProfesional, onEmpezarEdicionProfesional, onCancelarEdicionProfesional, onCambiarActivoProfesional }) {

  const fuente = Array.isArray(todosProfesionales) && todosProfesionales.length > 0 ? todosProfesionales : profesionales;
  const activos = fuente.filter((b) => b.activo !== false);
  const desactivados = fuente.filter((b) => b.activo === false);
  return (
    <article className="simple-card admin-panel">
      <h2>Profesionales</h2>
      <p className="admin-note">Agregá, editá o eliminá a los profesionales que atienden la barbería. Si eliminás uno, deja de recibir reservas nuevas.</p>
      <form className="admin-form" onSubmit={onGuardarProfesional}>
        <input type="text" placeholder="Nombre del profesional" value={formularioProfesional.name} onChange={(e) => onCambioFormularioProfesional((p) => ({ ...p, name: e.target.value }))} />
        <input type="email" placeholder="Email" value={formularioProfesional.email} onChange={(e) => onCambioFormularioProfesional((p) => ({ ...p, email: e.target.value }))} />
        <input type="tel" placeholder="Teléfono" value={formularioProfesional.telefono} onChange={(e) => onCambioFormularioProfesional((p) => ({ ...p, telefono: e.target.value }))} />
        <div className="admin-actions-row">
          <button className="simple-submit" type="submit">{formularioProfesional.id ? 'Guardar cambios' : 'Agregar profesional'}</button>
          {formularioProfesional.id ? <button className="auth-submit secondary" type="button" onClick={onCancelarEdicionProfesional}>Cancelar</button> : null}
        </div>
      </form>
      <div className="admin-list">
        {activos.map((b) => (
          <div key={b.id} className="admin-row">
            <div>
              <strong>{b.name}</strong>
              <span>ID: {b.id}</span>
              {b.email ? <span> · {b.email}</span> : null}
              {b.telefono ? <span> · {b.telefono}</span> : null}
            </div>
            <div className="admin-row-actions">
              <button type="button" className="auth-submit tertiary" onClick={() => onEmpezarEdicionProfesional(b)}>Editar</button>
              <button type="button" className="booking-cancel" onClick={() => onBorrarProfesional(b.id)}>Eliminar</button>
            </div>
          </div>
        ))}
        {activos.length === 0 ? <p className="admin-empty">No hay profesionales activos. Agregá uno arriba.</p> : null}
      </div>
      {desactivados.length > 0 ? (
        <details className="admin-inactive-block">
          <summary>Profesionales desactivados ({desactivados.length})</summary>
          <div className="admin-list">
            {desactivados.map((b) => (
              <div key={b.id} className="admin-row admin-row-inactivo">
                <div>
                  <strong>{b.name}</strong>
                  <span>ID: {b.id} · Inactivo</span>
                  {b.email ? <span> · {b.email}</span> : null}
                  {b.telefono ? <span> · {b.telefono}</span> : null}
                </div>
                <div className="admin-row-actions">
                  <button type="button" className="auth-submit tertiary" onClick={() => onCambiarActivoProfesional(b.id, false)}>Reactivar</button>
                  <button type="button" className="auth-submit tertiary" onClick={() => onEmpezarEdicionProfesional(b)}>Editar</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
export default Profesionales;
