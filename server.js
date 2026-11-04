// Servidor local de Finanzas: sirve la app, controla el ingreso (usuario y contraseña) y guarda los datos en data/finanzas.json
// Uso:  node server.js   (puerto 5210; PORT y DATA_FILE se pueden cambiar por variables de entorno)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { crearAuth } = require('./auth');

const PORT = Number(process.env.PORT || 5210);
const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'finanzas.json');
const BACKUP_DIR = path.join(path.dirname(DATA_FILE), 'backups');
const auth = crearAuth(path.dirname(DATA_FILE));
const SEED_FILE = path.join(ROOT, 'seed.json');
const MAX_BODY = 8 * 1024 * 1024;
const BACKUP_EVERY_MS = 30 * 60 * 1000;
const BACKUP_KEEP = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.copyFileSync(SEED_FILE, DATA_FILE);
  }
  return fs.readFileSync(DATA_FILE, 'utf8');
}

function backupIfNeeded() {
  if (!fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
  const last = files[files.length - 1];
  if (last) {
    const age = Date.now() - fs.statSync(path.join(BACKUP_DIR, last)).mtimeMs;
    if (age < BACKUP_EVERY_MS) return;
  }
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `finanzas-${stamp()}.json`));
  const all = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) {
    fs.unlinkSync(path.join(BACKUP_DIR, old));
  }
}

function writeData(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.movimientos)) {
    throw new Error('Estructura de datos inválida');
  }
  backupIfNeeded();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

const hostOk = (host) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host || '');

function send(res, code, body, headers = {}) {
  res.writeHead(code, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
    ...headers,
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel);
  const allowed = rel === '/index.html' || rel.startsWith('/css/') || rel.startsWith('/js/') || rel.startsWith('/fonts/');
  const file = path.normalize(path.join(ROOT, rel));
  if (!allowed || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
}

const json = (res, code, obj, headers = {}) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

function leerCuerpo(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  const ruta = url.pathname;
  const ip = req.socket.remoteAddress || '';

  // ---- Ingreso y salida (no piden sesión)
  if (ruta === '/api/login' && req.method === 'POST') {
    const { usuario, clave, recordar } = JSON.parse((await leerCuerpo(req, 4096)) || '{}');
    const llave = ip + '|' + String(usuario || '').trim().toLowerCase();
    const espera = auth.minutosBloqueado(llave);
    if (espera) return json(res, 429, { error: `Demasiados intentos. Espera ${espera} minuto${espera === 1 ? '' : 's'} e inténtalo de nuevo.` });
    const u = auth.verificar(usuario, clave);
    if (!u) { auth.falló(llave); return json(res, 401, { error: 'Usuario o contraseña incorrectos.' }); }
    auth.limpiar(llave);
    return json(res, 200, { ok: true, usuario: auth.publico(u) }, { 'Set-Cookie': auth.emitir(u, !!recordar).cookie });
  }
  if (ruta === '/api/logout' && req.method === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieSalida() });

  // ---- Todo lo demás exige sesión
  const u = auth.usuarioDe(req.headers.cookie);
  if (ruta === '/api/sesion' && req.method === 'GET') return u ? json(res, 200, { usuario: auth.publico(u) }) : json(res, 401, { error: 'Sin sesión' });
  if (!u) return json(res, 401, { error: 'Inicia sesión para continuar.' });

  if (ruta === '/api/clave' && req.method === 'POST') {
    const { actual, nueva } = JSON.parse((await leerCuerpo(req, 4096)) || '{}');
    if (!auth.verificar(u.usuario, actual)) return json(res, 400, { error: 'La contraseña actual no es correcta.' });
    if (typeof nueva !== 'string' || nueva.length < 8 || nueva.length > 128) return json(res, 400, { error: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' });
    if (nueva === actual) return json(res, 400, { error: 'La nueva contraseña debe ser distinta de la actual.' });
    auth.ponerClave(u.usuario, nueva, false);
    return json(res, 200, { ok: true }, { 'Set-Cookie': auth.emitir(auth.verificar(u.usuario, nueva), false).cookie });
  }

  if (ruta === '/api/data') {
    if (u.debeCambiar) return json(res, 403, { error: 'Primero cambia tu contraseña.' });
    if (req.method === 'GET') {
      try {
        return send(res, 200, readData(), { 'Content-Type': 'application/json; charset=utf-8' });
      } catch (e) {
        return json(res, 500, { error: String(e.message) });
      }
    }
    if (req.method === 'PUT') {
      try {
        writeData(await leerCuerpo(req, MAX_BODY));
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 400, { error: String(e.message) });
      }
    }
    return send(res, 405, 'Método no permitido');
  }
  return json(res, 404, { error: 'No encontrado' });
}

const server = http.createServer(async (req, res) => {
  if (!hostOk(req.headers.host)) return send(res, 403, 'Host no permitido');
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    // Defensa contra páginas externas: exige cabecera propia y mismo origen.
    if (req.headers['x-requested-with'] !== 'finanzas') return send(res, 403, 'Falta cabecera');
    const origin = req.headers.origin;
    if (origin && !hostOk(origin.replace(/^https?:\/\//, ''))) return send(res, 403, 'Origen no permitido');
    try { return await api(req, res, url); } catch (e) { return json(res, 400, { error: String(e.message) }); }
  }

  if (req.method !== 'GET') return send(res, 405, 'Método no permitido');
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Finanzas listo en http://localhost:${PORT}`);
  console.log(`Datos: ${DATA_FILE}`);
});
