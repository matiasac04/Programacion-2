function Servicios({ onCancelarEdicionServicio, onBorrarServicio, onCambioFormularioServicio, onGuardarServicio, onEmpezarEdicionServicio, formularioServicio, servicios }) {
  return (
    <article className="simple-card admin-panel">
      <h2>Servicios</h2>
      <p className="admin-note">Mantené el catálogo actualizado; los precios se muestran en pesos (ARS).</p>
      <form className="admin-form admin-service-form" onSubmit={onGuardarServicio}>
        <input type="text" placeholder="Nombre del servicio" value={formularioServicio.name} onChange={(e) => onCambioFormularioServicio((p) => ({ ...p, name: e.target.value }))} />
        <div className="admin-inline-grid">
          <input type="number" min="1" placeholder="Precio ($)" value={formularioServicio.price} onChange={(e) => onCambioFormularioServicio((p) => ({ ...p, price: e.target.value }))} />
          <input type="number" min="1" placeholder="Duración (min)" value={formularioServicio.duracion} onChange={(e) => onCambioFormularioServicio((p) => ({ ...p, duracion: e.target.value }))} />
        </div>
        <div className="admin-actions-row">
          <button className="simple-submit" type="submit">{formularioServicio.id ? 'Guardar cambios' : 'Agregar servicio'}</button>
          {formularioServicio.id ? <button className="auth-submit secondary" type="button" onClick={onCancelarEdicionServicio}>Cancelar</button> : null}
        </div>
      </form>
      <div className="admin-list">
        {servicios.map((s) => (
          <div key={s.id} className="admin-row">
            <div><strong>{s.name}</strong><span>${Number(s.price || 0).toLocaleString('es-AR')} · {s.durationMinutes ?? 0} min</span></div>
            <div className="admin-row-actions">
              <button type="button" className="auth-submit tertiary" onClick={() => onEmpezarEdicionServicio(s)}>Editar</button>
              <button type="button" className="booking-cancel" onClick={() => onBorrarServicio(s)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
export default Servicios;
