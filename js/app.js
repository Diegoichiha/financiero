// Arranque: comprueba la sesión (usuario y contraseña), carga los datos, arma la estructura (pestañas + filtros) y pinta la pantalla activa.
import { h, todayISO, monthName, rangeLabel, isoWeek, money } from './util.js';
import {
  state, load, hooks, flush, curPeriod, rangeOf, shiftPeriod, hayDemo, quitarDemo, save, sincronizarAutomaticos,
} from './store.js';
import { disposeCharts } from './charts.js';
import { hideTip, toast } from './ui.js';
import { renderResumen } from './view-resumen.js';
import { renderRecurrentes, renderMovimientos, renderIngresos } from './view-lists.js';
import { renderCuentas, renderAjustes } from './view-config.js';
import { renderCreditos } from './view-creditos.js';
import { renderCompromisos } from './view-compromisos.js';
import { renderPlan } from './view-plan.js';
import { icon } from './icons.js';
import { renderGuia } from './view-guia.js';
import { pantallaLogin, pantallaClave, post } from './login.js';
import { switchTema, esOscuro } from './tema.js';
import { botonMarca } from './marca.js';

const TABS = [
  { id: 'resumen', n: 'Resumen', ico: 'resumen', eyebrow: 'Panorama', filtros: true, render: renderResumen },
  { id: 'plan', n: 'Plan del mes', ico: 'plan', eyebrow: 'Cuánto puedo gastar', render: renderPlan },
  { id: 'recurrentes', n: 'Recurrentes', ico: 'recurrentes', eyebrow: 'Cada mes', filtros: true, soloMes: true, render: renderRecurrentes },
  { id: 'creditos', n: 'Créditos', ico: 'creditos', eyebrow: 'Deudas', render: renderCreditos },
  { id: 'movimientos', n: 'Gastos', ico: 'movimientos', eyebrow: 'Día a día', filtros: true, render: renderMovimientos },
  { id: 'ingresos', n: 'Ingresos', ico: 'ingresos', eyebrow: 'Lo que entra', filtros: true, soloMes: true, render: renderIngresos },
  { id: 'compromisos', n: 'Compromisos', ico: 'compromisos', eyebrow: 'Eventos', render: renderCompromisos },
  { id: 'cuentas', n: 'Cuentas para pagar', ico: 'cuentas', eyebrow: 'Datos de pago', render: renderCuentas },
  { id: 'ajustes', n: 'Ajustes', ico: 'ajustes', eyebrow: 'Configuración', render: renderAjustes },
  { id: 'guia', n: 'Guía de uso', ico: 'guia', eyebrow: 'Cómo se usa', render: renderGuia },
];

const app = document.getElementById('app');
const refs = {};

// ---------- Preferencias de interfaz ----------
const PREF = 'finanzas-ui';
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || '{}');
    if (TABS.some((t) => t.id === p.tab)) state.tab = p.tab;
    if (localStorage.getItem('finanzas-ir-guia')) { state.tab = 'guia'; localStorage.removeItem('finanzas-ir-guia'); }
    if (p.mode === 'mes' || p.mode === 'semana') state.period.mode = p.mode;
    if (typeof p.centro === 'string') state.centro = p.centro; // se valida al cargar los datos
  } catch { /* sin preferencias */ }
}
function savePrefs() {
  localStorage.setItem(PREF, JSON.stringify({ tab: state.tab, mode: state.period.mode, centro: state.centro }));
}

// ---------- Estructura ----------
function build() {
  refs.save = h('span', { class: 'savestate', role: 'status' }, h('i'), h('span', {}, 'Guardado'));
  refs.theme = switchTema(() => render());
  refs.banner = h('div', {});
  refs.tabs = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Secciones' });
  refs.head = h('header', { class: 'page-head' });
  refs.filters = h('div', { class: 'filters' });
  refs.main = h('main', { id: 'main' });
  // Botón para cerrar el panel (queda solo con los iconos) y volver a abrirlo; se recuerda la elección.
  refs.menuBtn = h('button', { type: 'button', class: 'menu-toggle', onclick: () => cambiarPanel() }, icon('panel', 18));
  refs.shell = h('div', { class: 'app' },
    h('aside', { class: 'side' },
      h('div', { class: 'side-top' },
        botonMarca(() => { state.tab = 'resumen'; render(); window.scrollTo(0, 0); }, 'Ir al inicio'),
        refs.menuBtn),
      refs.tabs),
    h('div', { class: 'content' }, refs.banner, refs.head, refs.filters, refs.main));
  app.replaceChildren(refs.shell);
  aplicarPanel();
}

const PANEL = 'finanzas-panel';
let panelCerrado = localStorage.getItem(PANEL) === 'cerrado';
function aplicarPanel() {
  refs.shell.classList.toggle('colapsado', panelCerrado);
  refs.menuBtn.setAttribute('aria-expanded', String(!panelCerrado));
  const txt = panelCerrado ? 'Abrir el panel' : 'Cerrar el panel (dejar solo los iconos)';
  refs.menuBtn.title = txt;
  refs.menuBtn.setAttribute('aria-label', txt);
}
function cambiarPanel() {
  panelCerrado = !panelCerrado;
  localStorage.setItem(PANEL, panelCerrado ? 'cerrado' : 'abierto');
  aplicarPanel();
}

hooks.saveStatus = (st) => {
  if (!refs.save) return;
  refs.save.className = 'savestate ' + (st === 'ok' ? '' : st);
  refs.save.lastChild.textContent = st === 'ok' ? 'Guardado' : st === 'pending' ? 'Guardando…' : st === 'sesion' ? 'Tu sesión venció: recarga la página y vuelve a entrar' : 'Error al guardar: ¿sigue abierto el servidor?';
};
hooks.rerender = () => render();
hooks.goTab = (id) => { state.tab = id; render(); };

// ---------- Pintado ----------
function renderTabs() {
  refs.tabs.replaceChildren(...TABS.map((t) => h('button', {
    class: 'tab', role: 'tab', 'aria-selected': String(t.id === state.tab), title: t.n, 'aria-label': t.n,
    onclick: () => { if (state.tab !== t.id) { state.tab = t.id; render(); } },
  }, icon(t.ico, 20), h('span', { class: 'tab-n' }, t.n))));
}

// Encabezado de cada pantalla: rótulo pequeño, título grande y los controles de siempre (guardado y tema).
function renderHead() {
  const tab = TABS.find((t) => t.id === state.tab);
  refs.theme.setAttribute('aria-checked', String(esOscuro()));
  refs.head.replaceChildren(
    h('div', { class: 'page-title' },
      h('div', { class: 'eyebrow' }, h('i', { class: 'eb-line' }), `${tab.eyebrow} · ${monthName(todayISO())}`),
      h('h1', {}, tab.n)),
    h('div', { class: 'head-right' }, refs.save, refs.theme, botonCuenta()));
}

// ---------- Cuenta: quién entró, cambiar contraseña y salir ----------
function botonCuenta() {
  const u = state.usuario;
  if (!u) return null;
  return h('button', { class: 'user-chip', title: 'Tu cuenta', 'aria-label': 'Tu cuenta: ' + u.nombre, onclick: abrirCuenta },
    h('span', { class: 'avatar' }, u.nombre.trim().charAt(0).toUpperCase()), h('span', { class: 'user-name' }, u.nombre.split(' ')[0]));
}

function abrirCuenta() {
  const u = state.usuario;
  const dlg = h('dialog', {});
  const cerrar = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    h('div', { class: 'dlg-head' }, 'Tu cuenta'),
    h('div', { class: 'cuenta-info' },
      h('span', { class: 'avatar grande' }, u.nombre.trim().charAt(0).toUpperCase()),
      h('div', {}, h('div', { class: 'name' }, u.nombre), h('div', { class: 'card-sub' }, 'Usuario: ' + u.usuario))),
    h('div', { class: 'dlg-foot' },
      h('button', { class: 'btn', onclick: () => { cerrar(); flush().then(() => pantallaClave(app, { obligatorio: false, alTerminar: () => location.reload(), alVolver: () => location.reload() })); } }, 'Cambiar contraseña'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: cerrar }, 'Cerrar'),
      h('button', { class: 'btn primary', onclick: async () => { await flush(); await post('api/logout'); location.reload(); } }, 'Salir')));
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function renderFilters() {
  const tab = TABS.find((t) => t.id === state.tab);
  refs.filters.classList.toggle('hidden', !tab.filtros);
  if (!tab.filtros) return;
  const p = curPeriod();
  const r = rangeOf(p);
  const label = p.mode === 'mes' ? monthName(r.from) : `Semana ${isoWeek(r.from)} · ${rangeLabel(r.from, r.to)}`;
  const paso = p.mode === 'mes' ? 'mes' : 'semana';
  const nav = h('div', { class: 'nav' },
    h('button', { class: 'btn icon', 'aria-label': `${paso} anterior`, onclick: () => { shiftPeriod(-1); render(); } }, '‹'),
    h('span', { class: 'label', 'aria-live': 'polite' }, label),
    h('button', { class: 'btn icon', 'aria-label': `${paso} siguiente`, onclick: () => { shiftPeriod(1); render(); } }, '›'),
    h('button', { class: 'btn', onclick: () => { state.period.anchor = todayISO(); render(); } }, 'Hoy'));

  const modo = tab.soloMes ? null : h('div', { class: 'seg', role: 'group', 'aria-label': 'Escala del periodo' },
    h('button', { 'aria-pressed': String(state.period.mode === 'mes'), onclick: () => { state.period.mode = 'mes'; render(); } }, 'Mes'),
    h('button', { 'aria-pressed': String(state.period.mode === 'semana'), onclick: () => { state.period.mode = 'semana'; render(); } }, 'Semana'));

  const centro = h('label', { class: 'switch' }, 'Centro:',
    (() => {
      const sel = h('select', { 'aria-label': 'Centro de costo' }, ...[{ id: 'todos', nombre: 'Todos' }, ...state.data.centros].map((c) => {
        const o = h('option', { value: c.id }, c.nombre);
        o.selected = c.id === state.centro;
        return o;
      }));
      sel.addEventListener('change', () => { state.centro = sel.value; render(); });
      return sel;
    })());

  const carro = h('label', { class: 'switch', title: 'Incluye o excluye la cuota del carro de todos los totales' },
    (() => {
      const c = h('input', { type: 'checkbox', checked: state.data.config.incluirCuotaCarro });
      c.addEventListener('change', () => { state.data.config.incluirCuotaCarro = c.checked; save(); render(); });
      return c;
    })(), 'Incluir cuota del carro');

  refs.filters.replaceChildren(...[nav, modo, centro, carro].filter(Boolean));
}

function renderBanner() {
  refs.banner.replaceChildren();
  if (hayDemo()) {
    refs.banner.append(h('div', { class: 'banner' },
      h('span', {}, 'Estás viendo ', h('b', {}, 'datos de ejemplo'), '. No son tus gastos reales.'),
      h('button', { class: 'btn sm', onclick: () => { quitarDemo(); render(); } }, 'Quitar datos de ejemplo')));
  }
}

function render() {
  if (sincronizarAutomaticos()) save();
  if (state.avisoAuto) {
    const { n, por } = state.avisoAuto;
    state.avisoAuto = null;
    const partes = Object.entries(por).map(([id, v]) => `${money(v)} de ${state.data.cuentasDinero.find((x) => x.id === id)?.nombre || 'tu cuenta'}`);
    toast(`Se descontaron solos ${partes.join(' y ')} (${n} pago${n === 1 ? '' : 's'} que estaba${n === 1 ? '' : 'n'} sin cuenta)`);
  }
  disposeCharts();
  hideTip();
  savePrefs();
  renderBanner();
  renderTabs();
  renderHead();
  renderFilters();
  const tab = TABS.find((t) => t.id === state.tab);
  tab.render(refs.main);
}

// ---------- Inicio ----------
function errorServidor(e) {
  app.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('h1', {}, 'sin conexión'),
    h('div', {}, 'No se pudo conectar con el servidor local. Abre la app con iniciar.bat (o ejecuta "node server.js" en esta carpeta) y entra a http://localhost:5210.'),
    h('div', { class: 'muted' }, String((e && e.message) || e)))));
}

function entrar(usuario) {
  state.usuario = usuario;
  if (usuario.debeCambiar) {
    // Primer ingreso: antes de ver nada hay que crear la contraseña propia; luego se abre la guía de uso.
    return pantallaClave(app, { obligatorio: true, nombre: usuario.nombre, alTerminar: () => { localStorage.setItem('finanzas-ir-guia', '1'); location.reload(); } });
  }
  loadPrefs();
  build();
  load().then(() => {
    if (state.centro !== 'todos' && !state.data.centros.some((c) => c.id === state.centro)) state.centro = 'todos';
    render();
  }).catch((e) => {
    if (e && e.status === 401) return pantallaLogin(app, entrar);
    refs.main.replaceChildren(h('div', { class: 'banner error' },
      h('div', {}, h('b', {}, 'No se pudo cargar tus datos.'),
        h('div', {}, 'Revisa que el servidor siga abierto (iniciar.bat o "node server.js") y recarga la página.'),
        h('div', { class: 'muted' }, String(e.message || e)))));
  });
}

async function arrancar() {
  let r;
  try { r = await fetch('api/sesion', { headers: { 'X-Requested-With': 'finanzas' } }); } catch (e) { return errorServidor(e); }
  if (r.status === 401) return pantallaLogin(app, entrar);
  if (!r.ok) return errorServidor(new Error('El servidor respondió ' + r.status));
  entrar((await r.json()).usuario);
}

arrancar();
window.addEventListener('pagehide', () => flush());
