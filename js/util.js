// Utilidades: DOM, formato de dinero y fechas (todas las fechas son 'YYYY-MM-DD' en hora local).

// ---------- DOM ----------
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.append(k);
    else el.append(document.createTextNode(String(k)));
  }
}

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'selected', 'type', 'title', 'placeholder', 'id', 'name', 'min', 'max', 'step'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'fill' || k === 'stroke') el.style[k] = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Dinero ----------
const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const cf = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });
export const money = (n) => (n < 0 ? '-' : '') + '$' + nf.format(Math.abs(Math.round(n || 0)));
export const num = (n) => nf.format(Math.round(n || 0));
export const compact = (n) => cf.format(n);
export const moneyCompact = (n) => '$' + cf.format(n);
export const pct = (n) => Math.round(n * 100) + '%';

// ---------- Fechas ----------
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS_C = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => iso(new Date());
export const addDays = (str, n) => {
  const d = parse(str);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const monthStart = (str) => str.slice(0, 7) + '-01';
export const monthEnd = (str) => {
  const d = parse(str);
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
export const daysInMonth = (str) => parse(monthEnd(str)).getDate();
export const addMonths = (str, n) => {
  const d = parse(str);
  return iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
export const weekStart = (str) => {
  const d = parse(str);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
};
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export const dowIndex = (str) => (parse(str).getDay() + 6) % 7; // 0 = lunes
export const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function isoWeek(str) {
  const d = parse(str);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

export const monthName = (str) => cap(MESES[parse(str).getMonth()]) + ' ' + parse(str).getFullYear();
export const dayShort = (str) => `${parse(str).getDate()} ${MESES_C[parse(str).getMonth()]}`;

export function rangeLabel(from, to) {
  const a = parse(from), b = parse(to);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} – ${b.getDate()} ${MESES_C[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${a.getDate()} ${MESES_C[a.getMonth()]} – ${b.getDate()} ${MESES_C[b.getMonth()]} ${b.getFullYear()}`;
}

// ---------- Varios ----------
export function download(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
