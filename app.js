
/*
 * ============================================================
 * ¿QUÉ QUEDA? — API Node.js
 * ============================================================
 *
 * Funcionalidades:
 * 1. GET  /api/health/database  -> Comprueba conexión MySQL.
 * 2. GET  /api/prueba           -> Consulta registros de prueba.
 * 3. POST /api/prueba           -> Inserta un registro de prueba.
 * 4. POST /api/usuarios/registro -> Registra un usuario.
 *
 * Configuración requerida en cPanel:
 * DB_HOST, DB_NAME, DB_USER y DB_PASSWORD.
 *
 * Las contraseñas se almacenan mediante hash scrypt.
 * Nunca se guarda la contraseña original.
 * ============================================================
 */

const http = require('http');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { performance } = require('node:perf_hooks');
const {
    randomBytes,
    createHash,
    scrypt: scryptCallback,
    timingSafeEqual
} = require('node:crypto');

const { promisify } = require('node:util');
const scrypt = promisify(scryptCallback);

// ------------------------------------------------------------
// Funciones auxiliares
// ------------------------------------------------------------

// Abre una conexión con la base de datos configurada en cPanel.
async function conectarMySQL() {
    return mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectTimeout: 5000
    });
}

// Lee el cuerpo JSON de una solicitud HTTP.
// Limita el tamaño para evitar solicitudes excesivamente grandes.
async function leerJSON(req, res) {
    let cuerpo = '';

    for await (const fragmento of req) {
        cuerpo += fragmento.toString();

        if (Buffer.byteLength(cuerpo, 'utf8') > 10000) {
            res.writeHead(413);
            res.end(JSON.stringify({
                status: 'ERROR',
                message: 'Solicitud demasiado grande'
            }));
            return null;
        }
    }

    try {
        return JSON.parse(cuerpo);
    } catch {
        res.writeHead(400);
        res.end(JSON.stringify({
            status: 'ERROR',
            message: 'El cuerpo debe contener JSON válido'
        }));
        return null;
    }
}

// Genera un hash de contraseña usando scrypt y una sal aleatoria.
// Formato almacenado: scrypt:salt:hash
async function generarHash(contrasena) {
    const sal = randomBytes(16).toString('hex');

    const hash = await scrypt(
        contrasena,
        sal,
        64
    );

    return `scrypt:${sal}:${hash.toString('hex')}`;
}

// Comprueba una contraseña contra un hash almacenado.
// Esta función será útil al implementar el inicio de sesión.
async function verificarHash(contrasena, hashAlmacenado) {
    const partes = hashAlmacenado.split(':');

    if (partes.length !== 3 || partes[0] !== 'scrypt') {
        return false;
    }

    const [, sal, hashOriginal] = partes;

    if (!/^[a-f0-9]{32}$/i.test(sal)) {
        return false;
    }

    if (!/^[a-f0-9]{128}$/i.test(hashOriginal)) {
        return false;
    }

    const hashCalculado = await scrypt(
        contrasena,
        sal,
        64
    );

    const hashEsperado = Buffer.from(hashOriginal, 'hex');

    return timingSafeEqual(hashCalculado, hashEsperado);
}


function autenticarToken(req, res) {
    const autorizacion = req.headers.authorization;

    if (!autorizacion || !autorizacion.startsWith('Bearer ')) {
        responder(res, 401, {
            status: 'ERROR',
            message: 'Token no proporcionado'
        });
        return null;
    }

    const token = autorizacion.slice(7);
    const secretoJWT = process.env.JWT_SECRET;

    if (!secretoJWT) {
        console.error('Falta configurar JWT_SECRET');

        responder(res, 500, {
            status: 'ERROR',
            message: 'Error de configuración del servidor'
        });
        return null;
    }

    try {
        return jwt.verify(token, secretoJWT, {
            issuer: 'quequeda-api'
        });
    } catch (error) {
        responder(res, 401, {
            status: 'ERROR',
            message: 'Token inválido o vencido'
        });
        return null;
    }
}
// Envía una respuesta JSON.
function responder(res, codigo, datos) {
    res.writeHead(codigo);
    res.end(JSON.stringify(datos));
}

// ------------------------------------------------------------
// Servidor HTTP
// ------------------------------------------------------------




/* Orígenes autorizados para consumir la API de ¿Qué Queda?. */
const origenesPermitidos = [
    // Desarrollo local en el equipo.
    'http://localhost:5185',

    // Interfaz publicada en HostGator.
    'https://quequeda.singlartec.com'
];

// Crea el servidor HTTP de la API.
const server = http.createServer(async (req, res) => {

    // Define el formato de las respuestas de la API.
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Identifica el origen desde el que el navegador solicita acceso.
    const origenSolicitud = req.headers.origin;

    // Autoriza únicamente los orígenes definidos para el proyecto.
    if (origenesPermitidos.includes(origenSolicitud)) {
        res.setHeader('Access-Control-Allow-Origin', origenSolicitud);
        res.setHeader('Vary', 'Origin');

        // Permite los métodos HTTP utilizados por la aplicación.
        res.setHeader(
            'Access-Control-Allow-Methods',
            'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        );

        // Autoriza los encabezados necesarios para JSON y autenticación JWT.
        res.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization'
        );
    }

    // Responde a la comprobación previa que realiza el navegador.
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Normaliza la ruta y elimina los parámetros de consulta.
    const ruta = req.url.split('?')[0];

    // --------------------------------------------------------
    // 1. COMPROBAR CONEXIÓN CON MYSQL
    // GET /api/health/database
    // --------------------------------------------------------


    if (
        ruta.endsWith('/api/health/database') &&
        req.method === 'GET'
    ) {
        let connection;

        try {
            connection = await conectarMySQL();

            await connection.query('SELECT 1');

            responder(res, 200, {
                status: 'OK',
                database: 'conectada'
            });
        } catch (error) {
            console.error(
                'Error MySQL:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo conectar a MySQL',
                code: error.code || 'UNKNOWN'
            });
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }

    // --------------------------------------------------------
    // 2. CONSULTAR REGISTROS DE PRUEBA
    // GET /api/prueba
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/prueba') &&
        req.method === 'GET'
    ) {
        const inicio = performance.now();
        let connection;

        try {
            connection = await conectarMySQL();

            const [rows] = await connection.query(
                'SELECT * FROM prueba_api ORDER BY id DESC LIMIT 10'
            );

            const tiempoRespuesta = Number(
                (performance.now() - inicio).toFixed(2)
            );

            responder(res, 200, {
                status: 'OK',
                registros: rows,
                tiempo_respuesta_ms: tiempoRespuesta
            });
        } catch (error) {
            console.error(
                'Error MySQL:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudieron consultar los registros',
                code: error.code || 'UNKNOWN'
            });
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }

    // --------------------------------------------------------
    // 3. INSERTAR REGISTRO DE PRUEBA
    // POST /api/prueba
    // Cuerpo JSON: { "mensaje": "Texto de prueba" }
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/prueba') &&
        req.method === 'POST'
    ) {
        const inicio = performance.now();
        let connection;

        try {
            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            if (
                typeof datos.mensaje !== 'string' ||
                datos.mensaje.trim().length === 0 ||
                datos.mensaje.length > 100
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'mensaje es obligatorio y debe tener hasta 100 caracteres'
                });
                return;
            }

            connection = await conectarMySQL();

            const [resultado] = await connection.execute(
                'INSERT INTO prueba_api (mensaje) VALUES (?)',
                [datos.mensaje.trim()]
            );

            const tiempoRespuesta = Number(
                (performance.now() - inicio).toFixed(2)
            );

            responder(res, 201, {
                status: 'OK',
                mensaje: 'Registro guardado correctamente',
                id: resultado.insertId,
                tiempo_respuesta_ms: tiempoRespuesta
            });
        } catch (error) {
            console.error(
                'Error MySQL:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo guardar el registro',
                code: error.code || 'UNKNOWN'
            });
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }

    // --------------------------------------------------------
    // 4. REGISTRAR USUARIO
    // POST /api/usuarios/registro
    //
    // Cuerpo JSON:
    // {
    //   "nombre": "Eduardo",
    //   "correo": "usuario@ejemplo.cl",
    //   "contrasena": "UnaClaveSegura123!"
    // }
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/usuarios/registro') &&
        req.method === 'POST'
    ) {
        const inicio = performance.now();
        let connection;

        try {
            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            // Validar que se reciban los tres campos obligatorios.
            if (
                typeof datos.nombre !== 'string' ||
                typeof datos.correo !== 'string' ||
                typeof datos.contrasena !== 'string'
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'nombre, correo y contrasena son obligatorios'
                });
                return;
            }

            const nombre = datos.nombre.trim();
            const correo = datos.correo.trim().toLowerCase();
            const contrasena = datos.contrasena;

            // Validar nombre.
            if (
                nombre.length === 0 ||
                nombre.length > 100
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El nombre debe tener entre 1 y 100 caracteres'
                });
                return;
            }

            // Validación básica del formato del correo.
            if (
                correo.length > 150 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El correo no tiene un formato válido'
                });
                return;
            }

            // Política inicial: mínimo 12 caracteres.
            if (
                contrasena.length < 12 ||
                Buffer.byteLength(contrasena, 'utf8') > 1000
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La contraseña debe tener al menos 12 caracteres'
                });
                return;
            }

            connection = await conectarMySQL();

            // Comprobar si ya existe una cuenta con ese correo.
            const [usuarios] = await connection.execute(
                'SELECT id_usuario FROM Usuario WHERE correo = ? LIMIT 1',
                [correo]
            );

            if (usuarios.length > 0) {
                responder(res, 409, {
                    status: 'ERROR',
                    message: 'El correo ya está registrado'
                });
                return;
            }

            // Generar hash antes de guardar la contraseña.
            const contrasenaHash = await generarHash(contrasena);

            // Insertar el usuario usando parámetros SQL.
            const [resultado] = await connection.execute(
                `INSERT INTO Usuario
                    (nombre, correo, contrasena_hash)
                 VALUES (?, ?, ?)`,
                [nombre, correo, contrasenaHash]
            );

            const tiempoRespuesta = Number(
                (performance.now() - inicio).toFixed(2)
            );

            // Nunca devolver la contraseña ni el hash.
            responder(res, 201, {
                status: 'OK',
                mensaje: 'Usuario registrado correctamente',
                usuario: {
                    id_usuario: resultado.insertId,
                    nombre,
                    correo
                },
                tiempo_respuesta_ms: tiempoRespuesta
            });
        } catch (error) {
            // La restricción UNIQUE también protege ante solicitudes
            // simultáneas con el mismo correo.
            if (error.code === 'ER_DUP_ENTRY') {
                responder(res, 409, {
                    status: 'ERROR',
                    message: 'El correo ya está registrado'
                });
            } else {
                console.error(
                    'Error al registrar usuario:',
                    error.code || 'ERROR'
                );

                responder(res, 500, {
                    status: 'ERROR',
                    message: 'No se pudo registrar el usuario',
                    code: error.code || 'UNKNOWN'
                });
            }
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }
    
    
    // --------------------------------------------------------
    // 5. INICIAR SESIÓN
    // POST /api/usuarios/login
    //
    // Cuerpo JSON:
    // {
    //   "correo": "usuario@ejemplo.cl",
    //   "contrasena": "UnaClaveSegura123!"
    // }
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/usuarios/login') &&
        req.method === 'POST'
    ) {
        const inicio = performance.now();
        let connection;

        try {
            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            // Validar los campos obligatorios.
            if (
                typeof datos.correo !== 'string' ||
                typeof datos.contrasena !== 'string' ||
                datos.correo.trim() === '' ||
                datos.contrasena === ''
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El correo y la contraseña son obligatorios'
                });
                return;
            }

            const correo = datos.correo.trim().toLowerCase();
            const contrasena = datos.contrasena;

            if (
                correo.length > 150 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
                Buffer.byteLength(contrasena, 'utf8') > 1000
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'Los datos ingresados no son válidos'
                });
                return;
            }

            connection = await conectarMySQL();

            // Buscar al usuario por correo.
            const [usuarios] = await connection.execute(
                `SELECT id_usuario, nombre, correo, contrasena_hash
                 FROM Usuario
                 WHERE correo = ?
                 LIMIT 1`,
                [correo]
            );

            // Mensaje genérico para no revelar si el correo existe.
            if (usuarios.length === 0) {
                responder(res, 401, {
                    status: 'ERROR',
                    message: 'Correo o contraseña incorrectos'
                });
                return;
            }

            const usuario = usuarios[0];

            // Comparar la contraseña ingresada con el hash almacenado.
            const contrasenaValida = await verificarHash(
                contrasena,
                usuario.contrasena_hash
            );

            if (!contrasenaValida) {
                responder(res, 401, {
                    status: 'ERROR',
                    message: 'Correo o contraseña incorrectos'
                });
                return;
            }

           
            const secretoJWT = process.env.JWT_SECRET;

            if (!secretoJWT) {
                console.error('Falta configurar JWT_SECRET');
            
                responder(res, 500, {
                    status: 'ERROR',
                    message: 'Error de configuración del servidor'
                });
                return;
            }
            
            const token = jwt.sign(
                {
                    id_usuario: usuario.id_usuario,
                    correo: usuario.correo
                },
                secretoJWT,
                {
                    expiresIn: '1h',
                    issuer: 'quequeda-api',
                    subject: String(usuario.id_usuario)
                }
            );
            
            const tiempoRespuesta = Number(
                (performance.now() - inicio).toFixed(2)
            );
            
            responder(res, 200, {
                status: 'OK',
                mensaje: 'Inicio de sesión correcto',
                token: token,
                tipo_token: 'Bearer',
                expira_en: '1h',
                usuario: {
                    id_usuario: usuario.id_usuario,
                    nombre: usuario.nombre,
                    correo: usuario.correo
                },
                tiempo_respuesta_ms: tiempoRespuesta
            });

        } catch (error) {
            console.error(
                'Error al iniciar sesión:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo procesar el inicio de sesión'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }


        
         // --------------------------------------------------------
        // VERIFICAR TOKEN JWT
        // GET /api/usuarios/verificar-token
        // --------------------------------------------------------
        
        if (
            ruta.endsWith('/api/usuarios/verificar-token') &&
            req.method === 'GET'
        ) {
            const contenido = autenticarToken(req, res);
        
            if (!contenido) {
                return;
            }
        
            responder(res, 200, {
                status: 'OK',
                mensaje: 'Token válido',
                usuario: {
                    id_usuario: contenido.id_usuario,
                    correo: contenido.correo
                }
            });
        
            return;
        }

        // --------------------------------------------------------
        // RUTA DE PRUEBA PROTEGIDA POR JWT
        // GET /api/usuarios/prueba-protegida
        // --------------------------------------------------------
        
        if (
            ruta.endsWith('/api/usuarios/prueba-protegida') &&
            req.method === 'GET'
        ) {
            const contenido = autenticarToken(req, res);
        
            if (!contenido) {
                return;
            }
        
            responder(res, 200, {
                status: 'OK',
                mensaje: 'Acceso autorizado',
                id_usuario: contenido.id_usuario
            });
        
            return;
        }



    // --------------------------------------------------------
    // 7. CONSULTAR HOGARES DEL USUARIO AUTENTICADO
    // GET /api/hogares
    // --------------------------------------------------------
    
    if (
        ruta.endsWith('/api/hogares') &&
        req.method === 'GET'
    ) {
        const contenido = autenticarToken(req, res);
    
        if (!contenido) {
            return;
        }
    
        let connection;
    
        try {
            connection = await conectarMySQL();
    
            const [hogares] = await connection.execute(
                `SELECT
                    h.id_hogar,
                    h.nombre,
                    h.fecha_creacion,
                    mh.perfil
                 FROM Miembro_Hogar mh
                 INNER JOIN Hogar h
                    ON h.id_hogar = mh.id_hogar
                 WHERE mh.id_usuario = ?
                 ORDER BY h.id_hogar`,
                [contenido.id_usuario]
            );
    
            responder(res, 200, {
                status: 'OK',
                hogares: hogares
            });
    
        } catch (error) {
            console.error(
                'Error al consultar hogares:',
                error.code || 'ERROR'
            );
    
            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudieron consultar los hogares'
            });
    
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }
    
        return;
    }
    
    // --------------------------------------------------------
    // CONSULTAR INTEGRANTES DE UN HOGAR
    // GET /api/hogares/integrantes?id_hogar=2
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/hogares/integrantes') &&
        req.method === 'GET'
    ) {
        // Verificar que el usuario tenga una sesión válida.
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            // Obtener el identificador del hogar desde la URL.
            const parametros = new URL(
                req.url,
                'http://localhost'
            ).searchParams;

            const idHogar = Number(
                parametros.get('id_hogar')
            );

            // Validar el identificador recibido.
            if (
                !Number.isSafeInteger(idHogar) ||
                idHogar <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'id_hogar debe ser un número entero positivo'
                });
                return;
            }

            connection = await conectarMySQL();

            // Comprobar que el usuario autenticado pertenece al hogar.
            const [pertenencia] = await connection.execute(
                `SELECT id_usuario
                 FROM Miembro_Hogar
                 WHERE id_usuario = ? AND id_hogar = ?
                 LIMIT 1`,
                [contenido.id_usuario, idHogar]
            );

            if (pertenencia.length === 0) {
                responder(res, 403, {
                    status: 'ERROR',
                    message: 'No tienes acceso a los integrantes de este hogar'
                });
                return;
            }

            // Consultar los usuarios asociados al hogar y sus perfiles.
            const [integrantes] = await connection.execute(
                `SELECT
                    u.id_usuario,
                    u.nombre,
                    u.correo,
                    mh.perfil
                 FROM Miembro_Hogar mh
                 INNER JOIN Usuario u
                    ON u.id_usuario = mh.id_usuario
                 WHERE mh.id_hogar = ?
                 ORDER BY
                    CASE
                        WHEN mh.perfil = 'administrador' THEN 0
                        ELSE 1
                    END,
                    u.nombre`,
                [idHogar]
            );

            responder(res, 200, {
                status: 'OK',
                integrantes: integrantes
            });

        } catch (error) {
            console.error(
                'Error al consultar integrantes:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudieron consultar los integrantes'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }
    
    
    // --------------------------------------------------------
    // CREAR HOGAR Y ASIGNAR ADMINISTRADOR
    // POST /api/hogares
    // --------------------------------------------------------
    
    if (
        ruta.endsWith('/api/hogares') &&
        req.method === 'POST'
    ) {
        const contenido = autenticarToken(req, res);
    
        if (!contenido) {
            return;
        }
    
        let connection;
    
        try {
            const datos = await leerJSON(req, res);
    
            if (datos === null) {
                return;
            }
    
            if (
                typeof datos.nombre !== 'string' ||
                datos.nombre.trim().length === 0 ||
                datos.nombre.trim().length > 100
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El nombre debe tener entre 1 y 100 caracteres'
                });
                return;
            }
    
            connection = await conectarMySQL();
            await connection.beginTransaction();
    
            const [resultadoHogar] = await connection.execute(
                'INSERT INTO Hogar (nombre) VALUES (?)',
                [datos.nombre.trim()]
            );
    
            const idHogar = resultadoHogar.insertId;
    
            await connection.execute(
                `INSERT INTO Miembro_Hogar
                    (id_usuario, id_hogar, perfil)
                 VALUES (?, ?, ?)`,
                [contenido.id_usuario, idHogar, 'administrador']
            );
    
            await connection.commit();
    
            responder(res, 201, {
                status: 'OK',
                mensaje: 'Hogar creado correctamente',
                hogar: {
                    id_hogar: idHogar,
                    nombre: datos.nombre.trim(),
                    perfil: 'administrador'
                }
            });
    
        } catch (error) {
            if (connection) {
                await connection.rollback().catch(() => {});
            }
    
            console.error(
                'Error al crear hogar:',
                error.code || 'ERROR'
            );
    
            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo crear el hogar'
            });
    
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }
    
        return;
    }
    
    
    // --------------------------------------------------------
    // CREAR INVITACIÓN PARA UN HOGAR
    // POST /api/hogares/invitaciones
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/hogares/invitaciones') &&
        req.method === 'POST'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            const idHogar = Number(datos.id_hogar);

            if (
                !Number.isSafeInteger(idHogar) ||
                idHogar <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'id_hogar debe ser un número entero positivo'
                });
                return;
            }

            connection = await conectarMySQL();

            // Verificar que el usuario sea administrador del hogar.
            const [miembros] = await connection.execute(
                `SELECT perfil
                 FROM Miembro_Hogar
                 WHERE id_usuario = ? AND id_hogar = ?
                 LIMIT 1`,
                [contenido.id_usuario, idHogar]
            );

            if (
                miembros.length === 0 ||
                miembros[0].perfil !== 'administrador'
            ) {
                responder(res, 403, {
                    status: 'ERROR',
                    message: 'No tienes permisos para invitar miembros a este hogar'
                });
                return;
            }

            // Generar un código aleatorio y guardar solo su hash.
            const codigo = randomBytes(32).toString('hex');

            const codigoHash = createHash('sha256')
                .update(codigo)
                .digest('hex');

            // La invitación vence en 24 horas.
            const expiracion = new Date(
                Date.now() + 24 * 60 * 60 * 1000
            );

            const fechaExpiracion = expiracion
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');

            const [resultado] = await connection.execute(
                `INSERT INTO Invitacion_Hogar
                    (id_hogar, id_usuario_creador,
                     codigo_hash, fecha_expiracion)
                 VALUES (?, ?, ?, ?)`,
                [
                    idHogar,
                    contenido.id_usuario,
                    codigoHash,
                    fechaExpiracion
                ]
            );

            responder(res, 201, {
                status: 'OK',
                mensaje: 'Invitación creada correctamente',
                invitacion: {
                    id_invitacion: resultado.insertId,
                    codigo: codigo,
                    expira_en: expiracion.toISOString(),
                    validez_horas: 24
                }
            });

        } catch (error) {
            console.error(
                'Error al crear invitación:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo crear la invitación'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }

    
    
    // --------------------------------------------------------
    // CONSULTAR INVITACIÓN A UN HOGAR
    // GET /api/hogares/invitaciones/consultar?codigo=...
    // --------------------------------------------------------
    
    if (
        ruta.endsWith('/api/hogares/invitaciones/consultar') &&
        req.method === 'GET'
    ) {
        let connection;
    
        try {
            // Leer el código recibido en la URL.
            const url = new URL(req.url, 'http://localhost');
            const codigo = url.searchParams.get('codigo');
    
            // Validar el formato del código.
            if (
                typeof codigo !== 'string' ||
                !/^[a-f0-9]{64}$/i.test(codigo)
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El código de invitación no es válido'
                });
                return;
            }
    
            // Calcular el hash para buscar la invitación.
            const codigoHash = createHash('sha256')
                .update(codigo)
                .digest('hex');
    
            connection = await conectarMySQL();
    
            // Consultar invitación y nombre del hogar.
            const [invitaciones] = await connection.execute(
                `SELECT
                    i.id_invitacion,
                    i.estado,
                    i.fecha_expiracion,
                    h.id_hogar,
                    h.nombre AS nombre_hogar,
                    CASE
                        WHEN i.fecha_expiracion <= NOW() THEN 0
                        ELSE 1
                    END AS vigente
                 FROM Invitacion_Hogar i
                 INNER JOIN Hogar h
                    ON h.id_hogar = i.id_hogar
                 WHERE i.codigo_hash = ?
                 LIMIT 1`,
                [codigoHash]
            );
    
            // Comprobar que exista la invitación.
            if (invitaciones.length === 0) {
                responder(res, 404, {
                    status: 'ERROR',
                    message: 'La invitación no existe o no es válida'
                });
                return;
            }
    
            const invitacion = invitaciones[0];
    
            // Comprobar si venció.
            if (Number(invitacion.vigente) === 0) {
                responder(res, 410, {
                    status: 'ERROR',
                    message: 'La invitación ha vencido'
                });
                return;
            }
    
            // Comprobar que siga pendiente.
            if (invitacion.estado !== 'pendiente') {
                responder(res, 409, {
                    status: 'ERROR',
                    message: 'La invitación ya fue utilizada o revocada'
                });
                return;
            }
    
            // Devolver información pública de la invitación.
            responder(res, 200, {
                status: 'OK',
                invitacion: {
                    id_hogar: invitacion.id_hogar,
                    nombre_hogar: invitacion.nombre_hogar,
                    estado: invitacion.estado,
                    vigente: true,
                    fecha_expiracion: invitacion.fecha_expiracion
                }
            });
    
        } catch (error) {
            console.error(
                'Error al consultar invitación:',
                error.code || 'ERROR'
            );
    
            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo consultar la invitación'
            });
    
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }
    
        return;
    }
    
    
    // --------------------------------------------------------
    // ACEPTAR INVITACIÓN A UN HOGAR
    // POST /api/hogares/invitaciones/aceptar
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/hogares/invitaciones/aceptar') &&
        req.method === 'POST'
    ) {
        // Verificar que el usuario tenga una sesión válida.
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            // Leer el código enviado por el usuario.
            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            const codigo = datos.codigo;

            // Validar el formato del código generado por la API.
            if (
                typeof codigo !== 'string' ||
                !/^[a-f0-9]{64}$/i.test(codigo)
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El código de invitación no es válido'
                });
                return;
            }

            // Calcular el hash para buscar la invitación.
            const codigoHash = createHash('sha256')
                .update(codigo)
                .digest('hex');

            connection = await conectarMySQL();

            // Iniciar una transacción para proteger la operación.
            await connection.beginTransaction();

            // Buscar y bloquear la invitación durante la operación.
            const [invitaciones] = await connection.execute(
                `SELECT
                    id_invitacion,
                    id_hogar,
                    estado,
                    fecha_expiracion
                 FROM Invitacion_Hogar
                 WHERE codigo_hash = ?
                 LIMIT 1
                 FOR UPDATE`,
                [codigoHash]
            );

            // Comprobar que la invitación exista.
            if (invitaciones.length === 0) {
                await connection.rollback();

                responder(res, 404, {
                    status: 'ERROR',
                    message: 'La invitación no existe o no es válida'
                });
                return;
            }

            const invitacion = invitaciones[0];

            // Comprobar que la invitación siga pendiente.
            if (invitacion.estado !== 'pendiente') {
                await connection.rollback();

                responder(res, 409, {
                    status: 'ERROR',
                    message: 'La invitación ya fue utilizada o revocada'
                });
                return;
            }

            // Comprobar la fecha de expiración utilizando MySQL.
            const [vigencia] = await connection.execute(
                `SELECT
                    CASE
                        WHEN fecha_expiracion <= NOW() THEN 0
                        ELSE 1
                    END AS vigente
                 FROM Invitacion_Hogar
                 WHERE id_invitacion = ?`,
                [invitacion.id_invitacion]
            );

            // Marcar como vencida si superó su plazo.
            if (Number(vigencia[0].vigente) === 0) {
                await connection.execute(
                    `UPDATE Invitacion_Hogar
                     SET estado = 'vencida'
                     WHERE id_invitacion = ?`,
                    [invitacion.id_invitacion]
                );

                await connection.commit();

                responder(res, 410, {
                    status: 'ERROR',
                    message: 'La invitación ha vencido'
                });
                return;
            }

            // Comprobar que el usuario no pertenezca ya al hogar.
            const [pertenencia] = await connection.execute(
                `SELECT id_usuario
                 FROM Miembro_Hogar
                 WHERE id_usuario = ? AND id_hogar = ?
                 LIMIT 1`,
                [
                    contenido.id_usuario,
                    invitacion.id_hogar
                ]
            );

            if (pertenencia.length > 0) {
                await connection.rollback();

                responder(res, 409, {
                    status: 'ERROR',
                    message: 'Ya perteneces a este hogar'
                });
                return;
            }

            // Incorporar al usuario como integrante del hogar.
            await connection.execute(
                `INSERT INTO Miembro_Hogar
                    (id_usuario, id_hogar, perfil)
                 VALUES (?, ?, ?)`,
                [
                    contenido.id_usuario,
                    invitacion.id_hogar,
                    'integrante'
                ]
            );

            // Marcar la invitación como aceptada.
            await connection.execute(
                `UPDATE Invitacion_Hogar
                 SET estado = 'aceptada'
                 WHERE id_invitacion = ?`,
                [invitacion.id_invitacion]
            );

            // Confirmar ambas operaciones.
            await connection.commit();

            responder(res, 200, {
                status: 'OK',
                mensaje: 'Te has incorporado correctamente al hogar',
                id_hogar: invitacion.id_hogar
            });

        } catch (error) {
            // Deshacer los cambios si ocurre algún problema.
            if (connection) {
                await connection.rollback().catch(() => {});
            }

            console.error(
                'Error al aceptar invitación:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo aceptar la invitación'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }


    // --------------------------------------------------------
    // 8. CONSULTAR INVENTARIO DE UN HOGAR
    // GET /api/inventario?id_hogar=2
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/inventario') &&
        req.method === 'GET'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const parametros = new URL(
                req.url,
                'http://localhost'
            ).searchParams;

            const idHogar = Number(
                parametros.get('id_hogar')
            );

            if (
                !Number.isSafeInteger(idHogar) ||
                idHogar <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'id_hogar debe ser un número entero positivo'
                });
                return;
            }

            connection = await conectarMySQL();

            // Verificar que el usuario pertenezca al hogar.
            const [pertenencia] = await connection.execute(
                `SELECT id_usuario
                 FROM Miembro_Hogar
                 WHERE id_usuario = ? AND id_hogar = ?
                 LIMIT 1`,
                [contenido.id_usuario, idHogar]
            );

            if (pertenencia.length === 0) {
                responder(res, 403, {
                    status: 'ERROR',
                    message: 'No tienes acceso al inventario de este hogar'
                });
                return;
            }

            // Consultar productos incorporados al inventario.
            const [productos] = await connection.execute(
                `SELECT
                    i.id_inventario,
                    i.id_hogar,
                    i.id_producto,
                    p.nombre,
                    p.categoria,
                    p.unidad_medida,
                    i.cantidad_actual,
                    i.cantidad_minima,
                    CASE
                        WHEN i.cantidad_actual <= 0 THEN 'Faltante'
                        WHEN i.cantidad_actual <= i.cantidad_minima THEN 'Por agotarse'
                        ELSE 'Disponible'
                    END AS estado
                 FROM Inventario i
                 INNER JOIN Producto p
                    ON p.id_producto = i.id_producto
                 WHERE i.id_hogar = ?
                 ORDER BY p.nombre ASC`,
                [idHogar]
            );

            responder(res, 200, {
                status: 'OK',
                inventario: productos
            });

        } catch (error) {
            console.error(
                'Error al consultar inventario:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo consultar el inventario'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }
    
    // --------------------------------------------------------
    // 9. INCORPORAR PRODUCTO AL INVENTARIO
    // POST /api/inventario
    //
    // Cuerpo JSON:
    // {
    //   "id_hogar": 2,
    //   "id_producto": 5,
    //   "cantidad_actual": 3,
    //   "cantidad_minima": 2
    // }
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/inventario') &&
        req.method === 'POST'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            const idHogar = Number(datos.id_hogar);
            const idProducto = Number(datos.id_producto);
            const cantidadActual = Number(datos.cantidad_actual);
            const cantidadMinima = Number(datos.cantidad_minima);

            // Validar identificadores.
            if (
                !Number.isSafeInteger(idHogar) ||
                idHogar <= 0 ||
                !Number.isSafeInteger(idProducto) ||
                idProducto <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'Los identificadores del hogar y producto no son válidos'
                });
                return;
            }

            // Validar cantidades.
            if (
                !Number.isFinite(cantidadActual) ||
                cantidadActual < 0 ||
                !Number.isFinite(cantidadMinima) ||
                cantidadMinima < 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'Las cantidades deben ser números iguales o mayores que cero'
                });
                return;
            }

            connection = await conectarMySQL();

            // Verificar que el usuario pertenezca al hogar.
            const [pertenencia] = await connection.execute(
                `SELECT id_usuario
                 FROM Miembro_Hogar
                 WHERE id_usuario = ? AND id_hogar = ?
                 LIMIT 1`,
                [contenido.id_usuario, idHogar]
            );

            if (pertenencia.length === 0) {
                responder(res, 403, {
                    status: 'ERROR',
                    message: 'No tienes permiso para modificar el inventario de este hogar'
                });
                return;
            }

            // Comprobar que el producto exista en el catálogo.
            const [productos] = await connection.execute(
                `SELECT id_producto
                 FROM Producto
                 WHERE id_producto = ?
                 LIMIT 1`,
                [idProducto]
            );

            if (productos.length === 0) {
                responder(res, 404, {
                    status: 'ERROR',
                    message: 'El producto no existe en el catálogo'
                });
                return;
            }

            // Comprobar que el producto no esté incorporado.
            const [existentes] = await connection.execute(
                `SELECT id_inventario
                 FROM Inventario
                 WHERE id_hogar = ? AND id_producto = ?
                 LIMIT 1`,
                [idHogar, idProducto]
            );

            if (existentes.length > 0) {
                responder(res, 409, {
                    status: 'ERROR',
                    message: 'Este producto ya está incorporado al inventario del hogar'
                });
                return;
            }

            // Incorporar producto al inventario.
            const [resultado] = await connection.execute(
                `INSERT INTO Inventario
                    (id_hogar, id_producto, cantidad_actual, cantidad_minima)
                 VALUES (?, ?, ?, ?)`,
                [
                    idHogar,
                    idProducto,
                    cantidadActual,
                    cantidadMinima
                ]
            );

            responder(res, 201, {
                status: 'OK',
                mensaje: 'Producto incorporado al inventario correctamente',
                id_inventario: resultado.insertId
            });

        } catch (error) {
            console.error(
                'Error al incorporar producto al inventario:',
                error.code || 'ERROR'
            );

            if (error.code === 'ER_DUP_ENTRY') {
                responder(res, 409, {
                    status: 'ERROR',
                    message: 'Este producto ya está incorporado al inventario del hogar'
                });
            } else {
                responder(res, 500, {
                    status: 'ERROR',
                    message: 'No se pudo incorporar el producto al inventario'
                });
            }

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }
    


    // --------------------------------------------------------
    // 10. ACTUALIZAR PRODUCTO DEL INVENTARIO
    // PUT /api/inventario/:id
    // --------------------------------------------------------

    if (
        /\/api\/inventario\/\d+$/.test(ruta) &&
        req.method === 'PUT'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;
        let transaccionIniciada = false;

        try {
            const idInventario = Number(ruta.split('/').pop());

            if (
                !Number.isSafeInteger(idInventario) ||
                idInventario <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El identificador del inventario no es válido'
                });
                return;
            }

            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            const cantidadActual = Number(datos.cantidad_actual);
            const cantidadMinima = Number(datos.cantidad_minima);

            if (
                !Number.isFinite(cantidadActual) ||
                cantidadActual < 0 ||
                !Number.isFinite(cantidadMinima) ||
                cantidadMinima < 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'Las cantidades deben ser números iguales o mayores que cero'
                });
                return;
            }

            connection = await conectarMySQL();

            // Iniciar transacción.
            await connection.beginTransaction();
            transaccionIniciada = true;

            // Obtener inventario y bloquear el registro.
            // Verificar que el usuario pertenezca al hogar.
            const [registros] = await connection.execute(
                `SELECT
                    i.id_inventario,
                    i.id_hogar,
                    i.id_producto,
                    i.cantidad_actual
                 FROM Inventario i
                 INNER JOIN Miembro_Hogar mh
                    ON mh.id_hogar = i.id_hogar
                 WHERE i.id_inventario = ?
                   AND mh.id_usuario = ?
                 LIMIT 1
                 FOR UPDATE`,
                [idInventario, contenido.id_usuario]
            );

            if (registros.length === 0) {
                await connection.rollback();
                transaccionIniciada = false;

                responder(res, 404, {
                    status: 'ERROR',
                    message: 'El registro no existe o no tienes acceso a él'
                });
                return;
            }

            const inventario = registros[0];
            const cantidadAnterior = Number(inventario.cantidad_actual);

            const diferencia = cantidadActual - cantidadAnterior;

            // Actualizar inventario y cantidad mínima.
            await connection.execute(
                `UPDATE Inventario
                 SET cantidad_actual = ?,
                     cantidad_minima = ?
                 WHERE id_inventario = ?`,
                [
                    cantidadActual,
                    cantidadMinima,
                    idInventario
                ]
            );

            // Registrar movimiento solamente si cambió la cantidad.
            if (diferencia !== 0) {

                const tipoMovimiento =
                    diferencia < 0 ? 'CONSUMO' : 'INGRESO';

                const cantidadMovimiento = Math.abs(diferencia);

                await connection.execute(
                    `INSERT INTO MovimientoInventario
                        (id_hogar, id_usuario, id_producto,
                         tipo_movimiento, cantidad)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        inventario.id_hogar,
                        contenido.id_usuario,
                        inventario.id_producto,
                        tipoMovimiento,
                        cantidadMovimiento
                    ]
                );
            }

            // Confirmar actualización y movimiento conjuntamente.
            await connection.commit();
            transaccionIniciada = false;

            responder(res, 200, {
                status: 'OK',
                mensaje: diferencia === 0
                    ? 'Inventario actualizado correctamente'
                    : 'Inventario actualizado y movimiento registrado'
            });

        } catch (error) {

            if (connection && transaccionIniciada) {
                await connection.rollback().catch(() => {});
                transaccionIniciada = false;
            }

            console.error(
                'Error al actualizar inventario:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo actualizar el inventario'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }




    
    // --------------------------------------------------------
    // 11. RETIRAR PRODUCTO DEL INVENTARIO
    // DELETE /api/inventario/:id
    // --------------------------------------------------------

    if (
        /\/api\/inventario\/\d+$/.test(ruta) &&
        req.method === 'DELETE'
    ) { 
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const idInventario = Number(
                ruta.split('/').pop()
            );

            if (
                !Number.isSafeInteger(idInventario) ||
                idInventario <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El identificador del inventario no es válido'
                });
                return;
            }

            connection = await conectarMySQL();

            // Verificar que el registro pertenezca a un hogar
            // donde el usuario autenticado sea integrante.
            const [registros] = await connection.execute(
                `SELECT
                    i.id_inventario,
                    i.id_hogar,
                    i.id_producto
                 FROM Inventario i
                 INNER JOIN Miembro_Hogar mh
                    ON mh.id_hogar = i.id_hogar
                 WHERE i.id_inventario = ?
                   AND mh.id_usuario = ?
                 LIMIT 1`,
                [idInventario, contenido.id_usuario]
            );

            if (registros.length === 0) {
                responder(res, 404, {
                    status: 'ERROR',
                    message: 'El registro no existe o no tienes acceso a él'
                });
                return;
            }

            const inventario = registros[0];

            // Comprobar si existen movimientos asociados.
            const [movimientos] = await connection.execute(
                `SELECT id_movimiento
                 FROM MovimientoInventario
                 WHERE id_hogar = ?
                   AND id_producto = ?
                 LIMIT 1`,
                [
                    inventario.id_hogar,
                    inventario.id_producto
                ]
            );

            if (movimientos.length > 0) {
                responder(res, 409, {
                    status: 'ERROR',
                    message: 'No se puede retirar este producto porque tiene movimientos registrados. Primero debe eliminarlos para ejecutar esta acci\u00F3n.'
                });
                return;
            }

            // Retirar el producto únicamente de este inventario.
            await connection.execute(
                `DELETE FROM Inventario
                 WHERE id_inventario = ?`,
                [idInventario]
            );

            responder(res, 200, {
                status: 'OK',
                mensaje: 'Producto retirado del inventario correctamente'
            });

        } catch (error) {
            console.error(
                'Error al retirar producto del inventario:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo retirar el producto del inventario'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }
    

    // --------------------------------------------------------
    // CONSULTAR CATÁLOGO DE PRODUCTOS
    // GET /api/productos
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/productos') &&
        req.method === 'GET'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            connection = await conectarMySQL();

            const [productos] = await connection.execute(
                `SELECT
                    id_producto,
                    nombre,
                    categoria,
                    cantidad,
                    unidad_medida
                 FROM Producto
                 ORDER BY nombre ASC`
            );

            responder(res, 200, {
                status: 'OK',
                productos: productos
            });

        } catch (error) {
            console.error(
                'Error al consultar productos:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo consultar el catálogo de productos'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }


    // --------------------------------------------------------
    // REGISTRAR PRODUCTO EN EL CATÁLOGO
    // POST /api/productos
    // --------------------------------------------------------

    if (
        ruta.endsWith('/api/productos') &&
        req.method === 'POST'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            const nombre = typeof datos.nombre === 'string'
                ? datos.nombre.trim()
                : '';

            const categoria = typeof datos.categoria === 'string'
                ? datos.categoria.trim()
                : null;

            const unidadMedida = typeof datos.unidad_medida === 'string'
                ? datos.unidad_medida.trim()
                : '';

            const cantidad = Number(datos.cantidad);

            if (!nombre || nombre.length > 100) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El nombre es obligatorio y debe tener hasta 100 caracteres'
                });
                return;
            }

            if (categoria !== null && categoria.length > 80) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La categoría no puede superar los 80 caracteres'
                });
                return;
            }

            if (
                !Number.isFinite(cantidad) ||
                cantidad <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La cantidad debe ser un número mayor que cero'
                });
                return;
            }

            if (!unidadMedida || unidadMedida.length > 30) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La unidad de medida es obligatoria y debe tener hasta 30 caracteres'
                });
                return;
            }

            connection = await conectarMySQL();

            const [resultado] = await connection.execute(
                `INSERT INTO Producto
                    (nombre, categoria, cantidad, unidad_medida)
                 VALUES (?, ?, ?, ?)`,
                [nombre, categoria, cantidad, unidadMedida]
            );

            responder(res, 201, {
                status: 'OK',
                mensaje: 'Producto registrado correctamente',
                producto: {
                    id_producto: resultado.insertId,
                    nombre,
                    categoria,
                    cantidad,
                    unidad_medida: unidadMedida
                }
            });

        } catch (error) {
            console.error(
                'Error al registrar producto:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo registrar el producto'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }


    // --------------------------------------------------------
    // ACTUALIZAR PRODUCTO DEL CATÁLOGO
    // PUT /api/productos/:id
    // --------------------------------------------------------

    if (
        /\/api\/productos\/\d+$/.test(ruta) &&
        req.method === 'PUT'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const idProducto = Number(
                ruta.split('/').pop()
            );

            if (
                !Number.isSafeInteger(idProducto) ||
                idProducto <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El identificador del producto no es válido'
                });
                return;
            }

            const datos = await leerJSON(req, res);

            if (datos === null) {
                return;
            }

            const nombre = typeof datos.nombre === 'string'
                ? datos.nombre.trim()
                : '';

            const categoria = typeof datos.categoria === 'string'
                ? datos.categoria.trim()
                : null;

            const unidadMedida = typeof datos.unidad_medida === 'string'
                ? datos.unidad_medida.trim()
                : '';

            const cantidad = Number(datos.cantidad);

            if (!nombre || nombre.length > 100) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El nombre es obligatorio y debe tener hasta 100 caracteres'
                });
                return;
            }

            if (categoria !== null && categoria.length > 80) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La categoría no puede superar los 80 caracteres'
                });
                return;
            }

            if (
                !Number.isFinite(cantidad) ||
                cantidad <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La cantidad debe ser mayor que cero'
                });
                return;
            }

            if (!unidadMedida || unidadMedida.length > 30) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La unidad de medida es obligatoria y debe tener hasta 30 caracteres'
                });
                return;
            }

            connection = await conectarMySQL();

            const [resultado] = await connection.execute(
                `UPDATE Producto
                 SET nombre = ?,
                     categoria = ?,
                     cantidad = ?,
                     unidad_medida = ?
                 WHERE id_producto = ?`,
                [
                    nombre,
                    categoria,
                    cantidad,
                    unidadMedida,
                    idProducto
                ]
            );

            if (resultado.affectedRows === 0) {
                responder(res, 404, {
                    status: 'ERROR',
                    message: 'El producto no existe'
                });
                return;
            }

            responder(res, 200, {
                status: 'OK',
                mensaje: 'Producto actualizado correctamente'
            });

        } catch (error) {
            console.error(
                'Error al actualizar producto:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo actualizar el producto'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }



    // --------------------------------------------------------
    // ELIMINAR PRODUCTO DEL CATÁLOGO
    // DELETE /api/productos/:id
    // --------------------------------------------------------

    if (
        /\/api\/productos\/\d+$/.test(ruta) &&
        req.method === 'DELETE'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const idProducto = Number(
                ruta.split('/').pop()
            );

            if (
                !Number.isSafeInteger(idProducto) ||
                idProducto <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El identificador del producto no es válido'
                });
                return;
            }

            connection = await conectarMySQL();

            // 1. Contar hogares que utilizan el producto en Inventario.
            const [usoInventario] = await connection.execute(
                `SELECT COUNT(DISTINCT id_hogar) AS cantidad_hogares
                 FROM Inventario
                 WHERE id_producto = ?`,
                [idProducto]
            );

            // 2. Contar hogares que utilizan el producto en listas de compra.
            const [usoListas] = await connection.execute(
                `SELECT COUNT(DISTINCT lc.id_hogar) AS cantidad_hogares
                 FROM DetalleListaCompra dlc
                 INNER JOIN ListaCompra lc
                    ON lc.id_lista = dlc.id_lista
                 WHERE dlc.id_producto = ?`,
                [idProducto]
            );

            // 3. Contar hogares que tienen movimientos del producto.
            const [usoMovimientos] = await connection.execute(
                `SELECT COUNT(DISTINCT id_hogar) AS cantidad_hogares
                 FROM MovimientoInventario
                 WHERE id_producto = ?`,
                [idProducto]
            );

            const cantidadInventario = Number(
                usoInventario[0].cantidad_hogares
            );

            const cantidadListas = Number(
                usoListas[0].cantidad_hogares
            );

            const cantidadMovimientos = Number(
                usoMovimientos[0].cantidad_hogares
            );

            // Reunir todas las causas que impiden eliminar el producto.
            const causas = [];

            if (cantidadInventario > 0) {
                const texto = cantidadInventario === 1
                    ? '1 hogar'
                    : `${cantidadInventario} hogares`;

                causas.push(
                    `Inventarios: ${texto}`
                );
            }

            if (cantidadListas > 0) {
                const texto = cantidadListas === 1
                    ? '1 hogar'
                    : `${cantidadListas} hogares`;

                causas.push(
                    `Listas de compra: ${texto}`
                );
            }

            if (cantidadMovimientos > 0) {
                const texto = cantidadMovimientos === 1
                    ? '1 hogar'
                    : `${cantidadMovimientos} hogares`;

                causas.push(
                    `Movimientos de inventario: ${texto}`
                );
            }

            // Si existen asociaciones, no permitir la eliminación.
            if (causas.length > 0) {
                responder(res, 409, {
                    status: 'ERROR',
                    message:
                        'No se puede eliminar este producto porque mantiene registros asociados:',
                    detalles: causas
                });
                return;
            }

            // 4. Eliminar únicamente si no existen asociaciones.
            const [resultado] = await connection.execute(
                `DELETE FROM Producto
                 WHERE id_producto = ?`,
                [idProducto]
            );

            if (resultado.affectedRows === 0) {
                responder(res, 404, {
                    status: 'ERROR',
                    message: 'El producto no existe'
                });
                return;
            }

            responder(res, 200, {
                status: 'OK',
                mensaje: 'Producto eliminado correctamente'
            });

        } catch (error) {
            console.error(
                'Error al eliminar producto:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo eliminar el producto'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }

    
    
    /*
    LISTA DE COMPRAS - QUEQUEDA
    Insertar DESPUES del endpoint DELETE /api/productos/:id
    y ANTES de "// 6. RUTA NO RECONOCIDA".
    
    Requiere columnas:
    DetalleListaCompra.comprado TINYINT(1) DEFAULT 0
    DetalleListaCompra.id_usuario_compra INT NULL
    */
    
    const validarAccesoLista = async (connection, idLista, idUsuario) => {
        const [rows] = await connection.execute(
            `SELECT l.id_lista, l.id_hogar, l.estado
             FROM ListaCompra l
             INNER JOIN Miembro_Hogar mh ON mh.id_hogar = l.id_hogar
             WHERE l.id_lista = ? AND mh.id_usuario = ? LIMIT 1`,
            [idLista, idUsuario]
        );
        return rows[0] || null;
    };
    
    
    // 1) GET /api/listas-compra?id_hogar=1
    if (
        /\/api\/listas-compra$/.test(ruta) &&
        req.method === 'GET'
    ) {
        const usuario = autenticarToken(req, res);
        if (!usuario) return;
        let connection;
        try {
            const idHogar = Number(new URL(req.url, 'http://localhost').searchParams.get('id_hogar'));
            if (!Number.isSafeInteger(idHogar) || idHogar <= 0) {
                responder(res, 400, {status:'ERROR', message:'id_hogar no es válido'}); return;
            }
            connection = await conectarMySQL();
            const [miembro] = await connection.execute(
                `SELECT id_usuario FROM Miembro_Hogar WHERE id_hogar=? AND id_usuario=? LIMIT 1`,
                [idHogar, usuario.id_usuario]
            );
            if (!miembro.length) {
                responder(res, 403, {status:'ERROR', message:'No tienes acceso a este hogar'}); return;
            }
            const [listas] = await connection.execute(
                `SELECT l.id_lista,l.id_hogar,l.id_usuario,l.nombre,l.estado,
                        COUNT(d.id_detalle) AS total_productos,
                        COALESCE(SUM(d.comprado=1),0) AS productos_comprados
                 FROM ListaCompra l
                 LEFT JOIN DetalleListaCompra d ON d.id_lista=l.id_lista
                 WHERE l.id_hogar=?
                 GROUP BY l.id_lista,l.id_hogar,l.id_usuario,l.nombre,l.estado
                 ORDER BY l.id_lista DESC`, [idHogar]
            );
            responder(res, 200, {status:'OK', listas});
        } catch (e) {
            console.error('Consultar listas:', e.code || 'ERROR');
            responder(res, 500, {status:'ERROR', message:'No se pudieron consultar las listas'});
        } finally { if (connection) await connection.end().catch(()=>{}); }
        return;
    }
    

    // 3) GET /api/listas-compra/:id
    if (/\/api\/listas-compra\/\d+$/.test(ruta) && req.method === 'GET') {
        const usuario = autenticarToken(req,res);
        if (!usuario) return;
        let connection;
        try {
            const idLista = Number(ruta.split('/').pop());
            connection = await conectarMySQL();
            const lista = await validarAccesoLista(connection,idLista,usuario.id_usuario);
            if (!lista) { responder(res,404,{status:'ERROR',message:'Lista no encontrada o sin acceso'}); return; }
            const [cabecera] = await connection.execute(
                `SELECT id_lista,id_hogar,id_usuario,nombre,estado FROM ListaCompra WHERE id_lista=?`,
                [idLista]
            );
            const [productos] = await connection.execute(
                `SELECT d.id_detalle,d.id_lista,d.id_producto,p.nombre,p.categoria,
                        p.unidad_medida,d.cantidad,d.comprado,d.id_usuario_compra,
                        u.nombre AS nombre_comprador
                 FROM DetalleListaCompra d
                 INNER JOIN Producto p ON p.id_producto=d.id_producto
                 LEFT JOIN Usuario u ON u.id_usuario=d.id_usuario_compra
                 WHERE d.id_lista=? ORDER BY p.nombre`,
                [idLista]
            );
            responder(res,200,{status:'OK',lista:cabecera[0],productos});
        } catch(e) {
            console.error('Consultar lista:',e.code||'ERROR');
            responder(res,500,{status:'ERROR',message:'No se pudo consultar la lista'});
        } finally { if(connection) await connection.end().catch(()=>{}); }
        return;
    }
    
    
    // 4) POST /api/listas-compra/:id/detalles  {id_producto,cantidad}
    if (/\/api\/listas-compra\/\d+\/detalles$/.test(ruta) && req.method === 'POST') {
        const usuario = autenticarToken(req,res);
        if (!usuario) return;
        let connection;
        try {
            const partesRuta = ruta.split('/').filter(Boolean);
            const idLista = Number(partesRuta[partesRuta.indexOf('listas-compra') + 1]);
            const datos = await leerJSON(req,res);
            if (datos === null) return;
            const idProducto = Number(datos.id_producto), cantidad = Number(datos.cantidad);
            if (!Number.isSafeInteger(idLista)||idLista<=0||!Number.isSafeInteger(idProducto)||idProducto<=0||!Number.isFinite(cantidad)||cantidad<=0) {
                responder(res,400,{status:'ERROR',message:'Lista, producto o cantidad no válidos'}); return;
            }
            connection = await conectarMySQL();
            const lista = await validarAccesoLista(connection,idLista,usuario.id_usuario);
            if (!lista || lista.estado!=='PENDIENTE') {
                responder(res,404,{status:'ERROR',message:'Lista no encontrada, cerrada o sin acceso'}); return;
            }
            const [p] = await connection.execute(`SELECT id_producto FROM Producto WHERE id_producto=?`,[idProducto]);
            if (!p.length) { responder(res,404,{status:'ERROR',message:'Producto no existe'}); return; }
            const [r] = await connection.execute(
                `INSERT INTO DetalleListaCompra (id_lista,id_producto,cantidad,comprado,id_usuario_compra)
                 VALUES (?,?,?,0,NULL)`,[idLista,idProducto,cantidad]
            );
            responder(res,201,{status:'OK',mensaje:'Producto agregado',id_detalle:r.insertId});
        } catch(e) {
            if(e.code==='ER_DUP_ENTRY') responder(res,409,{status:'ERROR',message:'El producto ya está en esta lista'});
            else { console.error('Agregar detalle:',e.code||'ERROR'); responder(res,500,{status:'ERROR',message:'No se pudo agregar el producto'}); }
        } finally { if(connection) await connection.end().catch(()=>{}); }
        return;
    }
    
    
    // 5) PUT /api/listas-compra/detalles/:id  {cantidad}
    if (/\/api\/listas-compra\/detalles\/\d+$/.test(ruta) && req.method === 'PUT') {
        const usuario = autenticarToken(req,res);
        if (!usuario) return;
        let connection;
        try {
            const idDetalle = Number(ruta.split('/').pop());
            const datos = await leerJSON(req,res);
            if(datos===null) return;
            const cantidad = Number(datos.cantidad);
            if(!Number.isSafeInteger(idDetalle)||idDetalle<=0||!Number.isFinite(cantidad)||cantidad<=0) {
                responder(res,400,{status:'ERROR',message:'Detalle o cantidad no válidos'}); return;
            }
            connection = await conectarMySQL();
            const [r] = await connection.execute(
                `UPDATE DetalleListaCompra d
                 INNER JOIN ListaCompra l ON l.id_lista=d.id_lista
                 INNER JOIN Miembro_Hogar mh ON mh.id_hogar=l.id_hogar
                 SET d.cantidad=?
                 WHERE d.id_detalle=? AND mh.id_usuario=? AND l.estado='PENDIENTE' AND d.comprado=0`,
                [cantidad,idDetalle,usuario.id_usuario]
            );
            if(!r.affectedRows) { responder(res,404,{status:'ERROR',message:'Detalle no encontrado, comprado o sin acceso'}); return; }
            responder(res,200,{status:'OK',mensaje:'Cantidad actualizada'});
        } catch(e) {
            console.error('Actualizar detalle:',e.code||'ERROR');
            responder(res,500,{status:'ERROR',message:'No se pudo actualizar la cantidad'});
        } finally { if(connection) await connection.end().catch(()=>{}); }
        return;
    }
    
    
    // 6) DELETE /api/listas-compra/detalles/:id
    if (/\/api\/listas-compra\/detalles\/\d+$/.test(ruta) && req.method === 'DELETE') {
        const usuario = autenticarToken(req,res);
        if (!usuario) return;
        let connection;
        try {
            const idDetalle = Number(ruta.split('/').pop());
            if(!Number.isSafeInteger(idDetalle)||idDetalle<=0) { responder(res,400,{status:'ERROR',message:'Detalle no válido'}); return; }
            connection = await conectarMySQL();
            const [r] = await connection.execute(
                `DELETE d FROM DetalleListaCompra d
                 INNER JOIN ListaCompra l ON l.id_lista=d.id_lista
                 INNER JOIN Miembro_Hogar mh ON mh.id_hogar=l.id_hogar
                 WHERE d.id_detalle=? AND mh.id_usuario=? AND l.estado='PENDIENTE' AND d.comprado=0`,
                [idDetalle,usuario.id_usuario]
            );
            if(!r.affectedRows) { responder(res,404,{status:'ERROR',message:'Detalle no encontrado, comprado o sin acceso'}); return; }
            responder(res,200,{status:'OK',mensaje:'Producto quitado de la lista'});
        } catch(e) {
            console.error('Eliminar detalle:',e.code||'ERROR');
            responder(res,500,{status:'ERROR',message:'No se pudo quitar el producto'});
        } finally { if(connection) await connection.end().catch(()=>{}); }
        return;
    }
    
    
    // 7) GET /api/listas-compra/generar?id_hogar=1
    // Crea lista con productos cuyo stock es menor o igual al mínimo.
    if (ruta.endsWith('/api/listas-compra/generar') && req.method === 'GET') {
        const usuario = autenticarToken(req,res);
        if (!usuario) return;
        let connection;
        try {
            const idHogar = Number(new URL(req.url,'http://localhost').searchParams.get('id_hogar'));
            if(!Number.isSafeInteger(idHogar)||idHogar<=0) { responder(res,400,{status:'ERROR',message:'Hogar no válido'}); return; }
            connection = await conectarMySQL();
            const [m] = await connection.execute(
                `SELECT id_usuario FROM Miembro_Hogar WHERE id_hogar=? AND id_usuario=? LIMIT 1`,
                [idHogar,usuario.id_usuario]
            );
            if(!m.length) { responder(res,403,{status:'ERROR',message:'No tienes acceso a este hogar'}); return; }
            const [items] = await connection.execute(
                `SELECT id_producto,GREATEST(cantidad_minima-cantidad_actual,1) AS cantidad_sugerida
                 FROM Inventario WHERE id_hogar=? AND cantidad_actual<=cantidad_minima`,
                [idHogar]
            );
            if(!items.length) { responder(res,200,{status:'OK',mensaje:'No hay productos por reponer',id_lista:null,total_productos:0}); return; }
            await connection.beginTransaction();
            const [l] = await connection.execute(
                `INSERT INTO ListaCompra (id_hogar,id_usuario,nombre,estado) VALUES (?,?,?,'PENDIENTE')`,
                [idHogar,usuario.id_usuario,'Reposici\u00f3n de inventario']
            );
            for(const item of items) {
                await connection.execute(
                    `INSERT INTO DetalleListaCompra (id_lista,id_producto,cantidad,comprado,id_usuario_compra)
                     VALUES (?,?,?,0,NULL)`,
                    [l.insertId,item.id_producto,item.cantidad_sugerida]
                );
            }
            await connection.commit();
            responder(res,201,{status:'OK',mensaje:'Lista generada',id_lista:l.insertId,total_productos:items.length});
        } catch(e) {
            if(connection) await connection.rollback().catch(()=>{});
            console.error('Generar lista:',e.code||'ERROR');
            responder(res,500,{status:'ERROR',message:'No se pudo generar la lista'});
        } finally { if(connection) await connection.end().catch(()=>{}); }
        return;
    }
    
    
   
    // 2) POST /api/listas-compra {id_hogar,nombre}
    if (ruta.endsWith('/api/listas-compra') && req.method === 'POST') {
        const usuario = autenticarToken(req, res);
        if (!usuario) return;
    
        let connection;
    
        try {
            const datos = await leerJSON(req, res);
            if (datos === null) return;
    
            const idHogar = Number(datos.id_hogar);
            const nombre = typeof datos.nombre === 'string'
                ? datos.nombre.trim()
                : '';
    
            if (!Number.isSafeInteger(idHogar) || idHogar <= 0 || !nombre || nombre.length > 100) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'Indica un hogar válido y un nombre de hasta 100 caracteres'
                });
                return;
            }
    
            // Identificador de fecha y hora de Chile
            const partesFecha = new Intl.DateTimeFormat('es-CL', {
                timeZone: 'America/Santiago',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23'
            }).formatToParts(new Date());
    
            const obtenerParte = tipo =>
                partesFecha.find(p => p.type === tipo)?.value ?? '';
    
            const identificadorFecha =
                `${obtenerParte('day')}/${obtenerParte('month')} ${obtenerParte('hour')}:${obtenerParte('minute')}`;
    
            const nombreFinal = `${nombre.slice(0, 80)} - ${identificadorFecha}`;
    
            connection = await conectarMySQL();
    
            const [miembro] = await connection.execute(
                `SELECT id_usuario
                 FROM Miembro_Hogar
                 WHERE id_hogar = ? AND id_usuario = ?
                 LIMIT 1`,
                [idHogar, usuario.id_usuario]
            );
    
            if (!miembro.length) {
                responder(res, 403, {
                    status: 'ERROR',
                    message: 'No tienes acceso a este hogar'
                });
                return;
            }
    
            const [r] = await connection.execute(
                `INSERT INTO ListaCompra
                 (id_hogar, id_usuario, nombre, estado)
                 VALUES (?, ?, ?, 'PENDIENTE')`,
                [idHogar, usuario.id_usuario, nombreFinal]
            );
    
            responder(res, 201, {
                status: 'OK',
                mensaje: 'Lista creada',
                id_lista: r.insertId
            });
    
        } catch (e) {
            console.error('Crear lista:', e.code || 'ERROR');
    
            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo crear la lista'
            });
    
        } finally {
            if (connection) await connection.end().catch(() => {});
        }
    
        return;
    }


         // --------------------------------------------------------
    // ELIMINAR LISTA DE COMPRAS
    // DELETE /api/listas-compra/:id
    // --------------------------------------------------------

    if (
        /\/api\/listas-compra\/\d+$/.test(ruta) &&
        req.method === 'DELETE'
    ) {
        const usuario = autenticarToken(req, res);
        if (!usuario) return;

        let connection;

        try {
            const idLista = Number(ruta.split('/').pop());

            if (!Number.isSafeInteger(idLista) || idLista <= 0) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El identificador de la lista no es válido'
                });
                return;
            }

            connection = await conectarMySQL();
            await connection.beginTransaction();

            const lista = await validarAccesoLista(
                connection,
                idLista,
                usuario.id_usuario
            );

            if (!lista) {
                await connection.rollback();

                responder(res, 404, {
                    status: 'ERROR',
                    message: 'Lista no encontrada o sin acceso'
                });
                return;
            }

            // Eliminar primero los productos asociados.
            await connection.execute(
                `DELETE FROM DetalleListaCompra
                 WHERE id_lista = ?`,
                [idLista]
            );

            // Eliminar la cabecera de la lista.
            await connection.execute(
                `DELETE FROM ListaCompra
                 WHERE id_lista = ?`,
                [idLista]
            );

            await connection.commit();

            responder(res, 200, {
                status: 'OK',
                mensaje: 'Lista eliminada correctamente'
            });

        } catch (error) {
            if (connection) {
                await connection.rollback().catch(() => {});
            }

            console.error(
                'Eliminar lista:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo eliminar la lista'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }
    
    
    
    // --------------------------------------------------------
    // REGISTRAR COMPRA DESDE LISTA DE COMPRAS
    // POST /api/listas-compra/detalles/:id/comprar
    // --------------------------------------------------------

    if (
        /\/api\/listas-compra\/detalles\/\d+\/comprar$/.test(ruta) &&
        req.method === 'POST'
    ) {
        const usuario = autenticarToken(req, res);
        if (!usuario) return;

        let connection;

        try {
            const idDetalle = Number(ruta.split('/').slice(-2)[0]);

            if (!Number.isSafeInteger(idDetalle) || idDetalle <= 0) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'Identificador del producto no válido'
                });
                return;
            }

            connection = await conectarMySQL();
            await connection.beginTransaction();

            // 1. Buscar el detalle y bloquearlo para evitar compras duplicadas.
            const [detalles] = await connection.execute(
                `SELECT
                    d.id_detalle,
                    d.id_lista,
                    d.id_producto,
                    d.cantidad,
                    d.comprado,
                    l.id_hogar,
                    l.estado
                 FROM DetalleListaCompra d
                 INNER JOIN ListaCompra l
                    ON l.id_lista = d.id_lista
                 INNER JOIN Miembro_Hogar mh
                    ON mh.id_hogar = l.id_hogar
                 WHERE d.id_detalle = ?
                   AND mh.id_usuario = ?
                 LIMIT 1
                 FOR UPDATE`,
                [idDetalle, usuario.id_usuario]
            );

            if (!detalles.length) {
                await connection.rollback();

                responder(res, 404, {
                    status: 'ERROR',
                    message: 'Producto no encontrado o sin acceso'
                });
                return;
            }

            const detalle = detalles[0];

            if (detalle.estado !== 'PENDIENTE') {
                await connection.rollback();

                responder(res, 409, {
                    status: 'ERROR',
                    message: 'La lista no está pendiente'
                });
                return;
            }

            if (Number(detalle.comprado) === 1) {
                await connection.rollback();

                responder(res, 409, {
                    status: 'ERROR',
                    message: 'Este producto ya fue marcado como comprado'
                });
                return;
            }

            const cantidad = Number(detalle.cantidad);

            if (!Number.isFinite(cantidad) || cantidad <= 0) {
                await connection.rollback();

                responder(res, 400, {
                    status: 'ERROR',
                    message: 'La cantidad de compra no es válida'
                });
                return;
            }

            // 2. Buscar el producto en el inventario del hogar.
            const [inventarios] = await connection.execute(
                `SELECT id_inventario
                 FROM Inventario
                 WHERE id_hogar = ?
                   AND id_producto = ?
                 LIMIT 1
                 FOR UPDATE`,
                [detalle.id_hogar, detalle.id_producto]
            );

            if (inventarios.length > 0) {

                // 3. Actualizar el inventario existente.
                await connection.execute(
                    `UPDATE Inventario
                     SET cantidad_actual = cantidad_actual + ?
                     WHERE id_inventario = ?`,
                    [cantidad, inventarios[0].id_inventario]
                );

            } else {

                // 4. Incorporar el producto si aún no existe en el inventario.
                await connection.execute(
                    `INSERT INTO Inventario
                        (id_hogar, id_producto, cantidad_actual, cantidad_minima)
                     VALUES (?, ?, ?, 0)`,
                    [
                        detalle.id_hogar,
                        detalle.id_producto,
                        cantidad
                    ]
                );
            }

            // 5. Registrar el movimiento de compra.
            await connection.execute(
                `INSERT INTO MovimientoInventario
                    (id_hogar, id_usuario, id_producto,
                     tipo_movimiento, cantidad)
                 VALUES (?, ?, ?, 'COMPRA', ?)`,
                [
                    detalle.id_hogar,
                    usuario.id_usuario,
                    detalle.id_producto,
                    cantidad
                ]
            );

            // 6. Marcar el producto como comprado.
            await connection.execute(
                `UPDATE DetalleListaCompra
                 SET comprado = 1,
                     id_usuario_compra = ?
                 WHERE id_detalle = ?
                   AND comprado = 0`,
                [usuario.id_usuario, idDetalle]
            );

            // 7. Confirmar todas las operaciones.
            await connection.commit();

            responder(res, 200, {
                status: 'OK',
                mensaje: 'Compra registrada e inventario actualizado'
            });

        } catch (error) {

            if (connection) {
                await connection.rollback().catch(() => {});
            }

            console.error(
                'Registrar compra:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo registrar la compra'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }

    
    
    // --------------------------------------------------------
    // CONSULTAR HISTORIAL DE COMPRAS DEL HOGAR
    // GET /api/movimientos?id_hogar=1
    // --------------------------------------------------------

    if (
        /\/api\/movimientos$/.test(ruta) &&
        req.method === 'GET'
    ) {
        const usuario = autenticarToken(req, res);
        if (!usuario) return;

        let connection;

        try {
            const idHogar = Number(
                new URL(req.url, 'http://localhost').searchParams.get('id_hogar')
            );

            if (!Number.isSafeInteger(idHogar) || idHogar <= 0) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El identificador del hogar no es válido'
                });
                return;
            }

            connection = await conectarMySQL();

            const [miembro] = await connection.execute(
                `SELECT id_usuario
                 FROM Miembro_Hogar
                 WHERE id_hogar = ?
                   AND id_usuario = ?
                 LIMIT 1`,
                [idHogar, usuario.id_usuario]
            );

            if (!miembro.length) {
                responder(res, 403, {
                    status: 'ERROR',
                    message: 'No tienes acceso a este hogar'
                });
                return;
            }

            const [movimientos] = await connection.execute(
                `SELECT
                    m.id_movimiento,
                    m.id_hogar,
                    m.id_usuario,
                    u.nombre AS nombre_usuario,
                    m.id_producto,
                    p.nombre AS nombre_producto,
                    m.tipo_movimiento,
                    m.cantidad,
                    DATE_FORMAT(m.fecha, '%d/%m/%Y %H:%i') AS fecha
                 FROM MovimientoInventario m
                 INNER JOIN Usuario u
                    ON u.id_usuario = m.id_usuario
                 INNER JOIN Producto p
                    ON p.id_producto = m.id_producto
                 WHERE m.id_hogar = ?
                   AND m.tipo_movimiento = 'COMPRA'
                 ORDER BY m.fecha DESC, m.id_movimiento DESC
                 LIMIT 50`,
                [idHogar]
            );

            responder(res, 200, {
                status: 'OK',
                movimientos
            });

        } catch (error) {
            console.error(
                'Consultar movimientos:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo consultar el historial de compras'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }



    // --------------------------------------------------------
    // ELIMINAR MOVIMIENTO DEL HISTORIAL
    // DELETE /api/movimientos/:id
    // --------------------------------------------------------

    if (
        /\/api\/movimientos\/\d+$/.test(ruta) &&
        req.method === 'DELETE'
    ) {
        const contenido = autenticarToken(req, res);

        if (!contenido) {
            return;
        }

        let connection;

        try {
            const idMovimiento = Number(
                ruta.split('/').pop()
            );

            if (
                !Number.isSafeInteger(idMovimiento) ||
                idMovimiento <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'El identificador del movimiento no es válido'
                });
                return;
            }

            connection = await conectarMySQL();

            // Verificar que el movimiento pertenezca
            // a un hogar donde el usuario sea integrante.
            const [movimientos] = await connection.execute(
                `SELECT m.id_movimiento, m.id_hogar
                 FROM MovimientoInventario m
                 INNER JOIN Miembro_Hogar mh
                    ON mh.id_hogar = m.id_hogar
                 WHERE m.id_movimiento = ?
                   AND mh.id_usuario = ?
                 LIMIT 1`,
                [
                    idMovimiento,
                    contenido.id_usuario
                ]
            );

            if (movimientos.length === 0) {
                responder(res, 404, {
                    status: 'ERROR',
                    message: 'El movimiento no existe o no tienes acceso a él'
                });
                return;
            }

            // Eliminar exclusivamente el registro histórico.
            // No modificar la tabla Inventario.
            await connection.execute(
                `DELETE FROM MovimientoInventario
                 WHERE id_movimiento = ?`,
                [idMovimiento]
            );

            responder(res, 200, {
                status: 'OK',
                mensaje: 'Movimiento eliminado correctamente'
            });

        } catch (error) {
            console.error(
                'Error al eliminar movimiento:',
                error.code || 'ERROR'
            );

            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo eliminar el movimiento'
            });

        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }

        return;
    }

    
    // --------------------------------------------------------
    // CONSULTAR MOVIMIENTOS E INVENTARIO PARA ESTADÍSTICAS
    // GET /api/consumo?id_hogar=1
    // --------------------------------------------------------
    
    if (
        ruta.endsWith('/api/consumo') &&
        req.method === 'GET'
    ) {
        const contenido = autenticarToken(req, res);
    
        if (!contenido) {
            return;
        }
    
        let connection;
    
        try {
            // Obtener el identificador del hogar.
            const parametros = new URL(
                req.url,
                'http://localhost'
            ).searchParams;
    
            const idHogar = Number(
                parametros.get('id_hogar')
            );
    
            // Validar el identificador.
            if (
                !Number.isSafeInteger(idHogar) ||
                idHogar <= 0
            ) {
                responder(res, 400, {
                    status: 'ERROR',
                    message: 'id_hogar debe ser un número entero positivo'
                });
                return;
            }
    
            connection = await conectarMySQL();
    
            // Verificar que el usuario pertenezca al hogar.
            const [pertenencia] = await connection.execute(
                `SELECT id_usuario
                 FROM Miembro_Hogar
                 WHERE id_usuario = ?
                   AND id_hogar = ?
                 LIMIT 1`,
                [
                    contenido.id_usuario,
                    idHogar
                ]
            );
    
            if (pertenencia.length === 0) {
                responder(res, 403, {
                    status: 'ERROR',
                    message: 'No tienes acceso a la información de este hogar'
                });
                return;
            }
    
            // Consultar movimientos del hogar.
            const [movimientos] = await connection.execute(
                `SELECT
                    m.id_movimiento,
                    m.id_producto,
                    p.nombre,
                    p.categoria,
                    p.unidad_medida,
                    m.tipo_movimiento,
                    m.cantidad,
                    m.fecha,
                    m.id_usuario
                 FROM MovimientoInventario m
                 INNER JOIN Producto p
                    ON p.id_producto = m.id_producto
                 WHERE m.id_hogar = ?
                 ORDER BY m.fecha DESC`,
                [idHogar]
            );
    
            // Consultar estado actual del inventario.
            const [inventario] = await connection.execute(
                `SELECT
                    i.id_producto,
                    p.nombre,
                    p.categoria,
                    p.unidad_medida,
                    i.cantidad_actual,
                    i.cantidad_minima
                 FROM Inventario i
                 INNER JOIN Producto p
                    ON p.id_producto = i.id_producto
                 WHERE i.id_hogar = ?
                 ORDER BY p.nombre ASC`,
                [idHogar]
            );
    
            // Entregar información al frontend.
            responder(res, 200, {
                status: 'OK',
                movimientos: movimientos,
                inventario: inventario
            });
    
        } catch (error) {
            console.error(
                'Error al consultar consumo:',
                error.code || 'ERROR'
            );
    
            responder(res, 500, {
                status: 'ERROR',
                message: 'No se pudo consultar la información de consumo'
            });
    
        } finally {
            if (connection) {
                await connection.end().catch(() => {});
            }
        }
    
        return;
    }


    // --------------------------------------------------------
    // 6. RUTA NO RECONOCIDA
    // --------------------------------------------------------

    responder(res, 404, {
        status: 'ERROR',
        message: 'Ruta no encontrada'
    });
});


// ------------------------------------------------------------
// Inicio del servidor
// ------------------------------------------------------------

const port = process.env.PORT || 3000;

server.listen(port, '0.0.0.0', () => {
    console.log(`QueQueda API escuchando en el puerto ${port}`);
});
