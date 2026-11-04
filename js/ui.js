// Piezas de interfaz reutilizables: modal, aviso, campos, tooltip.
import { h, num } from './util.js';

// ---------- Aviso ----------
let toastEl, toastTimer;
export function toast(msg) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status' });
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1800);
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado: ' + texto);
  } catch {
    toast('No se pudo copiar');
  }
}

// ---------- Modal ----------
export function modal(titulo, cuerpo, { guardar = 'Guardar', onSave, peligro } = {}) {
  const dlg = h('dialog', {});
  const err = h('div', { class: 'full', style: { color: 'var(--crit-ink)', fontSize: '12px' } });
  const close = () => { dlg.close(); dlg.remove(); };
  const form = h('form', { method: 'dialog', onsubmit: (e) => {
    e.preventDefault();
    const res = onSave ? onSave() : true;
    if (res === false) return;
    if (typeof res === 'string') { err.textContent = res; return; }
    close();
  } },
  h('div', { class: 'dlg-head' }, titulo),
  h('div', { class: 'dlg-body' }, cuerpo, err),
  h('div', { class: 'dlg-foot' },
    peligro ? h('button', { type: 'button', class: 'btn danger', onclick: () => { peligro.fn(); close(); } }, peligro.label) : null,
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancelar'),
    h('button', { type: 'submit', class: 'btn primary' }, guardar)));
  dlg.append(form);
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('input, select')?.focus();
  return dlg;
}

export function confirmar(texto, aceptar = 'Eliminar') {
  return new Promise((res) => {
    const dlg = h('dialog', {});
    const fin = (v) => { dlg.close(); dlg.remove(); res(v); };
    dlg.append(
      h('div', { class: 'dlg-head' }, 'Confirmar'),
      h('div', { style: { padding: '16px 18px' } }, texto),
      h('div', { class: 'dlg-foot' },
        h('button', { class: 'btn', onclick: () => fin(false) }, 'Cancelar'),
        h('button', { class: 'btn primary', onclick: () => fin(true) }, aceptar)));
    dlg.addEventListener('cancel', () => { dlg.remove(); res(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

// ---------- Campos ----------
export const field = (label, control, extra) => h('label', { class: 'f' + (extra ? ' ' + extra : '') }, label, control);

// Campo de dinero: muestra separadores de miles y devuelve un entero.
export function moneyInput(valor, attrs = {}) {
  const inp = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '0', ...attrs });
  inp.value = valor ? num(valor) : '';
  inp.addEventListener('input', () => {
    const digits = inp.value.replace(/\D/g, '');
    inp.value = digits ? num(Number(digits)) : '';
  });
  inp.getValue = () => Number(inp.value.replace(/\D/g, '')) || 0;
  return inp;
}

export function select(opciones, valor, attrs = {}) {
  const sel = h('select', attrs);
  for (const o of opciones) {
    const op = h('option', { value: o.value }, o.label);
    if (o.value === valor) op.selected = true;
    sel.append(op);
  }
  return sel;
}

// ---------- Tooltip ----------
let tipEl;
function ensureTip() {
  if (!tipEl) {
    tipEl = h('div', { class: 'tip', role: 'tooltip' });
    document.body.append(tipEl);
  }
  return tipEl;
}

// contenido: { titulo, filas: [{color, valor, etiqueta}], pie }
export function showTip(x, y, c) {
  const el = ensureTip();
  el.replaceChildren(
    c.titulo ? h('div', { class: 't' }, c.titulo) : null,
    ...(c.filas || []).map((f) => h('div', { class: 'r' },
      f.color ? h('span', { class: 'k', style: { background: f.color } }) : null,
      h('span', { class: 'v' }, f.valor),
      h('span', { class: 'l' }, f.etiqueta))),
    c.pie ? h('div', { class: 'foot' }, c.pie) : null);
  el.classList.add('on');
  const r = el.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = Math.max(8, top) + 'px';
}
export function hideTip() { tipEl?.classList.remove('on'); }

// Conecta un elemento a un tooltip (ratón y teclado).
export function tipOn(el, getContent) {
  el.addEventListener('pointermove', (e) => showTip(e.clientX, e.clientY, getContent()));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focus', () => {
    const r = el.getBoundingClientRect();
    showTip(r.left + r.width / 2, r.top + r.height / 2, getContent());
  });
  el.addEventListener('blur', hideTip);
}
