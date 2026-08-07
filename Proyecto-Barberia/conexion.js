require('dotenv').config();

const sql = require('mssql');

const config = {
    user: process.env.usuario_bd,
    password: process.env.psw_bd,
    server: process.env.servido_bd,
    database: process.env.nombre_bd,        
    options: {
        encrypt: false,               
        trustServerCertificate: true  
    },
    port: 1433                        
};

let pool; 

async function getPool() {
    try {
        if (pool) {
            return pool;
        }
        
        pool = await sql.connect(config);
        console.log("¡Conectado exitosamente al SQL Server de mi Windows! 🚀");
        return pool;
    } catch (err) {
        console.error("Error al conectar a la base de datos: ", err);
        throw err;
    }
}

module.exports = { sql, config, getPool };