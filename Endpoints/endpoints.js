const express = require("express");

const app = express();

app.use(express.json());



app.post("/registro", (req, res) => {

    const {
        nombre,
        apellido,
        email,
        telefono,
        password
    } = req.body;

    res.json(req.body);
});

app.post("/login", (req, res) => {

    const {
        email,
        password
    } = req.body;

    res.json(req.body);
});

app.get("/turnos/disponibles", (req, res) => {

    const { idProfesional, fecha } = req.query;

    res.json(req.query);
});

app.post("/turnos/reservar", (req, res) => {

    const {
        idProfesional,
        idCliente,
        idServicio,
        fecha,
        horaInicio
    } = req.body;

    res.json(req.body);
});

app.get("/mis-turnos", (req, res) => {

    const { idCliente } = req.query;

    res.json(req.query);
});

app.patch("/turnos/cancelar", (req, res) => {

    const { idTurno } = req.body;

    res.json(req.body);
});


//post-patch
app.get("/profesionales", (req, res) => {

    const {
        nombre,
        apellido,
        email,
        telefono
    } = req.query;

    res.json(req.query);
});

//post-put-patch-delete
app.get("/horarios", (req, res) => {

    const {
        idProfesional,
        diaSemana,
        horaEntrada,
        horaSalida
    } = req.query;

    res.json(req.query);
});

//post-patch-delete
app.get("/servicios", (req, res) => {

    const {
        nombre,
        precio,
        duracion_minutos
    } = req.query;

    res.json(req.query);
});

app.patch("/turnos/estado", (req, res) => {

    const {
        idTurno,
        estado
    } = req.body;

    res.json(req.body);
});

app.get("/agenda", (req, res) => {

    const {
        idProfesional,
        fecha
    } = req.query;

    res.json(req.query);
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});