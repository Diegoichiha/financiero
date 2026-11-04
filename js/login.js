// Pantallas de acceso: ingreso con usuario y contraseña, y cambio de contraseña.
import { h } from './util.js';
import { switchTema } from './tema.js';

export async function post(url, cuerpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'X-Requested-With': 'finanzas', 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}) });
  let j = {};
  try { j = await r.json(); } catch { /* respuesta sin cuerpo */ }
  return { ok: r.ok, status: r.status, ...j };
}

function marco(root, titulo, eyebrow, ...contenido) {
  root.replaceChildren(h('div', { class: 'auth' },
    h('div', { class: 'auth-top' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-word' }, 'Hogy Financiero'), h('i', { class: 'brand-dot' })),
      switchTema()),
    h('form', { class: 'auth-card', novalidate: true },
      h('div', { class: 'eyebrow' }, h('i', { class: 'eb-line' }), eyebrow),
      h('h1', {}, titulo),
      ...contenido)));
  return root.querySelector('form');
}

const campo = (etiqueta, control) => h('label', { class: 'f' }, etiqueta, control);

// Campo de contraseña con botón para verla.
function claveInput(attrs) {
  const inp = h('input', { type: 'password', ...attrs });
  const ver = h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Mostrar u ocultar la contraseña', onclick: () => {
    inp.type = inp.type === 'password' ? 'text' : 'password';
    ver.textContent = inp.type === 'password' ? 'Ver' : 'Ocultar';
  } }, 'Ver');
  return { inp, fila: h('div', { class: 'pass-row' }, inp, ver) };
}

export function pantallaLogin(root, alEntrar) {
  const usuario = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'Tu usuario' });
  const clave = claveInput({ autocomplete: 'current-password', placeholder: 'Tu contraseña' });
  const recordar = h('input', { type: 'checkbox' });
  const err = h('div', { class: 'auth-err', role: 'alert' });
  const boton = h('button', { type: 'submit', class: 'btn primary' }, 'Entrar');
  const form = marco(root, 'bienvenido', 'Acceso privado',
    h('div', { class: 'card-sub' }, 'Tus finanzas viven solo en este computador. Entra con tu usuario y tu contraseña.'),
    campo('Usuario', usuario), campo('Contraseña', clave.fila),
    h('label', { class: 'switch' }, recordar, 'Mantener la sesión abierta 30 días'),
    err, boton);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!usuario.value.trim() || !clave.inp.value) { err.textContent = 'Escribe tu usuario y tu contraseña.'; return; }
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    const r = await post('/api/login', { usuario: usuario.value, clave: clave.inp.value, recordar: recordar.checked });
    boton.disabled = false;
    boton.textContent = 'Entrar';
    if (!r.ok) { err.textContent = r.error || 'No se pudo entrar. ¿Está abierto el servidor?'; clave.inp.select(); return; }
    alEntrar(r.usuario);
  });
  usuario.focus();
}

// Cambio de contraseña. Es obligatorio en el primer ingreso (la temporal deja de servir); opcional desde "Tu cuenta".
export function pantallaClave(root, { obligatorio, nombre, alTerminar, alVolver }) {
  const actual = claveInput({ autocomplete: 'current-password', placeholder: obligatorio ? 'La contraseña temporal que te dieron' : 'Tu contraseña actual' });
  const nueva = claveInput({ autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres' });
  const repetir = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Escríbela otra vez' });
  const err = h('div', { class: 'auth-err', role: 'alert' });
  const boton = h('button', { type: 'submit', class: 'btn primary' }, 'Guardar contraseña');
  const form = marco(root, obligatorio ? 'crea tu contraseña' : 'cambiar contraseña', obligatorio ? `Primer ingreso${nombre ? ' · ' + nombre : ''}` : 'Tu cuenta',
    h('div', { class: 'card-sub' }, obligatorio
      ? 'La contraseña temporal solo sirve para esta vez. Elige una propia que solo tú conozcas.'
      : 'Después de cambiarla, las demás sesiones abiertas con la clave anterior se cierran.'),
    campo('Contraseña actual', actual.fila), campo('Contraseña nueva', nueva.fila), campo('Repite la nueva', repetir),
    err,
    h('div', { class: 'auth-actions' }, obligatorio ? null : h('button', { type: 'button', class: 'btn', onclick: alVolver }, 'Volver'), boton));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (nueva.inp.value.length < 8) { err.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
    if (nueva.inp.value !== repetir.value) { err.textContent = 'Las dos contraseñas nuevas no coinciden.'; return; }
    boton.disabled = true;
    const r = await post('/api/clave', { actual: actual.inp.value, nueva: nueva.inp.value });
    boton.disabled = false;
    if (!r.ok) { err.textContent = r.error || 'No se pudo cambiar la contraseña.'; return; }
    alTerminar();
  });
  actual.inp.focus();
}
