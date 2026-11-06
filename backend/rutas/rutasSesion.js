const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, JWT_SECRET } = require("../autenticacion");
const { errorPassword, errorTelefono } = require("../validaciones");
const { enviarMail, htmlRecuperacionPassword } = require("../mailer");

const verificarPassword = async (passwordPlano, hash) => {
  if (!hash) return { ok: false, hash };
  if (String(hash).startsWith("$2")) return { ok: await bcrypt.compare(passwordPlano, hash), hash };
  const ok = passwordPlano === hash;
  return { ok, hash: ok ? await bcrypt.hash(passwordPlano, 10) : hash };
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

router.post("/registro", async (req, res) => {
  const { nombre, apellido, email, telefono, password } = req.body;
  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ error: "Nombre, apellido, mail y contraseña son obligatorios." });
  }
  try {
    const db = await getPool();
    const emailFinal = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(emailFinal)) {
      return res.status(400).json({ error: "El mail ingresado no es válido." });
    }

    const errPass = errorPassword(password);
    if (errPass) return res.status(400).json({ error: errPass });

    if (String(nombre).length > 100 || String(apellido).length > 100) {
      return res.status(400).json({ error: "Nombre y apellido no pueden superar los 100 caracteres." });
    }
    const errTelefono = errorTelefono(telefono);
    if (errTelefono) return res.status(400).json({ error: errTelefono });
    const telefonoFinal = telefono == null ? null : String(telefono).trim() || null;

    const existe = await db.request()
      .input("email", sql.VarChar, emailFinal)
      .query("SELECT idCliente FROM Cliente WHERE email = @email");
    if (existe.recordset.length > 0) {
      return res.status(409).json({ error: "Ya existe una cuenta con ese mail." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await db.request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("email", sql.VarChar, emailFinal)
      .input("telefono", sql.VarChar, telefonoFinal)
      .input("password", sql.VarChar, passwordHash)
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

router.post("/login", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Se requiere autenticación básica (Basic Auth)." });
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const colonIndex = credentials.indexOf(":");
  const userOrEmail = colonIndex === -1 ? credentials : credentials.slice(0, colonIndex);
  const password = colonIndex === -1 ? "" : credentials.slice(colonIndex + 1);

  try {
    const db = await getPool();

    const adminRes = await db.request()
      .input("usuario", sql.VarChar, userOrEmail)
      .query("SELECT idAdmin, usuario, nombre, apellido, email, password FROM Administrador WHERE usuario = @usuario");

    const admin = adminRes.recordset[0];
    if (admin) {
      const verif = await verificarPassword(password, admin.password);
      if (verif.ok) {
        if (verif.hash !== admin.password) {
          await db.request()
            .input("idAdmin", sql.Int, admin.idAdmin)
            .input("hash", sql.VarChar, verif.hash)
            .query("UPDATE Administrador SET password = @hash WHERE idAdmin = @idAdmin");
        }
        const token = jwt.sign(
          { idAdmin: admin.idAdmin, usuario: admin.usuario, nombre: admin.nombre, role: "admin" },
          JWT_SECRET,
          { expiresIn: "1h" }
        );
        return res.json({
          mensaje: "Login de administrador exitoso.",
          role: "admin",
          token,
          admin: { idAdmin: admin.idAdmin, usuario: admin.usuario, nombre: admin.nombre, apellido: admin.apellido, email: admin.email }
        });
      }
    }

    const result = await db.request()
      .input("email", sql.VarChar, String(userOrEmail).trim().toLowerCase())
      .query("SELECT idCliente, nombre, apellido, telefono, password FROM Cliente WHERE email = @email");

    const clienteLogueado = result.recordset[0];
    if (!clienteLogueado) {
      return res.status(401).json({ error: "Usuario/mail o contraseña incorrectos." });
    }
    const verif = await verificarPassword(password, clienteLogueado.password);
    if (!verif.ok) {
      return res.status(401).json({ error: "Usuario/mail o contraseña incorrectos." });
    }
    if (verif.hash !== clienteLogueado.password) {
      await db.request()
        .input("idCliente", sql.Int, clienteLogueado.idCliente)
        .input("hash", sql.VarChar, verif.hash)
        .query("UPDATE Cliente SET password = @hash WHERE idCliente = @idCliente");
    }

    const token = jwt.sign(
      { idCliente: clienteLogueado.idCliente, nombre: clienteLogueado.nombre, role: "client" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const { idCliente, nombre, apellido, telefono } = clienteLogueado;
    res.json({
      mensaje: "Login exitoso.",
      role: "client",
      token: token,
      cliente: { idCliente, nombre, apellido, telefono, email: String(userOrEmail).trim().toLowerCase() }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al iniciar sesión." });
  }
});

router.get("/verificar", jwtMiddleware, async (req, res) => {
  res.json({ valido: true, role: req.user.role ?? 'client', idCliente: req.user.idCliente ?? null, idAdmin: req.user.idAdmin ?? null });
});

router.post("/recuperar", async (req, res) => {
  const mensaje = "Si el mail está registrado, te enviamos un link para restablecer tu contraseña.";
  try {
    const emailFinal = String(req.body?.email ?? "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(emailFinal)) {
      return res.status(400).json({ error: "El mail ingresado no es válido." });
    }
    const db = await getPool();
    const result = await db.request()
      .input("email", sql.VarChar, emailFinal)
      .query("SELECT idCliente, nombre FROM Cliente WHERE email = @email");
    const cliente = result.recordset[0];
    if (!cliente) return res.json({ mensaje });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    await db.request()
      .input("idCliente", sql.Int, cliente.idCliente)
      .input("token", sql.VarChar, tokenHash)
      .query(`
        UPDATE Cliente
        SET tokenRecuperacion = @token, tokenExpira = DATEADD(minute, 60, GETDATE())
        WHERE idCliente = @idCliente
      `);

    const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
    const enlace = `${base}/?reset=${token}`;

    try {
      await enviarMail({
        para: emailFinal,
        asunto: "Recuperá tu contraseña — Barberia",
        html: htmlRecuperacionPassword({ nombre: cliente.nombre, enlace }),
      });
    } catch (error) {
      console.error("No se pudo enviar el mail de recuperación:", error.message);
    }

    return res.json({ mensaje });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al solicitar la recuperación de contraseña." });
  }
});

router.post("/restablecer", async (req, res) => {
  try {
    const token = String(req.body?.token ?? "").trim();
    const password = req.body?.password;
    if (token.length !== 64) {
      return res.status(400).json({ error: "El link no es válido o venció. Pedí uno nuevo." });
    }
    if (!password) {
      return res.status(400).json({ error: "La nueva contraseña es obligatoria." });
    }
    const errPass = errorPassword(password);
    if (errPass) return res.status(400).json({ error: errPass });

    const db = await getPool();
    const tokenHash = hashToken(token);
    const result = await db.request()
      .input("token", sql.VarChar, tokenHash)
      .query("SELECT idCliente FROM Cliente WHERE tokenRecuperacion = @token AND tokenExpira > GETDATE()");
    const cliente = result.recordset[0];
    if (!cliente) {
      return res.status(400).json({ error: "El link no es válido o venció. Pedí uno nuevo." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    await db.request()
      .input("idCliente", sql.Int, cliente.idCliente)
      .input("password", sql.VarChar, passwordHash)
      .query(`
        UPDATE Cliente
        SET password = @password, tokenRecuperacion = NULL, tokenExpira = NULL
        WHERE idCliente = @idCliente
      `);

    res.json({ mensaje: "Contraseña actualizada. Ya podés iniciar sesión." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al restablecer la contraseña." });
  }
});

module.exports = router;
