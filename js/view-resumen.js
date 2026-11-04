// Pantalla Resumen: cifras clave + gráficas para ver "cómo vamos".
import {
  h, money, moneyCompact, pct, todayISO, daysBetween, addDays, addMonths, monthStart, monthEnd, weekStart,
  daysInMonth, parse, dowIndex, DIAS_C, MESES_C, monthName, dayShort, rangeLabel, isoWeek, iso,
} from './util.js';
import {
  state, TIPOS, TIPO, hooks, curPeriod, rangeOf, shiftOf, visibleMovs, visibleIngresos, byTipo, sum, categoria,
  cuentaById, marcarPagado, hayDatos, cargarDemo, ingresoMinimo, planGasto,
} from './store.js';
import { card, stackedColumns, donut, hbars, lineaAcumulada, medidor, legend, disposeCharts } from './charts.js';
import { copiar } from './ui.js';

const SERIES = TIPOS.map((t) => ({ id: t.id, label: t.nombre, color: t.cssVar }));

function delta(actual, previo, textoPrevio, malo = true) {
  if (!previo) return h('span', { class: 'delta' }, 'Sin periodo previo para comparar');
  const d = (actual - previo) / previo;
  if (Math.abs(d) < 0.005) return h('span', { class: 'delta' }, `= igual que el ${textoPrevio}`);
  const sube = d > 0;
  return h('span', { class: 'delta ' + (sube === malo ? 'bad' : 'good') }, `${sube ? '▲' : '▼'} ${Math.round(Math.abs(d) * 100)}% vs ${textoPrevio}`);
}

function tile(label, valor, ...resto) {
  return h('section', { class: 'card w1' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value num' }, valor), ...resto);
}

function totalesPorTipo(range) {
  return byTipo(visibleMovs(range));
}

export function renderResumen(root) {
  disposeCharts();
  if (!hayDatos()) {
    root.replaceChildren(h('section', { class: 'card' }, h('div', { class: 'empty' },
      h('h3', {}, 'Aún no hay movimientos'),
      h('div', {}, 'Empieza incluyendo los pagos recurrentes del mes y registrando tus gastos. El dashboard se arma solo.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => hooks.goTab('recurrentes') }, 'Elegir recurrentes del mes'),
        h('button', { class: 'btn', onclick: () => hooks.goTab('movimientos') }, 'Registrar un gasto'),
        h('button', { class: 'btn ghost', onclick: () => { cargarDemo(); hooks.rerender(); } }, 'Ver con datos de ejemplo')))));
    return;
  }

  const p = curPeriod();
  const esMes = p.mode === 'mes';
  const range = rangeOf(p);
  const prev = rangeOf(shiftOf(p, -1));
  const txtPrev = esMes ? 'mes anterior' : 'semana anterior';
  const hoy = todayISO();

  const movs = visibleMovs(range);
  const ings = visibleIngresos(range);
  const gasto = sum(movs);
  const ingreso = sum(ings);
  const balance = ingreso - gasto;
  const pagado = sum(movs.filter((m) => m.estado === 'pagado'));
  const pendiente = gasto - pagado;
  const tipos = byTipo(movs);
  const prevMovs = visibleMovs(prev);
  const gastoPrev = sum(prevMovs);
  const tiposPrev = byTipo(prevMovs);

  const diasPeriodo = daysBetween(range.from, range.to) + 1;
  const diasTrans = hoy < range.from ? 0 : Math.min(daysBetween(range.from, hoy), diasPeriodo - 1) + 1;
  const diario = (t) => t.variable + t.hormiga;
  const promedio = diasTrans > 0 ? diario(tipos) / diasTrans : 0;
  const diasPrev = daysBetween(prev.from, prev.to) + 1;
  const promedioPrev = diario(tiposPrev) / diasPrev;

  // ---- Fila 1: balance + cifras ----
  // Por mes la cifra principal es el balance; por semana los ingresos no se reparten, así que lidera el gasto.
  const sinCarro = state.data.config.incluirCuotaCarro ? null : h('span', { class: 'pill' }, 'Sin cuota del carro');
  const hero = esMes
    ? h('section', { class: 'card w2 hero' },
      h('div', { class: 'hero-label' }, 'Balance del periodo'),
      h('div', { class: 'hero-value num' + (balance < 0 ? ' neg' : '') }, money(balance)),
      h('div', { class: 'hero-sub num' }, `Ingresos ${money(ingreso)} − Gastos ${money(gasto)}`),
      balance < 0
        ? h('span', { class: 'pill crit' }, '▼ Déficit: los gastos superan los ingresos')
        : ingreso > 0 ? h('span', { class: 'pill good' }, '✓ Los ingresos cubren los gastos') : h('span', { class: 'pill' }, 'Sin ingresos registrados en el periodo'),
      sinCarro)
    : h('section', { class: 'card w2 hero' },
      h('div', { class: 'hero-label' }, 'Gasto de la semana'),
      h('div', { class: 'hero-value num' }, money(gasto)),
      h('div', { class: 'hero-sub num' }, `Recurrentes ${money(tipos.recurrente)} · Variables ${money(tipos.variable)} · Hormiga ${money(tipos.hormiga)}`),
      delta(gasto, gastoPrev, txtPrev),
      sinCarro);

  const tGasto = esMes
    ? tile('Gasto total', money(gasto), delta(gasto, gastoPrev, txtPrev))
    : tile('Día a día', money(diario(tipos)), h('div', { class: 'card-sub' }, 'Variables + hormiga'), delta(diario(tipos), diario(tiposPrev), txtPrev));
  const tPagar = tile('Por pagar', money(pendiente),
    h('div', { class: 'card-sub num' }, `Pagado ${money(pagado)} de ${money(gasto)}`),
    medidor(pagado, gasto, false));
  const tProm = tile('Promedio diario', diasTrans > 0 ? money(promedio) : '—',
    h('div', { class: 'card-sub' }, 'Variables + hormiga'),
    delta(promedio, promedioPrev, txtPrev));
  const tHorm = tile('Gasto hormiga', money(tipos.hormiga),
    h('div', { class: 'card-sub' }, gasto > 0 ? `${pct(tipos.hormiga / gasto)} del gasto total` : 'Sin gasto en el periodo'),
    delta(tipos.hormiga, tiposPrev.hormiga, txtPrev));

  // ---- Fila 2: dona, por pagar, presupuesto ----
  const cDona = card({ titulo: 'Gasto por tipo', sub: esMes ? monthName(range.from) : rangeLabel(range.from, range.to) },
    (host) => donut(host, {
      tajadas: TIPOS.map((t) => ({ label: t.nombre, valor: tipos[t.id], color: t.cssVar })),
      centro: moneyCompact(gasto), centroSub: 'total',
    }),
    () => ({ cab: ['Tipo', 'Valor', '%'], filas: TIPOS.map((t) => [t.nombre, money(tipos[t.id]), gasto ? pct(tipos[t.id] / gasto) : '—']) }));
  const ancho = 'w2';
  cDona.classList.add(ancho);

  const pendientes = movs.filter((m) => m.estado === 'pendiente').sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cPagar = h('section', { class: 'card ' + ancho },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Por pagar'),
      h('div', { class: 'card-sub' }, pendientes.length ? `${pendientes.length} pendiente${pendientes.length > 1 ? 's' : ''} · ${money(pendiente)}` : 'Todo al día'))),
    pendientes.length
      ? h('div', {}, pendientes.slice(0, 7).map((m) => {
        const pl = m.plantillaId && state.data.plantillas.find((x) => x.id === m.plantillaId);
        const cu = pl?.cuenta && cuentaById(pl.cuenta);
        return h('div', { class: 'list-item' },
          h('div', {},
            h('div', { class: 'name' }, m.concepto),
            h('div', { class: 'meta' }, dayShort(m.fecha),
              cu ? h('button', { class: 'btn ghost sm', title: 'Copiar número de cuenta', onclick: () => copiar(cu.referencia) }, `${cu.referencia} ⧉`) : null)),
          h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
            h('span', { class: 'amt num' }, money(m.monto)),
            h('button', { class: 'btn sm', title: 'Marcar como pagado', 'aria-label': 'Marcar como pagado ' + m.concepto, onclick: () => { marcarPagado(m.id, true); hooks.rerender(); } }, '✓')));
      }))
      : h('div', { class: 'muted' }, 'No hay pagos pendientes en este periodo.'),
    pendientes.length > 7 ? h('button', { class: 'btn ghost sm', onclick: () => hooks.goTab('recurrentes') }, `Ver los ${pendientes.length} en Recurrentes`) : null);

  const factor = esMes ? 1 : 7 / daysInMonth(p.anchor);
  const pres = state.data.config.presupuestos;
  const estadoTope = (g, tope) => {
    const ratio = tope > 0 ? g / tope : 0;
    return ratio > 1 ? h('span', { class: 'status crit' }, `▲ Excedido por ${money(g - tope)}`)
      : ratio >= 0.85 ? h('span', { class: 'status warn' }, `● Cerca del tope (${pct(ratio)})`)
        : h('span', { class: 'status' }, `Disponible ${money(tope - g)}`);
  };
  const filaTope = (nombre, color, g, tope, sub) => h('div', { class: 'meter-row' },
    h('div', { class: 'top' }, h('span', {}, h('i', { class: 'dot', style: { background: color, marginRight: '6px' } }), nombre),
      h('span', { class: 'num' }, `${money(g)} / ${money(tope)}`)),
    medidor(g, tope),
    sub ? h('span', { class: 'card-sub' }, sub) : null,
    estadoTope(g, tope));
  let filasPres;
  if (esMes) {
    const mnP = ingresoMinimo(range.from.slice(0, 7));
    const pagRec = sum(movs.filter((m) => m.tipo === 'recurrente' && m.estado === 'pagado'));
    filasPres = [
      h('div', { class: 'meter-row' },
        h('div', { class: 'top' }, h('span', {}, h('i', { class: 'dot', style: { background: 'var(--s1)', marginRight: '6px' } }), 'Recurrentes'),
          h('span', { class: 'num' }, `${money(pagRec)} / ${money(tipos.recurrente)}`)),
        medidor(pagRec, tipos.recurrente, false),
        h('span', { class: 'status' }, tipos.recurrente > pagRec ? `Pagado ${pct(pagRec / tipos.recurrente)} · por pagar ${money(tipos.recurrente - pagRec)}` : (tipos.recurrente > 0 ? '✓ Todos pagados' : 'Aún no eliges recurrentes'))),
      mnP.mercadoBase > 0
        ? filaTope('Mercado', 'var(--s2)', mnP.mercadoReal, mnP.mercadoBase, 'Presupuesto: ' + mnP.origenBase)
        : h('div', { class: 'meter-row' }, h('span', {}, h('i', { class: 'dot', style: { background: 'var(--s2)', marginRight: '6px' } }), 'Mercado'),
          h('span', { class: 'card-sub' }, `Llevas ${money(mnP.mercadoReal)}. Sin presupuesto todavía: agrega tu historial de compras en Ajustes.`),
          h('button', { class: 'btn sm', onclick: () => hooks.goTab('ajustes') }, 'Ir a Ajustes')),
      ...TIPOS.filter((tp) => tp.id !== 'recurrente' && pres[tp.id] > 0).map((tp) => filaTope(tp.nombre, tp.cssVar, tipos[tp.id], pres[tp.id], 'Tope que definiste')),
    ];
  } else {
    const conPres = TIPOS.filter((tp) => pres[tp.id] > 0);
    filasPres = conPres.length
      ? conPres.map((tp) => filaTope(tp.nombre, tp.cssVar, tipos[tp.id], pres[tp.id] * factor, null))
      : [h('div', { class: 'stack' },
        h('div', { class: 'muted' }, 'Aún no defines topes. Con un tope por tipo verás si vas en ritmo.'),
        h('button', { class: 'btn', onclick: () => hooks.goTab('ajustes') }, 'Definir presupuesto'))];
  }
  const cPres = h('section', { class: 'card ' + ancho },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Presupuesto'),
      h('div', { class: 'card-sub' }, esMes ? 'Recurrentes y mercado del mes' : 'Tope mensual prorrateado a la semana'))),
    h('div', {}, ...filasPres));

  // ---- Ingreso mínimo (solo por mes): recurrentes + mercado ----
  const cMin = esMes ? tarjetaMinimo(range.from.slice(0, 7), ingreso, tipos) : null;

  // ---- Gráficas ----
  const cards = [];

  if (esMes) {
    const dim = daysInMonth(range.from);
    const porDia = new Array(dim + 1).fill(0);
    for (const m of movs) porDia[Number(m.fecha.slice(8))] += m.monto;
    const ultimo = hoy < range.from ? 0 : hoy > range.to ? dim : Number(hoy.slice(8));
    const puntos = [];
    let acum = 0;
    for (let d = 1; d <= ultimo; d++) {
      acum += porDia[d];
      puntos.push({ dia: d, label: `${d} de ${monthName(range.from).split(' ')[0].toLowerCase()}`, acum, dia$: porDia[d] });
    }
    const tope = state.data.config.tope > 0 ? state.data.config.tope : ingreso;
    const ref = tope > 0 ? {
      fin: tope, etiqueta: moneyCompact(tope),
      leyenda: state.data.config.tope > 0 ? 'Ritmo ideal según tu tope mensual' : 'Ritmo ideal según tus ingresos del mes',
    } : null;
    cards.push(card({ titulo: 'Gasto acumulado del mes', sub: ref ? `Contra ${money(tope)} ${state.data.config.tope > 0 ? 'de tope' : 'de ingresos'}` : 'Define un tope en Ajustes para ver el ritmo ideal', clase: 'w4' },
      (host) => lineaAcumulada(host, { puntos, totalDias: dim, ref }),
      () => ({ cab: ['Día', 'Gasto del día', 'Acumulado'], filas: puntos.map((q) => [q.label, money(q.dia$), money(q.acum)]) })));
  } else {
    const dias = Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
    const val = (k, sid) => sum(movs.filter((m) => m.fecha === k && m.tipo === sid));
    cards.push(card({ titulo: 'Gasto por día', sub: rangeLabel(range.from, range.to), clase: 'w4' },
      (host) => stackedColumns(host, { cats: dias.map((d) => ({ key: d, label: `${DIAS_C[dowIndex(d)]} ${parse(d).getDate()}`, tip: `${DIAS_C[dowIndex(d)]} ${dayShort(d)}` })), series: SERIES, val, resaltar: hoy }),
      () => ({ cab: ['Día', ...SERIES.map((q) => q.label), 'Total'], filas: dias.map((d) => [`${DIAS_C[dowIndex(d)]} ${dayShort(d)}`, ...SERIES.map((q) => money(val(d, q.id))), money(sum(movs.filter((m) => m.fecha === d)))]) })));
  }

  // Top categorías
  const porCat = new Map();
  for (const m of movs) {
    const e = porCat.get(m.categoria) || { valor: 0, tipos: {} };
    e.valor += m.monto;
    e.tipos[m.tipo] = (e.tipos[m.tipo] || 0) + m.monto;
    porCat.set(m.categoria, e);
  }
  const top = [...porCat.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 8).map(([id, e]) => {
    const tipoDom = Object.entries(e.tipos).sort((a, b) => b[1] - a[1])[0][0];
    return { label: categoria(id)?.nombre || id, valor: e.valor, color: TIPO[tipoDom].cssVar, tip: TIPO[tipoDom].nombre };
  });
  cards.push(card({ titulo: 'Principales categorías', sub: 'Color = tipo de gasto', clase: 'w2' },
    (host) => hbars(host, { filas: top, leyenda: legend(SERIES) }),
    () => ({ cab: ['Categoría', 'Tipo', 'Valor'], filas: top.map((t) => [t.label, t.tip, money(t.valor)]) })));

  // Tendencia (6 meses o 8 semanas)
  const tendCats = [];
  if (esMes) {
    for (let i = 5; i >= 0; i--) {
      const a = addMonths(p.anchor, -i);
      tendCats.push({ key: a.slice(0, 7), label: MESES_C[parse(a).getMonth()], tip: monthName(a), range: { from: monthStart(a), to: monthEnd(a) } });
    }
  } else {
    for (let i = 7; i >= 0; i--) {
      const w = addDays(weekStart(p.anchor), -7 * i);
      tendCats.push({ key: w, label: `S${isoWeek(w)}`, tip: `Semana ${isoWeek(w)} · ${rangeLabel(w, addDays(w, 6))}`, range: { from: w, to: addDays(w, 6) } });
    }
  }
  const tendVals = new Map(tendCats.map((c) => [c.key, totalesPorTipo(c.range)]));
  const tendVal = (k, sid) => tendVals.get(k)[sid];
  cards.push(card({ titulo: esMes ? 'Últimos 6 meses' : 'Últimas 8 semanas', sub: 'Gasto total por tipo', clase: 'w3' },
    (host) => stackedColumns(host, { cats: tendCats, series: SERIES, val: tendVal, resaltar: esMes ? p.anchor.slice(0, 7) : weekStart(p.anchor) }),
    () => ({ cab: [esMes ? 'Mes' : 'Semana', ...SERIES.map((q) => q.label), 'Total'], filas: tendCats.map((c) => [c.tip, ...SERIES.map((q) => money(tendVal(c.key, q.id))), money(SERIES.reduce((a, q) => a + tendVal(c.key, q.id), 0))]) })));

  if (esMes) {
    // Semanas del mes
    const semanas = [];
    let w = weekStart(range.from);
    let n = 1;
    while (w <= range.to) {
      const from = w < range.from ? range.from : w;
      const toW = addDays(w, 6);
      const to = toW > range.to ? range.to : toW;
      semanas.push({ key: w, label: `S${n}`, tip: `Semana ${n} · ${rangeLabel(from, to)}`, from, to });
      w = addDays(w, 7);
      n++;
    }
    const sv = (k, sid) => { const s = semanas.find((x) => x.key === k); return sum(movs.filter((m) => m.tipo === sid && m.fecha >= s.from && m.fecha <= s.to)); };
    cards.push(card({ titulo: 'Gasto por semana del mes', sub: 'Semanas de lunes a domingo', clase: 'w3' },
      (host) => stackedColumns(host, { cats: semanas, series: SERIES, val: sv }),
      () => ({ cab: ['Semana', ...SERIES.map((q) => q.label)], filas: semanas.map((x) => [x.tip, ...SERIES.map((q) => money(sv(x.key, q.id)))]) })));

    // Día de la semana (variables + hormiga)
    const dd = DIAS_C.map((d, i) => ({ key: String(i), label: d, tip: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][i] }));
    const dv = (k, sid) => sum(movs.filter((m) => m.tipo === sid && dowIndex(m.fecha) === Number(k)));
    const serDia = SERIES.filter((q) => q.id !== 'recurrente');
    cards.push(card({ titulo: 'Variables y hormiga por día de la semana', sub: 'Dónde se va la plata en el día a día', clase: 'w3' },
      (host) => stackedColumns(host, { cats: dd, series: serDia, val: dv }),
      () => ({ cab: ['Día', ...serDia.map((q) => q.label)], filas: dd.map((x) => [x.tip, ...serDia.map((q) => money(dv(x.key, q.id)))]) })));
  }

  // Mayores gastos
  const mayores = [...movs].sort((a, b) => b.monto - a.monto).slice(0, 6);
  cards.push(card({ titulo: 'Mayores gastos', sub: 'Los 6 más grandes del periodo', clase: 'w3' },
    (host) => host.replaceChildren(h('div', {}, mayores.length ? mayores.map((m) => h('div', { class: 'list-item' },
      h('div', {}, h('div', { class: 'name' }, m.concepto),
        h('div', { class: 'meta' }, h('i', { class: 'dot', style: { background: TIPO[m.tipo].cssVar } }), `${TIPO[m.tipo].corto} · ${categoria(m.categoria)?.nombre || m.categoria} · ${dayShort(m.fecha)}`)),
      h('span', { class: 'amt num' }, money(m.monto)))) : h('div', { class: 'muted' }, 'Sin gastos en el periodo.'))),
    () => ({ cab: ['Concepto', 'Tipo', 'Fecha', 'Valor'], filas: mayores.map((m) => [m.concepto, TIPO[m.tipo].corto, dayShort(m.fecha), money(m.monto)]) })));

  root.replaceChildren(h('div', { class: 'grid' }, hero, tGasto, tPagar, tProm, tHorm, cMin, cDona, cPagar, cPres, ...cards.filter(Boolean)));
}

// Presupuesto de fijos (recurrentes + mercado), ingreso mínimo y cuánto guardar según lo que esperas recibir.
function tarjetaMinimo(mes, ingreso, tipos) {
  const mn = ingresoMinimo(mes);
  const semanas = 52 / 12;
  if (mn.total <= 0) {
    return h('section', { class: 'card w6' },
      h('div', { class: 'card-title' }, 'Presupuesto de fijos e ingreso mínimo'),
      h('div', { class: 'card-sub' }, 'Recurrentes + mercado: lo que hay que cubrir sí o sí'),
      h('div', { class: 'muted' }, 'Aún no hay recurrentes elegidos ni mercado registrado. Elige los recurrentes del mes y el cálculo aparece solo.'),
      h('div', {}, h('button', { class: 'btn', onclick: () => hooks.goTab('recurrentes') }, 'Elegir recurrentes')));
  }
  const M = mn.total;
  const fila = (nombre, meta, valor) => h('div', { class: 'list-item' },
    h('div', {}, h('div', { class: 'name' }, nombre), h('div', { class: 'meta' }, meta)),
    h('span', { class: 'amt num' }, money(valor)));
  const otros = tipos.variable - mn.mercadoReal + tipos.hormiga;
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

  // Un renglón por grupo (Hogar, Mamá, Créditos); en Créditos se detalla carro (fijo), tarjeta (variable) y otros.
  const filasGrupos = mn.grupos.map((g) => {
    const esCred = g.id === 'creditos';
    const meta = esCred
      ? 'Cuota fija del carro + pago variable de la tarjeta + otros créditos'
      : `${g.items.length} pago${g.items.length === 1 ? '' : 's'}${mn.origenRec === 'anterior' ? ' · estimado con los del mes anterior' : ''}`;
    const detalle = esCred
      ? h('div', { class: 'sub-items' }, g.items.slice().sort((x, y) => y.monto - x.monto).map((it) => {
        const fuera = it.categoria === 'carro' && !mn.incluyeCarro;
        const etiqueta = it.categoria === 'carro' ? 'cuota fija' : it.tarjeta ? 'variable · estimado' : 'cuota';
        return h('div', { class: 'row-sub' + (fuera ? ' off' : '') },
          h('span', {}, `${it.concepto} · ${etiqueta}${fuera ? ' · excluida' : ''}`), h('span', { class: 'num' }, money(it.monto)));
      }))
      : null;
    return h('div', { class: 'grupo' }, h('div', { class: 'list-item' },
      h('div', {}, h('div', { class: 'name' }, esCred ? 'Créditos y tarjeta' : g.nombre), h('div', { class: 'meta' }, meta)),
      h('span', { class: 'amt num' }, money(g.total))), detalle);
  });

  const izq = h('div', { class: 'stack', style: { gap: '6px' } },
    h('div', { class: 'card-sub' }, 'Presupuesto de fijos = ingreso mínimo'),
    h('div', { class: 'tile-value num', style: { fontSize: '34px' } }, money(M)),
    h('div', { class: 'card-sub num' }, `≈ ${money(M / semanas)} por semana`),
    h('div', {},
      ...filasGrupos,
      h('div', { class: 'grupo' }, h('div', { class: 'list-item' },
        h('div', {}, h('div', { class: 'name' }, 'Mercado'), h('div', { class: 'meta' }, cap(mn.origenMercado) + (mn.mercadoReal > 0 ? ` · llevas ${money(mn.mercadoReal)}` : ''))),
        h('span', { class: 'amt num' }, money(mn.mercado))))),
    mn.mercadoTarjeta > 0 ? h('div', { class: 'card-sub num' }, `De ${money(mn.mercadoBruto)} de mercado, ${money(mn.mercadoTarjeta)} ya van dentro del pago de la tarjeta (no se cuentan dos veces).`) : null,
    mn.mercadoBase <= 0
      ? h('div', {}, h('button', { class: 'btn sm', onclick: () => hooks.goTab('ajustes') }, 'Agregar historial de mercado para estimarlo'))
      : null,
    mn.incluyeCarro && mn.carro > 0 ? h('div', { class: 'card-sub num' }, `Sin la cuota del carro serían ${money(mn.totalSinCarro)}`) : null,
    otros > 0 ? h('div', { class: 'card-sub num' }, `Aparte llevas ${money(otros)} en otros variables y hormiga.`) : null);

  // Derecha: lo esperado y lo recibido (viene de la pestaña Ingresos) y qué hacer con ese dinero.
  const pg = planGasto(mes);
  const E = pg.base;
  const R_ = pg.recibido;
  const dif = E - M;
  const escenarios = [['Menos trabajo (−25%)', 0.75], ['Lo esperado', 1], ['Más trabajo (+25%)', 1.25]];
  const filaIng = (nombre, meta, valor) => h('div', { class: 'list-item' }, h('div', {}, h('div', { class: 'name' }, nombre), meta ? h('div', { class: 'meta' }, meta) : null), h('span', { class: 'amt num' }, money(valor)));
  const der = h('div', { class: 'stack', style: { gap: '8px' } },
    h('div', { class: 'card-title' }, 'Ingresos del mes'),
    E <= 0
      ? h('div', { class: 'stack' }, h('div', { class: 'muted' }, 'Aún no has definido lo que esperas recibir. Agrégalo en Ingresos (recurrentes y variables) y aquí verás cuánto guardar.'),
        h('div', {}, h('button', { class: 'btn primary', onclick: () => hooks.goTab('ingresos') }, 'Definir ingresos esperados')))
      : h('div', { class: 'stack', style: { gap: '8px' } },
        h('div', {}, filaIng('Esperado', pg.base > pg.esperado ? `Tu plan ${money(pg.esperado)} + ${money(pg.base - pg.esperado)} recibido sin plan` : 'Según tu plan de Ingresos', pg.base), filaIng('Recibido', `${pct(pg.esperado > 0 ? Math.min(1, R_ / pg.esperado) : 1)} de lo esperado`, R_), filaIng('Falta por recibir', '', pg.falta)),
        dif >= 0
          ? h('span', { class: 'status' }, `✓ Cubres lo fijo y te sobran ${money(dif)} para variables, hormiga y ahorro.`)
          : h('span', { class: 'status crit' }, `▲ Te faltan ${money(-dif)} para cubrir lo fijo: hay que conseguir más trabajo o recortar.`),
        h('div', { class: 'callout' }, 'Guarda ', h('b', {}, pct(Math.min(1, M / E))), ` de cada pago que recibas hasta juntar ${money(M)}.`),
        h('div', { class: 'card-sub num' }, R_ >= M ? `Con lo recibido (${money(R_)}) los fijos del mes ya están cubiertos.` : `Con lo recibido (${money(R_)}) aún faltan ${money(M - R_)} por reservar para los fijos.`),
        h('table', { class: 'tbl', style: { marginTop: '2px' } },
          h('thead', {}, h('tr', {}, h('th', {}, 'Si entra'), h('th', { class: 'r' }, 'Ingreso'), h('th', { class: 'r' }, 'Sobra / falta'), h('th', { class: 'r' }, 'Separar'))),
          h('tbody', {}, escenarios.map(([n, fct]) => {
            const Ef = E * fct;
            return h('tr', {}, h('td', {}, n), h('td', { class: 'r' }, money(Ef)),
              h('td', { class: 'r', style: Ef - M < 0 ? { color: 'var(--crit-ink)' } : {} }, (Ef - M < 0 ? '▲ ' : '') + money(Ef - M)),
              h('td', { class: 'r' }, pct(Math.min(1, M / Ef))));
          }))),
        h('div', {}, h('button', { class: 'btn sm', onclick: () => hooks.goTab('ingresos') }, 'Gestionar ingresos'))));

  return h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, 'Presupuesto de fijos e ingreso mínimo'),
      h('div', { class: 'card-sub' }, 'Recurrentes + créditos + mercado: lo que hay que cubrir sí o sí, y cuánto guardar según lo que esperas recibir'))),
    h('div', { class: 'min-grid' }, izq, der));
}
