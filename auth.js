// Usuarios y sesiones del servidor local de Finanzas.
// - Las contraseñas NUNCA se guardan: solo su huella (scrypt con sal propia) en data/usuarios.json.
// - La sesión es una cookie firmada (HMAC) con la clave secreta de data/secreto.key; se invalida sola si cambia la contraseña.
// - Tras varios intentos fallidos seguidos, el acceso se bloquea unos minutos.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin 0/O, 1/l/I para no confundirse al leerla
const COOKIE = 'finanzas_sid';
const SESION_CORTA = 12 * 60 * 60; // segundos
const SESION_LARGA = 30 * 24 * 60 * 60;
const MAX_FALLOS = 5;
const BLOQUEO_MS = 10 * 60 * 1000;

const huella = (clave, salt) => crypto.scryptSync(String(clave), salt, 64).toString('hex');
const iguales = (a, b) => {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
const normal = (u) => String(u || '').trim().toLowerCase();

function claveTemporal() {
  const grupo = () => Array.from({ length: 4 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
  return `${grupo()}-${grupo()}-${grupo()}`;
}

function crearAuth(dataDir) {
  const USUARIOS = path.join(dataDir, 'usuarios.json');
  const SECRETO = path.join(dataDir, 'secreto.key');
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(SECRETO)) fs.writeFileSync(SECRETO, crypto.randomBytes(32).toString('hex'), 'utf8');
  const secreto = fs.readFileSync(SECRETO, 'utf8').trim();

  const leer = () => (fs.existsSync(USUARIOS) ? JSON.parse(fs.readFileSync(USUARIOS, 'utf8')) : { usuarios: [] });
  const guardar = (db) => {
    const tmp = USUARIOS + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, USUARIOS);
  };
  const publico = (u) => ({ usuario: u.usuario, nombre: u.nombre, debeCambiar: !!u.debeCambiar });

  // ---- administración (la usa usuarios.js)
  function agregar({ usuario, nombre, clave, debeCambiar = true }) {
    const db = leer();
    const id = normal(usuario);
    if (!/^[a-z0-9._-]{3,30}$/.test(id)) throw new Error('El usuario debe tener 3 a 30 letras minúsculas, números, punto, guion o guion bajo.');
    if (db.usuarios.some((u) => u.usuario === id)) throw new Error('Ya existe el usuario ' + id);
    const salt = crypto.randomBytes(16).toString('hex');
    db.usuarios.push({ usuario: id, nombre: String(nombre || id).trim(), salt, hash: huella(clave, salt), debeCambiar, creado: new Date().toISOString() });
    guardar(db);
    return id;
  }
  function ponerClave(usuario, clave, debeCambiar) {
    const db = leer();
    const u = db.usuarios.find((x) => x.usuario === normal(usuario));
    if (!u) throw new Error('No existe el usuario ' + usuario);
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = huella(clave, u.salt);
    u.debeCambiar = !!debeCambiar;
    guardar(db);
  }
  function quitar(usuario) {
    const db = leer();
    const n = db.usuarios.length;
    db.usuarios = db.usuarios.filter((x) => x.usuario !== normal(usuario));
    if (db.usuarios.length === n) throw new Error('No existe el usuario ' + usuario);
    guardar(db);
  }
  const listar = () => leer().usuarios.map((u) => ({ ...publico(u), creado: u.creado }));

  // ---- inicio de sesión
  const FALSA_SAL = crypto.randomBytes(16).toString('hex');
  const FALSA_HUELLA = huella('no-existe', FALSA_SAL);
  function verificar(usuario, clave) {
    const u = leer().usuarios.find((x) => x.usuario === normal(usuario));
    const ok = iguales(huella(clave, u ? u.salt : FALSA_SAL), u ? u.hash : FALSA_HUELLA); // el mismo trabajo exista o no el usuario
    return u && ok ? u : null;
  }

  const fallos = new Map(); // "ip|usuario" -> [marcas de tiempo]
  function minutosBloqueado(llave) {
    const lista = (fallos.get(llave) || []).filter((t) => Date.now() - t < BLOQUEO_MS);
    fallos.set(llave, lista);
    if (lista.length < MAX_FALLOS) return 0;
    return Math.max(1, Math.ceil((BLOQUEO_MS - (Date.now() - lista[0])) / 60000));
  }
  const falló = (llave) => fallos.set(llave, [...(fallos.get(llave) || []), Date.now()]);
  const limpiar = (llave) => fallos.delete(llave);

  // ---- sesión por cookie firmada
  const b64 = (t) => Buffer.from(t).toString('base64url');
  const firma = (p) => crypto.createHmac('sha256', secreto).update(p).digest('base64url');
  function emitir(u, recordar) {
    const maxAge = recordar ? SESION_LARGA : SESION_CORTA;
    const carga = b64(JSON.stringify({ u: u.usuario, e: Math.floor(Date.now() / 1000) + maxAge, v: u.hash.slice(0, 12) }));
    return { cookie: `${COOKIE}=${carga}.${firma(carga)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`, maxAge };
  }
  const cookieSalida = () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
  function usuarioDe(cabeceraCookie) {
    const m = String(cabeceraCookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
    if (!m) return null;
    const [carga, f] = m.slice(COOKIE.length + 1).split('.');
    if (!carga || !f) return null;
    const esperada = firma(carga);
    if (f.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperada))) return null;
    let datos;
    try { datos = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')); } catch { return null; }
    if (!datos || datos.e < Date.now() / 1000) return null;
    const u = leer().usuarios.find((x) => x.usuario === datos.u);
    return u && u.hash.slice(0, 12) === datos.v ? u : null; // si cambió la contraseña, las sesiones viejas dejan de servir
  }

  return { agregar, ponerClave, quitar, listar, verificar, minutosBloqueado, falló, limpiar, emitir, cookieSalida, usuarioDe, publico };
}

module.exports = { crearAuth, claveTemporal };
