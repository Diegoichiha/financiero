// Pestaña Créditos: tarjeta Rappi (compras, cuotas y proyección de pagos) y créditos de cuota fija (carro).
import {
  h, money, uid, todayISO, daysBetween, addMonths, parse, MESES_C, monthName, num,
} from './util.js';
import {
  state, hooks, tarjetaById, saveCompraTarjeta, delCompraTarjeta, savePlanTarjeta, delPlanTarjeta, saveTarjetaConfig,
  saveCredito, delCredito, categoria, sum,
} from './store.js';
import {
  corteDeFecha, pagoDeCorte, corteMasN, extracto, proyeccion, estadoPlan, cuotaPmt, amortizacion, mesesEntre,
} from './creditos.js';
import { card, stackedColumns, disposeCharts } from './charts.js';
import { modal, field, moneyInput, select, toast } from './ui.js';

const fechaLarga = (f) => `${parse(f).getDate()} ${MESES_C[parse(f).getMonth()]} ${parse(f).getFullYear()}`;
const fechaCorta = (f) => `${parse(f).getDate()} ${MESES_C[parse(f).getMonth()]}`;
const tasaTxt = (x) => String(x ?? 0).replace('.', ',') + '%';
const catOpts = () => state.data.categorias.map((c) => ({ value: c.id, label: c.nombre }));

// ---------- Compras y cuotas de la tarjeta ----------
function modalCompra(t, existente) {
  const nueva = !existente;
  const c = existente || { id: uid(), fecha: todayISO(), concepto: '', monto: 0, categoria: 'otros-var' };
  const fFecha = h('input', { type: 'date', value: c.fecha || '' });
  const fConcepto = h('input', { type: 'text', value: c.concepto, placeholder: 'Ej. Compra en Cañaveral' });
  const fMonto = moneyInput(c.monto);
  const fCuotas = h('input', { type: 'number', min: 1, max: 60, value: 1, disabled: !nueva });
  const fTasa = h('input', { type: 'number', min: 0, step: 0.01, value: 0, placeholder: '0 = sin interés', disabled: !nueva });
  const fCat = select(catOpts(), c.categoria);
  const fPartes = h('input', { type: 'number', min: 1, max: 10, value: c.partes || 1 });
  const fCuota = moneyInput(0, { disabled: !nueva });
  let cuotaManual = false;
  const info = h('div', { class: 'card-sub full' });
  const refrescar = () => {
    const n = Math.max(1, Number(fCuotas.value) || 1);
    const valor = fMonto.getValue();
    if (n > 1 && !cuotaManual) fCuota.value = valor ? num(cuotaPmt(valor, n, Number(fTasa.value) || 0)) : '';
    const fecha = fFecha.value || (c.corte ? null : todayISO());
    const corte = fecha ? corteDeFecha(fecha, t) : c.corte;
    const partes = Math.max(1, Math.round(Number(fPartes.value) || 1));
    info.textContent = (n > 1
      ? `${n} cuotas de ${money(fCuota.getValue())}. La primera entra en el extracto del corte ${fechaCorta(corte)} (se paga el ${fechaCorta(pagoDeCorte(corte, t))}).`
      : `Entra en el extracto del corte ${fechaCorta(corte)} y se paga el ${fechaCorta(pagoDeCorte(corte, t))}.`)
      + (partes > 1 && n === 1 && valor ? ` Compartida entre ${partes}: tu parte es ${money(valor / partes)}. El banco te cobra los ${money(valor)} completos y los otros ${money(valor - valor / partes)} te los devuelven: queda como ingreso esperado "Reembolso" (puedes mover su fecha en Ingresos).` : '');
  };
  fCuota.addEventListener('input', () => { cuotaManual = true; refrescar(); });
  [fFecha, fMonto, fCuotas, fTasa, fPartes].forEach((el) => el.addEventListener('input', refrescar));
  refrescar();
  const campos = [
    field('Fecha de la compra', fFecha), field('Valor de la compra', fMonto), field('Concepto', fConcepto, 'full'),
  ];
  if (nueva) campos.push(field('Número de cuotas (1 = una sola cuota)', fCuotas), field('Tasa M.V. % (si hay cuotas)', fTasa), field('Cuota mensual (puedes ajustarla)', fCuota, 'full'));
  campos.push(field('Categoría', fCat, 'full'), field('¿Entre cuántas personas se divide? (contándote; 1 = solo tuya)', fPartes, 'full'), info);
  modal(nueva ? 'Agregar compra con tarjeta' : 'Editar compra', campos, {
    onSave: () => {
      if (!fConcepto.value.trim()) return 'Escribe el concepto.';
      if (!fMonto.getValue()) return 'Escribe el valor.';
      if (!fFecha.value && nueva) return 'Elige la fecha.';
      const n = Math.max(1, Number(fCuotas.value) || 1);
      const partes = Math.max(1, Math.round(Number(fPartes.value) || 1));
      if (n > 1 && partes > 1) return 'Dividir entre personas solo sirve en compras de una sola cuota.';
      if (n > 1) {
        const cuota = fCuota.getValue();
        if (!cuota) return 'Falta la cuota mensual.';
        const primer = corteDeFecha(fFecha.value, t);
        savePlanTarjeta(t.id, {
          id: uid(), concepto: fConcepto.value.trim(), cuota, cuotas: n, pagadas: 0, corteRef: corteMasN(primer, t, -1),
          tasaMV: Number(fTasa.value) || 0, valor: fMonto.getValue(), categoria: fCat.value,
        });
      } else {
        const comp = { ...c, concepto: fConcepto.value.trim(), monto: fMonto.getValue(), categoria: fCat.value, partes: partes > 1 ? partes : undefined };
        if (fFecha.value) { comp.fecha = fFecha.value; delete comp.corte; }
        saveCompraTarjeta(t.id, comp);
      }
      hooks.rerender();
    },
    peligro: nueva ? null : { label: 'Eliminar', fn: () => { delCompraTarjeta(t.id, c.id); hooks.rerender(); } },
  });
}

function modalPlan(t, plan) {
  const fConcepto = h('input', { type: 'text', value: plan.concepto });
  const fCuota = moneyInput(plan.cuota);
  const fCuotas = h('input', { type: 'number', min: 1, max: 120, value: plan.cuotas });
  const fPagadas = h('input', { type: 'number', min: 0, max: 120, value: plan.pagadas });
  const fTasa = h('input', { type: 'number', min: 0, step: 0.01, value: plan.tasaMV || 0 });
  modal('Editar compra a cuotas', [
    field('Concepto', fConcepto, 'full'), field('Cuota mensual', fCuota), field('Número de cuotas', fCuotas),
    field(`Cuotas ya facturadas (hasta el corte del ${fechaLarga(plan.corteRef)})`, fPagadas, 'full'), field('Tasa M.V. %', fTasa),
  ], {
    onSave: () => {
      if (!fConcepto.value.trim()) return 'Escribe el concepto.';
      if (!fCuota.getValue()) return 'Escribe la cuota mensual.';
      savePlanTarjeta(t.id, {
        ...plan, concepto: fConcepto.value.trim(), cuota: fCuota.getValue(), cuotas: Math.max(1, Number(fCuotas.value) || 1),
        pagadas: Math.max(0, Number(fPagadas.value) || 0), tasaMV: Number(fTasa.value) || 0,
      });
      hooks.rerender();
    },
    peligro: { label: 'Eliminar', fn: () => { delPlanTarjeta(t.id, plan.id); hooks.rerender(); } },
  });
}

function modalConfigTarjeta(t) {
  const fNombre = h('input', { type: 'text', value: t.nombre });
  const fCorte = h('input', { type: 'number', min: 1, max: 31, value: t.corte });
  const fPago = h('input', { type: 'number', min: 1, max: 31, value: t.diaPago });
  modal('Datos de la tarjeta', [
    field('Nombre', fNombre, 'full'), field('Día de corte', fCorte), field('Día de pago', fPago),
    h('div', { class: 'card-sub full' }, 'Si el día de pago es menor que el de corte, se paga el mes siguiente al corte (ej. corte 19, pago el 1).'),
  ], {
    onSave: () => {
      saveTarjetaConfig(t.id, { nombre: fNombre.value.trim() || t.nombre, corte: Number(fCorte.value) || t.corte, diaPago: Number(fPago.value) || t.diaPago });
      hooks.rerender();
    },
  });
}

// ---------- Crédito de cuota fija ----------
function modalCredito(c) {
  const fNombre = h('input', { type: 'text', value: c.nombre });
  const fCuota = moneyInput(c.cuota);
  const fDia = h('input', { type: 'number', min: 1, max: 31, value: c.diaPago });
  const fSaldo = moneyInput(Math.round(c.saldo));
  const fSaldoFecha = h('input', { type: 'date', value: c.saldoFecha || '' });
  const fTasa = h('input', { type: 'number', min: 0, step: 0.01, value: c.tasaMV });
  const fEA = h('input', { type: 'number', min: 0, step: 0.01, value: c.tasaEA || '' });
  const fPrimera = h('input', { type: 'date', value: c.primeraCuota || '' });
  const fNota = h('input', { type: 'text', value: c.nota || '' });
  modal('Datos del crédito', [
    field('Nombre', fNombre, 'full'), field('Cuota mensual fija', fCuota), field('Día de pago', fDia),
    field('Pago total / saldo (según el banco)', fSaldo), field('Fecha de ese saldo', fSaldoFecha),
    field('Tasa M.V. %', fTasa), field('Tasa E.A. %', fEA), field('Primera cuota pagada', fPrimera, 'full'), field('Nota', fNota, 'full'),
  ], {
    onSave: () => {
      if (!fCuota.getValue()) return 'Escribe la cuota mensual.';
      saveCredito({ ...c, nombre: fNombre.value.trim() || c.nombre, cuota: fCuota.getValue(), diaPago: Number(fDia.value) || c.diaPago, saldo: fSaldo.getValue(),
        saldoFecha: fSaldoFecha.value, tasaMV: Number(fTasa.value) || 0, tasaEA: Number(fEA.value) || 0, primeraCuota: fPrimera.value, nota: fNota.value.trim() });
      hooks.rerender();
    },
    peligro: { label: 'Eliminar', fn: () => { delCredito(c.id); hooks.rerender(); } },
  });
}

// ---------- Pantalla ----------
export function renderCreditos(root) {
  disposeCharts();
  const hoy = todayISO();
  const cards = [];

  for (const t of state.data.tarjetas) {
    const corte = corteDeFecha(hoy, t);
    const ex = extracto(t, corte);
    const dias = daysBetween(hoy, corte);

    const lista = (vacio, filas) => (filas.length ? h('div', {}, filas) : h('div', { class: 'muted' }, vacio));
    const filaCompra = (c) => h('div', { class: 'list-item' },
      h('div', {}, h('div', { class: 'name' }, c.concepto),
        h('div', { class: 'meta' }, c.fecha ? fechaCorta(c.fecha) : 'sin fecha', '·', categoria(c.categoria)?.nombre || c.categoria,
          c.partes > 1 ? ` · compartida entre ${c.partes}: tu parte ${money(c.monto / c.partes)}` : null)),
      h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, h('span', { class: 'amt num' }, money(c.monto)),
        h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + c.concepto, onclick: () => modalCompra(t, c) }, '✎')));
    const filaCuota = (x) => h('div', { class: 'list-item' },
      h('div', {}, h('div', { class: 'name' }, x.plan.concepto), h('div', { class: 'meta' }, `Cuota ${x.n} de ${x.plan.cuotas}`)),
      h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, h('span', { class: 'amt num' }, money(x.plan.cuota)),
        h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + x.plan.concepto, onclick: () => modalPlan(t, x.plan) }, '✎')));

    cards.push(h('section', { class: 'card w3' },
      h('div', { class: 'card-head' },
        h('div', {}, h('div', { class: 'card-title' }, t.nombre),
          h('div', { class: 'card-sub' }, `Corte el ${t.corte} · pago el ${t.diaPago} ${t.diaPago <= t.corte ? 'del mes siguiente' : 'del mismo mes'}`)),
        h('div', { class: 'row', style: { gap: '4px' } },
          h('button', { class: 'btn ghost sm', onclick: () => modalConfigTarjeta(t) }, 'Datos'),
          h('button', { class: 'btn primary', onclick: () => modalCompra(t) }, '+ Agregar compra'))),
      h('div', { class: 'card-sub' }, `Próximo pago: ${fechaLarga(ex.pago)} (corte ${fechaCorta(corte)})`),
      h('div', { class: 'tile-value num', style: { fontSize: '34px' } }, money(ex.total)),
      h('div', { class: 'card-sub num' }, `Compras ${money(ex.totalCompras)} + cuotas ${money(ex.totalCuotas)}`),
      h('div', { class: 'card-sub' }, dias > 0
        ? `Faltan ${dias} día${dias === 1 ? '' : 's'} para el corte: lo que compres hasta el ${fechaCorta(corte)} entra en este pago.`
        : 'Hoy es el corte: lo que compres desde mañana entra en el siguiente pago.'),
      ex.comprasMercado > 0
        ? h('div', { class: 'callout' }, `${money(ex.comprasMercado)} de estas compras son de mercado: el presupuesto de mercado ya las cuenta, así que no se suman dos veces al ingreso mínimo.`)
        : null,
      h('div', { class: 'card-title', style: { marginTop: '6px' } }, 'Compras de este extracto'),
      lista('Aún no hay compras en este extracto. Agrégalas con el botón.', ex.compras.map(filaCompra)),
      h('div', { class: 'card-title', style: { marginTop: '6px' } }, 'Cuotas que entran en este pago'),
      lista('Ninguna cuota entra en este pago.', ex.cuotas.map(filaCuota))));

    // Proyección de pagos
    const proy = proyeccion(t, corte, 8);
    const cats = proy.map((e) => ({
      key: e.pago, label: MESES_C[parse(e.pago).getMonth()] + (parse(e.pago).getMonth() === 0 ? ' ' + String(parse(e.pago).getFullYear()).slice(2) : ''),
      tip: `Pago ${fechaLarga(e.pago)} · corte ${fechaCorta(e.corte)}`,
    }));
    const serie = [{ id: 'cuotas', label: 'Cuotas', color: 'var(--s1)' }, { id: 'compras', label: 'Compras del extracto', color: 'var(--s2)' }];
    const val = (k, sid) => { const e = proy.find((x) => x.pago === k); return sid === 'cuotas' ? e.totalCuotas : e.totalCompras; };
    cards.push(card({ titulo: 'Próximos pagos de la tarjeta', sub: 'Cuotas ya comprometidas + compras que registres', clase: 'w3' },
      (host) => stackedColumns(host, { cats, series: serie, val, alto: 260 }),
      () => ({ cab: ['Pago', 'Cuotas', 'Compras', 'Total'], filas: proy.map((e) => [fechaLarga(e.pago), money(e.totalCuotas), money(e.totalCompras), money(e.total)]) })));

    // Compras a cuotas activas
    const activos = t.planes.map((p) => ({ p, e: estadoPlan(p, corte) })).filter((x) => !x.e.terminada);
    const porPagar = sum(activos, (x) => x.e.porPagar);
    cards.push(h('section', { class: 'card w6' },
      h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Compras a cuotas activas'),
        h('div', { class: 'card-sub' }, `Te quedan ${money(porPagar)} por pagar en cuotas (cuota × cuotas restantes, sin contar intereses nuevos).`))),
      activos.length
        ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Concepto'), h('th', { class: 'r' }, 'Cuota'), h('th', { class: 'r' }, 'Próxima'), h('th', { class: 'r' }, 'Restan'), h('th', { class: 'r' }, 'Por pagar'), h('th', { class: 'r' }, 'Tasa M.V.'), h('th'))),
          h('tbody', {}, activos.map(({ p, e }) => h('tr', {},
            h('td', {}, p.concepto), h('td', { class: 'r' }, money(p.cuota)), h('td', { class: 'r' }, `${e.nActual} de ${p.cuotas}`),
            h('td', { class: 'r' }, String(e.restantes)), h('td', { class: 'r' }, money(e.porPagar)), h('td', { class: 'r' }, p.tasaMV ? tasaTxt(p.tasaMV) : '—'),
            h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + p.concepto, onclick: () => modalPlan(t, p) }, '✎')))))))
        : h('div', { class: 'muted' }, 'No hay compras a cuotas activas. Al agregar una compra con más de 1 cuota aparece aquí.')));
  }

  // Créditos de cuota fija
  for (const c of state.data.creditos) {
    const am = amortizacion(c.saldo, c.tasaMV, c.cuota);
    const mes = hoy.slice(0, 7);
    const inst = state.data.movimientos.find((m) => m.categoria === 'carro' && c.id === 'carro' && (m.mes || m.fecha.slice(0, 7)) === mes);
    const pagadaEsteMes = inst && inst.estado === 'pagado';
    const proxMes = pagadaEsteMes ? addMonths(hoy, 1).slice(0, 7) : mes;
    const proxFecha = `${proxMes}-${String(Math.min(c.diaPago, 28)).padStart(2, '0')}`;
    const fin = am.restantes ? addMonths(proxFecha, am.restantes - 1).slice(0, 7) : null;
    cards.push(h('section', { class: 'card w6' },
      h('div', { class: 'card-head' },
        h('div', {}, h('div', { class: 'card-title' }, c.nombre), h('div', { class: 'card-sub' }, `Cuota fija · se paga el ${c.diaPago} de cada mes`)),
        h('button', { class: 'btn', onclick: () => modalCredito(c) }, 'Editar datos')),
      h('div', { class: 'min-grid' },
        h('div', { class: 'stack', style: { gap: '6px' } },
          h('div', { class: 'card-sub' }, 'Cuota mensual'),
          h('div', { class: 'tile-value num', style: { fontSize: '30px' } }, money(c.cuota)),
          h('div', { class: 'list-item' }, h('div', { class: 'name' }, 'Pago total (saldo)'), h('span', { class: 'amt num' }, money(c.saldo))),
          c.saldoFecha ? h('div', { class: 'card-sub' }, `Según el banco al ${fechaLarga(c.saldoFecha)}`) : null,
          h('div', { class: 'list-item' }, h('div', { class: 'name' }, 'Tasa'), h('span', { class: 'amt num' }, `${tasaTxt(c.tasaMV)} M.V.${c.tasaEA ? ' · ' + tasaTxt(c.tasaEA) + ' E.A.' : ''}`)),
          c.primeraCuota ? h('div', { class: 'list-item' }, h('div', { class: 'name' }, 'Primera cuota'), h('span', { class: 'amt' }, fechaLarga(c.primeraCuota))) : null,
          h('div', { class: 'list-item' }, h('div', { class: 'name' }, pagadaEsteMes ? `Cuota de ${monthName(mes + '-01').split(' ')[0].toLowerCase()}` : 'Cuota de este mes'),
            h('span', { class: 'amt' }, pagadaEsteMes ? '✓ Pagada' : (inst ? 'Pendiente' : 'No incluida en Recurrentes'))),
          h('div', { class: 'card-sub' }, `Próxima cuota: ${fechaLarga(proxFecha)}`)),
        h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'card-title' }, 'Cómo se reparte tu cuota (estimado)'),
          h('div', { class: 'list-item' }, h('div', {}, h('div', { class: 'name' }, 'Intereses del mes'), h('div', { class: 'meta' }, `${tasaTxt(c.tasaMV)} sobre el saldo`)), h('span', { class: 'amt num' }, money(am.interes))),
          h('div', { class: 'list-item' }, h('div', {}, h('div', { class: 'name' }, 'Abono a capital'), h('div', { class: 'meta' }, 'Lo que realmente baja la deuda')), h('span', { class: 'amt num' }, money(am.capital))),
          am.restantes
            ? h('div', { class: 'callout' }, `Con esta cuota y tasa te quedan unas ${am.restantes} cuotas${fin ? ' (hasta ' + monthName(fin + '-01').toLowerCase() + ')' : ''}. Es un cálculo aproximado: el banco puede diferir por seguros o fechas.`)
            : h('div', { class: 'callout' }, 'Con esta cuota no se alcanza a cubrir el interés: revisa el saldo y la tasa.'),
          c.nota ? h('div', { class: 'card-sub' }, c.nota) : null))));
  }

  if (!cards.length) cards.push(h('section', { class: 'card w6' }, h('div', { class: 'empty' }, 'Aún no hay tarjetas ni créditos configurados.')));
  root.replaceChildren(h('div', { class: 'grid' }, ...cards));
}
