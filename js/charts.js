// Gráficas en SVG/HTML sin dependencias. Reglas: marcas finas, 2px de separación, grilla recesiva,
// leyenda cuando hay 2+ series, tooltip al pasar/enfocar y gemelo en tabla.
import { h, s, money, moneyCompact, pct, parse, dayShort } from './util.js';
import { tipOn, hideTip, showTip } from './ui.js';

// ---------- Responsividad ----------
const observers = new Set();
export function disposeCharts() {
  for (const o of observers) o.disconnect();
  observers.clear();
  hideTip();
}

function responsive(host, draw) {
  let last = -1;
  const run = () => {
    if (host.dataset.view === 'table') return;
    const w = Math.floor(host.clientWidth);
    if (w < 40 || w === last) return;
    last = w;
    draw(w);
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(run));
  ro.observe(host);
  observers.add(ro);
  requestAnimationFrame(run);
}

// ---------- Tarjeta con gemelo en tabla ----------
// cuerpo(host) dibuja el gráfico; tabla() devuelve { cab: [...], filas: [[...]] }.
export function card({ titulo, sub, clase = '' }, cuerpo, tabla, extraHead) {
  const host = h('div', { class: 'card-body' });
  let vista = 'grafico';
  const btn = tabla ? h('button', { class: 'btn ghost sm', 'aria-pressed': 'false', title: 'Alternar entre gráfico y tabla',
    onclick: () => {
      vista = vista === 'grafico' ? 'tabla' : 'grafico';
      btn.textContent = vista === 'grafico' ? 'Ver tabla' : 'Ver gráfico';
      btn.setAttribute('aria-pressed', String(vista === 'tabla'));
      pintar();
    } }, 'Ver tabla') : null;
  const pintar = () => {
    host.replaceChildren();
    if (vista === 'tabla') {
      host.dataset.view = 'table';
      host.classList.add('view-table');
      const t = tabla();
      host.append(h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, t.cab.map((c, i) => h('th', { class: i ? 'r' : '' }, c)))),
        h('tbody', {}, t.filas.map((f) => h('tr', {}, f.map((c, i) => h('td', { class: i ? 'r' : '' }, c)))))));
    } else {
      host.dataset.view = 'chart';
      host.classList.remove('view-table');
      cuerpo(host);
    }
  };
  const el = h('section', { class: 'card ' + clase },
    h('div', { class: 'card-head' },
      h('div', {}, h('div', { class: 'card-title' }, titulo), sub ? h('div', { class: 'card-sub' }, sub) : null),
      h('div', { class: 'row', style: { gap: '4px' } }, extraHead, btn)),
    host);
  pintar();
  return el;
}

export const legend = (items) => h('div', { class: 'legend' },
  items.map((i) => h('span', {}, h('i', { class: 'dot', style: { background: i.color } }), i.label)));

// ---------- Escala ----------
function niceTicks(max, n = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step - 1e-9) * step;
  const t = [];
  for (let v = 0; v <= top + step * 1e-6; v += step) t.push(Math.round(v * 100) / 100);
  return t;
}

// Rectángulo con esquinas superiores redondeadas (base cuadrada).
function topRounded(x, y, w, hgt, r) {
  r = Math.max(0, Math.min(r, w / 2, hgt));
  if (r === 0) return `M${x},${y}h${w}v${hgt}h${-w}z`;
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}z`;
}
// Rectángulo con extremo derecho redondeado (barras horizontales).

// ---------- Columnas apiladas ----------
// cats: [{key,label,tip}]  series: [{id,label,color}]  val(catKey, serieId) => número
export function stackedColumns(host, { cats, series, val, alto = 230, resaltar }) {
  responsive(host, (W) => {
    const m = { t: 20, r: 8, b: 26, l: 46 };
    const H = alto;
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const totals = cats.map((c) => series.reduce((a, se) => a + (val(c.key, se.id) || 0), 0));
    const ticks = niceTicks(Math.max(...totals, 0));
    const top = ticks[ticks.length - 1];
    const y = (v) => m.t + ph - (v / top) * ph;
    const band = pw / cats.length;
    const bw = Math.min(24, band * 0.6);

    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
      'aria-label': 'Gráfico de columnas apiladas' });
    for (const t of ticks) {
      svg.append(s('line', { class: t === 0 ? 'base-l' : 'grid-l', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
      svg.append(s('text', { class: 'ax', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, t === 0 ? '0' : moneyCompact(t)));
    }
    const every = band < 38 ? 2 : 1;
    cats.forEach((c, i) => {
      const cx = m.l + band * i + band / 2;
      const g = s('g', { class: 'col', tabindex: 0, 'aria-label': c.tip || c.label });
      let acc = 0;
      const vivos = series.filter((se) => (val(c.key, se.id) || 0) > 0);
      vivos.forEach((se, k) => {
        const v = val(c.key, se.id);
        const y0 = y(acc);
        acc += v;
        const y1 = y(acc);
        let hh = y0 - y1 - (k > 0 ? 2 : 0);
        hh = Math.max(hh, 3);
        const yy = y0 - (k > 0 ? 2 : 0) - hh;
        const esTope = k === vivos.length - 1;
        g.append(s('path', { d: topRounded(cx - bw / 2, yy, bw, hh, esTope ? 4 : 0), fill: se.color }));
      });
      if (totals[i] > 0) g.append(s('text', { class: 'tot', x: cx, y: y(totals[i]) - 6, 'text-anchor': 'middle' }, moneyCompact(totals[i])));
      if (i % every === 0) g.append(s('text', { class: 'ax', x: cx, y: H - 8, 'text-anchor': 'middle', style: resaltar === c.key ? 'font-weight:700;fill:var(--ink)' : '' }, c.label));
      g.append(s('rect', { class: 'hit', x: cx - band / 2, y: m.t - 14, width: band, height: ph + 14 + 18, fill: 'transparent' }));
      tipOn(g, () => ({
        titulo: c.tip || c.label,
        filas: series.map((se) => ({ color: se.color, valor: money(val(c.key, se.id) || 0), etiqueta: se.label })),
        pie: series.length > 1 ? 'Total ' + money(totals[i]) : null,
      }));
      svg.append(g);
    });
    host.replaceChildren(svg, series.length > 1 ? legend(series) : null);
    host.lastChild?.classList?.contains('legend') && (host.lastChild.style.marginTop = '4px');
  });
}

// ---------- Dona ----------
export function donut(host, { tajadas, centro, centroSub }) {
  responsive(host, (W) => {
    const size = Math.min(W, 190);
    const R = size / 2 - 4;
    const thick = 18;
    const r0 = R - thick / 2;
    const total = tajadas.reduce((a, t) => a + t.valor, 0);
    const box = h('div', { class: 'donut-center', style: { width: size + 'px', height: size + 'px' } });
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': 'Distribución por tipo de gasto' });
    const c = size / 2;
    const vivas = tajadas.filter((t) => t.valor > 0);
    if (total <= 0) {
      svg.append(s('circle', { cx: c, cy: c, r: r0, fill: 'none', stroke: 'var(--grid)', 'stroke-width': thick }));
    } else if (vivas.length === 1) {
      const t = vivas[0];
      const circ = s('circle', { class: 'arc', cx: c, cy: c, r: r0, fill: 'none', stroke: t.color, 'stroke-width': thick, tabindex: 0 });
      tipOn(circ, () => ({ titulo: t.label, filas: [{ color: t.color, valor: money(t.valor), etiqueta: '100%' }] }));
      svg.append(circ);
    } else {
      const gap = (2 / r0); // 2px de separación en el radio medio
      let a = -Math.PI / 2;
      for (const t of vivas) {
        const ang = (t.valor / total) * Math.PI * 2;
        const a0 = a + gap / 2;
        const a1 = a + ang - gap / 2;
        a += ang;
        if (a1 <= a0) continue;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (an) => [c + r0 * Math.cos(an), c + r0 * Math.sin(an)];
        const [x0, y0] = p(a0);
        const [x1, y1] = p(a1);
        const path = s('path', { class: 'arc', d: `M${x0},${y0}A${r0},${r0} 0 ${large} 1 ${x1},${y1}`, fill: 'none', stroke: t.color, 'stroke-width': thick, tabindex: 0,
          'aria-label': `${t.label}: ${money(t.valor)}` });
        tipOn(path, () => ({ titulo: t.label, filas: [{ color: t.color, valor: money(t.valor), etiqueta: pct(t.valor / total) }] }));
        svg.append(path);
      }
    }
    box.append(svg, h('div', { class: 'mid' }, h('b', {}, centro), h('span', {}, centroSub || '')));
    const lg = h('div', { class: 'legend col', style: { width: '100%' } },
      tajadas.map((t) => h('div', { class: 'row' },
        h('i', { class: 'dot', style: { background: t.color } }),
        h('span', {}, t.label),
        h('span', { class: 'v num' }, money(t.valor)),
        h('span', { class: 'pctv num' }, total > 0 ? pct(t.valor / total) : '—'))));
    host.replaceChildren(h('div', { class: 'donut-wrap' }, box, lg));
  });
}

// ---------- Barras horizontales (ranking) ----------
// filas: [{label, valor, color, tip}]
export function hbars(host, { filas, leyenda }) {
  if (!filas.length) { host.replaceChildren(h('div', { class: 'muted' }, 'Sin datos en este periodo.')); return; }
  const max = Math.max(...filas.map((f) => f.valor));
  host.replaceChildren(
    h('div', { class: 'hbars' }, filas.map((f) => {
      const row = h('div', { class: 'hrow', tabindex: 0 },
        h('span', { class: 'name', title: f.label }, f.label),
        h('div', { class: 'track' }, h('div', { class: 'bar', style: { width: Math.max(1, (f.valor / max) * 100) + '%', background: f.color } })),
        h('span', { class: 'val num' }, money(f.valor)));
      tipOn(row, () => ({ titulo: f.label, filas: [{ color: f.color, valor: money(f.valor), etiqueta: f.tip || '' }] }));
      return row;
    })),
    leyenda ? h('div', { style: { marginTop: '10px' } }, leyenda) : null);
}

// ---------- Línea acumulada con referencia ----------
// puntos: [{dia, label, acum, dia$}] (solo hasta hoy)  ref: {fin, etiqueta} (ritmo ideal lineal) | null
export function lineaAcumulada(host, { puntos, totalDias, ref, alto = 240 }) {
  responsive(host, (W) => {
    const m = { t: 16, r: 78, b: 26, l: 46 };
    const H = alto;
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const maxV = Math.max(...puntos.map((p) => p.acum), ref ? ref.fin : 0, 1);
    const ticks = niceTicks(maxV);
    const top = ticks[ticks.length - 1];
    const x = (d) => m.l + ((d - 1) / Math.max(1, totalDias - 1)) * pw;
    const y = (v) => m.t + ph - (v / top) * ph;
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Gasto acumulado del mes' });
    for (const t of ticks) {
      svg.append(s('line', { class: t === 0 ? 'base-l' : 'grid-l', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
      svg.append(s('text', { class: 'ax', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, t === 0 ? '0' : moneyCompact(t)));
    }
    const paso = totalDias > 20 ? 5 : 1;
    for (let d = 1; d <= totalDias; d++) {
      const ultimoEje = d === totalDias && totalDias % paso >= 3; // evita "30 31" pegados
      if (d === 1 || d % paso === 0 || ultimoEje) svg.append(s('text', { class: 'ax', x: x(d), y: H - 8, 'text-anchor': 'middle' }, String(d)));
    }
    if (ref && ref.fin > 0) {
      svg.append(s('line', { x1: x(1), y1: y(0), x2: x(totalDias), y2: y(ref.fin), stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
      svg.append(s('text', { class: 'ax', x: x(totalDias) + 8, y: y(ref.fin) + 4 }, ref.etiqueta));
    }
    if (puntos.length) {
      const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.dia)},${y(p.acum)}`).join('');
      svg.append(s('path', { d: `${d}L${x(puntos[puntos.length - 1].dia)},${y(0)}L${x(puntos[0].dia)},${y(0)}Z`, fill: 'var(--s1)', opacity: 0.10 }));
      svg.append(s('path', { d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const ult = puntos[puntos.length - 1];
      svg.append(s('circle', { cx: x(ult.dia), cy: y(ult.acum), r: 5, fill: 'var(--ink)', stroke: 'var(--surface)', 'stroke-width': 2 }));
      // Si el rótulo de la referencia queda cerca, el valor actual va arriba o abajo del punto, nunca encima del otro.
      const cerca = ref && ref.fin > 0 && Math.abs(y(ref.fin) - y(ult.acum)) < 18 && x(ult.dia) > x(totalDias) - 24;
      const dy = !cerca ? 4 : ult.acum >= ref.fin ? -12 : 20;
      svg.append(s('text', { class: 'lbl', x: x(ult.dia) + 9, y: y(ult.acum) + dy, style: 'font-weight:650;fill:var(--ink)' }, moneyCompact(ult.acum)));
    }
    // Mira vertical que se ajusta al día más cercano.
    const cross = s('line', { y1: m.t, y2: m.t + ph, stroke: 'var(--axis)', 'stroke-width': 1, opacity: 0 });
    const dot = s('circle', { r: 5, fill: 'var(--ink)', stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 });
    svg.append(cross, dot);
    const area = s('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    const contenido = (p) => ({
      titulo: p.label,
      filas: [
        { color: 'var(--ink)', valor: money(p.acum), etiqueta: 'Acumulado' },
        { color: 'var(--s2)', valor: money(p.dia$), etiqueta: 'Ese día' },
        ref && ref.fin > 0 ? { color: 'var(--muted)', valor: money((ref.fin * (p.dia - 1)) / Math.max(1, totalDias - 1)), etiqueta: 'Ritmo ideal' } : null,
      ].filter(Boolean),
    });
    const cercano = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = clientX - r.left;
      let best = null;
      for (const p of puntos) if (!best || Math.abs(x(p.dia) - px) < Math.abs(x(best.dia) - px)) best = p;
      return best;
    };
    area.addEventListener('pointermove', (e) => {
      const p = cercano(e.clientX);
      if (!p) return;
      cross.setAttribute('x1', x(p.dia)); cross.setAttribute('x2', x(p.dia)); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', x(p.dia)); dot.setAttribute('cy', y(p.acum)); dot.setAttribute('opacity', 1);
      showTip(e.clientX, e.clientY, contenido(p));
    });
    area.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); });
    svg.append(area);
    const lg = legend([
      { color: 'var(--ink)', label: 'Gasto acumulado' },
      ...(ref && ref.fin > 0 ? [{ color: 'var(--muted)', label: ref.leyenda }] : []),
    ]);
    lg.style.marginTop = '4px';
    host.replaceChildren(svg, lg);
  });
}

// ---------- Saldo día a día (Plan del mes) ----------
// puntos: [{fecha, saldo, eventos:[{concepto, monto, clase}]}] en orden; la línea es escalonada: el saldo cambia el día de cada evento.
export const COLOR_CLASE = { ingreso: 'var(--s3)', fijo: 'var(--s2)', mercado: 'var(--muted)', compromiso: 'var(--s1)' };
export const NOMBRE_CLASE = { ingreso: 'Ingreso', fijo: 'Pago recurrente', mercado: 'Mercado', compromiso: 'Compromiso' };

export function lineaSaldo(host, { puntos, desde, hasta, colchon, alto = 280 }) {
  responsive(host, (W) => {
    const m = { t: 24, r: 20, b: 30, l: 60 };
    const H = alto;
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const t0 = parse(desde).getTime();
    const t1 = parse(hasta).getTime();
    const x = (f) => m.l + ((parse(f).getTime() - t0) / Math.max(1, t1 - t0)) * pw;
    const maxV = Math.max(...puntos.map((p) => p.saldo), colchon, 1);
    const minV = Math.min(0, ...puntos.map((p) => p.saldo));
    const ticks = niceTicks(maxV);
    const top = ticks[ticks.length - 1];
    const y = (v) => m.t + ph - ((v - minV) / Math.max(1, top - minV)) * ph;
    const gid = 'sg' + Math.random().toString(36).slice(2, 8);

    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Saldo de tus cuentas día a día' });
    svg.append(s('defs', {}, s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: '0%', style: 'stop-color: var(--accent); stop-opacity: 0.38' }),
      s('stop', { offset: '100%', style: 'stop-color: var(--accent); stop-opacity: 0' }))));
    for (const t of ticks) {
      svg.append(s('line', { class: t === 0 ? 'base-l' : 'grid-l', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
      svg.append(s('text', { class: 'ax', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, t === 0 ? '0' : moneyCompact(t)));
    }
    // Días en el eje
    const dias = Math.round((t1 - t0) / 86400000);
    const paso = Math.max(1, Math.ceil(dias / 7));
    for (let i = 0; i <= dias; i += paso) {
      const f = new Date(t0 + i * 86400000);
      const txt = i === 0 || f.getDate() === 1 ? dayShort(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`) : String(f.getDate());
      svg.append(s('text', { class: 'ax', x: m.l + (i / Math.max(1, dias)) * pw, y: H - 8, 'text-anchor': 'middle' }, txt));
    }
    // Colchón de seguridad
    if (colchon > 0) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(colchon), y2: y(colchon), stroke: 'var(--crit)', 'stroke-width': 1.3, 'stroke-dasharray': '5 5', opacity: 0.75 }));
      svg.append(s('text', { class: 'ax', x: W - m.r, y: y(colchon) - 5, 'text-anchor': 'end', style: 'fill: var(--crit-ink)' }, 'colchón ' + moneyCompact(colchon)));
    }
    // Línea escalonada y área
    let d = `M${x(puntos[0].fecha)},${y(puntos[0].saldo)}`;
    for (let i = 1; i < puntos.length; i++) d += `H${x(puntos[i].fecha)}V${y(puntos[i].saldo)}`;
    const ultimo = puntos[puntos.length - 1];
    svg.append(s('path', { d: `${d}H${x(hasta)}V${y(minV < 0 ? minV : 0)}H${x(puntos[0].fecha)}Z`, fill: `url(#${gid})`, stroke: 'none' }));
    svg.append(s('path', { class: 'linea-saldo', d: `${d}H${x(hasta)}` }));
    // Puntos de cada día con movimientos, del color de lo que pasó
    const bajo = puntos.reduce((a, p) => (p.saldo < a.saldo ? p : a), puntos[0]);
    for (const p of puntos) {
      if (!p.eventos.length) continue;
      const mayor = p.eventos.reduce((a, e) => (Math.abs(e.monto) > Math.abs(a.monto) ? e : a), p.eventos[0]);
      svg.append(s('circle', { cx: x(p.fecha), cy: y(p.saldo), r: p === bajo ? 6 : 4.5, fill: COLOR_CLASE[mayor.clase] || 'var(--accent)', stroke: 'var(--surface-solid)', 'stroke-width': 2 }));
    }
    svg.append(s('text', { class: 'lbl', x: Math.min(x(bajo.fecha), W - m.r - 4), y: y(bajo.saldo) + 22, 'text-anchor': x(bajo.fecha) > W - 90 ? 'end' : 'middle', style: 'font-weight:700;fill:var(--crit-ink)' }, 'más bajo ' + moneyCompact(bajo.saldo)));
    svg.append(s('text', { class: 'lbl', x: x(ultimo.fecha) > W - m.r - 70 ? W - m.r : x(hasta), y: y(ultimo.saldo) - 10, 'text-anchor': 'end', style: 'font-weight:800;fill:var(--ink)' }, moneyCompact(ultimo.saldo)));
    // Mira vertical con tooltip
    const cross = s('line', { y1: m.t, y2: m.t + ph, stroke: 'var(--axis)', 'stroke-width': 1, opacity: 0 });
    svg.append(cross);
    const area = s('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    const cercano = (clientX) => {
      const px = clientX - svg.getBoundingClientRect().left;
      let best = null;
      for (const p of puntos) if (p.eventos.length && (!best || Math.abs(x(p.fecha) - px) < Math.abs(x(best.fecha) - px))) best = p;
      return best;
    };
    area.addEventListener('pointermove', (e) => {
      const p = cercano(e.clientX);
      if (!p) return;
      cross.setAttribute('x1', x(p.fecha)); cross.setAttribute('x2', x(p.fecha)); cross.setAttribute('opacity', 1);
      showTip(e.clientX, e.clientY, {
        titulo: dayShort(p.fecha),
        filas: p.eventos.map((ev) => ({ color: COLOR_CLASE[ev.clase] || 'var(--accent)', valor: (ev.monto > 0 ? '+ ' : ev.monto < 0 ? '− ' : '') + money(Math.abs(ev.monto)), etiqueta: ev.concepto })),
        pie: 'Queda en cuentas ' + money(p.saldo),
      });
    });
    area.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); hideTip(); });
    svg.append(area);
    const lg = legend([
      ...['ingreso', 'fijo', 'mercado', 'compromiso'].map((k) => ({ color: COLOR_CLASE[k], label: NOMBRE_CLASE[k] })),
      ...(colchon > 0 ? [{ color: 'var(--crit)', label: 'Colchón de seguridad' }] : []),
    ]);
    lg.style.marginTop = '4px';
    host.replaceChildren(svg, lg);
  });
}

// ---------- Medidor ----------
export function medidor(valor, tope, severidad = true) {
  const ratio = tope > 0 ? valor / tope : 0;
  const clase = !severidad ? '' : ratio > 1 ? 'crit' : ratio >= 0.85 ? 'warn' : '';
  return h('div', { class: 'meter ' + clase, role: 'progressbar', 'aria-valuenow': Math.round(ratio * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('i', { style: { width: Math.min(100, ratio * 100) + '%' } }));
}
