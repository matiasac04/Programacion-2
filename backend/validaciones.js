const esFechaIsoValida = (valor) => {
    if (typeof valor !== "string") return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
    if (!m) return false;
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;

    const d = new Date(Date.UTC(anio, mes - 1, dia));
    return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

const errorFecha = (valor) =>
    esFechaIsoValida(valor) ? null : "La fecha no tiene un formato válido (se espera AAAA-MM-DD).";

const esHoraValida = (valor) => {
    if (typeof valor !== "string") return false;
    const m = /^(\d{2}):(\d{2})$/.exec(valor.trim());
    if (!m) return false;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h >= 0 && h <= 23 && min >= 0 && min <= 59;
};

const errorHora = (valor) =>
    esHoraValida(valor) ? null : "La hora no tiene un formato válido (se espera HH:MM).";

const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

const errorPassword = (valor) => {
    if (typeof valor !== "string" || !valor) return "Falta la contraseña.";
    if (valor.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    if (Buffer.byteLength(valor, "utf8") > PASSWORD_MAX_BYTES) return "La contraseña es demasiado larga.";
    return null;
};

const esIdValido = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0;
};

const errorId = (valor) => (esIdValido(valor) ? null : "El identificador no es válido.");

module.exports = {
    errorFecha,
    errorHora,
    errorPassword,
    errorId,
};
