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





app.post("/profesionales", (req, res) => {

    const {
        nombre,
        apellido,
        email,
        telefono
    } = req.body;

    res.json(req.body);
});

app.patch("/profesionales/baja", (req, res) => {

    const { idProfesional } = req.body;

    res.json(req.body);
});

app.put("/horarios", (req, res) => {

    const {
        idProfesional,
        diaSemana,
        horaEntrada,
        horaSalida
    } = req.body;

    res.json(req.body);
});

app.post("/servicios", (req, res) => {

    const {
        nombre,
        precio,
        duracion_minutos
    } = req.body;

    res.json(req.body);
});

app.patch("/servicios/precio", (req, res) => {

    const {
        idServicio,
        precio
    } = req.body;

    res.json(req.body);
});

app.delete("/servicios", (req, res) => {

    const { idServicio } = req.body;

    res.json(req.body);
});

app.patch("/turnos/estado", (req, res) => {

    const {
        idTurno,
        estado
    } = req.body;

    res.json(req.body);
});

app.patch("/turnos/modificar", (req, res) => {

    const {
        idTurno,
        fecha,
        horaInicio,
        idProfesional
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
