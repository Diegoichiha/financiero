// Administración de usuarios de Hogy Financiero (se corre desde esta carpeta con Node):
//   node usuarios.js listar
//   node usuarios.js agregar <usuario> "<Nombre completo>"   crea el usuario con una contraseña temporal
//   node usuarios.js clave <usuario>                          genera otra contraseña temporal (si alguien la olvidó)
//   node usuarios.js quitar <usuario>
//   node usuarios.js servidor [--forzar]                      crea semilla-usuarios.json (huellas) para el hosting PHP y sus claves en data/CREDENCIALES-SERVIDOR.txt
//   node usuarios.js sembrar                                  crea a Diego y Andrea y deja las claves en data/CREDENCIALES.txt
// Las contraseñas temporales obligan a crear una propia en el primer ingreso. Nunca se guardan en claro.
const fs = require('fs');
const path = require('path');
const { crearAuth, claveTemporal } = require('./auth');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'finanzas.json');
const dataDir = path.dirname(DATA_FILE);
const auth = crearAuth(dataDir);
const [cmd, a, b] = process.argv.slice(2);

function ayuda() {
  console.log('Uso: node usuarios.js listar | agregar <usuario> "<Nombre>" | clave <usuario> | quitar <usuario> | sembrar');
  process.exit(1);
}

try {
  if (cmd === 'listar') {
    for (const u of auth.listar()) console.log(`${u.usuario}\t${u.nombre}\t${u.debeCambiar ? 'clave temporal (aún no la cambia)' : 'clave propia'}`);
  } else if (cmd === 'agregar' && a) {
    const clave = claveTemporal();
    const id = auth.agregar({ usuario: a, nombre: b || a, clave });
    console.log(`Usuario creado: ${id}\nContraseña temporal: ${clave}\n(Al entrar por primera vez la app le pedirá crear la suya.)`);
  } else if (cmd === 'clave' && a) {
    const clave = claveTemporal();
    auth.ponerClave(a, clave, true);
    console.log(`Nueva contraseña temporal para ${a}: ${clave}\n(Deberá cambiarla al entrar.)`);
  } else if (cmd === 'quitar' && a) {
    auth.quitar(a);
    console.log('Usuario eliminado: ' + a);
  } else if (cmd === 'sembrar') {
    const previstos = [{ usuario: 'diego', nombre: 'Diego Torres' }, { usuario: 'andrea', nombre: 'Andrea Cuellar' }];
    const existentes = new Set(auth.listar().map((u) => u.usuario));
    const nuevos = previstos.filter((p) => !existentes.has(p.usuario)).map((p) => ({ ...p, clave: claveTemporal() }));
    for (const n of nuevos) auth.agregar(n);
    if (!nuevos.length) {
      console.log('Diego y Andrea ya existen; no se cambió nada. (Para darles otra clave: node usuarios.js clave <usuario>)');
    } else {
      const lineas = [
        'HOGY FINANCIERO · credenciales de ingreso (temporales)',
        '',
        'Dirección: http://localhost:5210   (en el computador donde corre la app)',
        '',
        ...nuevos.flatMap((n) => [`${n.nombre}`, `   Usuario:    ${n.usuario}`, `   Contraseña: ${n.clave}`, '']),
        'Al entrar por primera vez, la app pide crear una contraseña propia y la temporal deja de servir.',
        'Cuando las dos personas ya hayan cambiado su contraseña, borra este archivo.',
        'Si alguien olvida su contraseña: node usuarios.js clave <usuario>  (genera una temporal nueva).',
        '',
      ];
      fs.writeFileSync(path.join(dataDir, 'CREDENCIALES.txt'), lineas.join('\r\n'), 'utf8');
      console.log('Usuarios creados: ' + nuevos.map((n) => n.usuario).join(', ') + '. Las claves quedaron en data/CREDENCIALES.txt');
    }
  } else if (cmd === 'servidor') {
    // Usuarios iniciales del hosting compartido (PHP). semilla-usuarios.json solo lleva huellas (se sube a git); las claves temporales quedan en data/.
    const crypto = require('crypto');
    const semilla = path.join(__dirname, 'semilla-usuarios.json');
    if (fs.existsSync(semilla) && a !== '--forzar') { console.error('Ya existe semilla-usuarios.json. Con --forzar se crean claves nuevas (las anteriores dejan de servir en un servidor nuevo).'); process.exit(1); }
    const previstos = [{ usuario: 'diego', nombre: 'Diego Torres' }, { usuario: 'andrea', nombre: 'Andrea Cuellar' }];
    const listos = previstos.map((p) => {
      const clave = claveTemporal();
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(clave, salt, 210000, 64, 'sha256').toString('hex');
      return { ...p, clave, reg: { usuario: p.usuario, nombre: p.nombre, alg: 'pbkdf2', salt, hash, debeCambiar: true, creado: new Date().toISOString() } };
    });
    fs.writeFileSync(semilla, JSON.stringify({ usuarios: listos.map((x) => x.reg) }, null, 2) + '\n', 'utf8');
    const lineas = [
      'HOGY FINANCIERO · credenciales del SERVIDOR en la web (temporales)',
      '',
      'Dirección: https://financiero.diegotdesigner.com',
      '',
      ...listos.flatMap((n) => [n.nombre, '   Usuario:    ' + n.usuario, '   Contraseña: ' + n.clave, '']),
      'Al entrar por primera vez, la app pide crear una contraseña propia y la temporal deja de servir.',
      'Estas claves son distintas de las del computador (data/CREDENCIALES.txt): son dos instalaciones separadas.',
      'Cuando las dos personas ya hayan cambiado su contraseña, borra este archivo.',
      '',
    ];
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'CREDENCIALES-SERVIDOR.txt'), lineas.join('\r\n'), 'utf8');
    console.log('Listo: semilla-usuarios.json (se sube a git, solo huellas) y data/CREDENCIALES-SERVIDOR.txt (claves, NO se sube).');
  } else {
    ayuda();
  }
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}
