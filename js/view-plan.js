// Pestaña Plan del mes: cuánta plata hay hoy, cuánta entra y cuándo, a dónde se va (mercado, hormiga, rutinas,
// compromisos, pagos) y cuánto se puede gastar en cada compromiso, por quincenas y fecha a fecha.
import {
  h, money, uid, todayISO, addDays, dayShort, monthName, pct,
} from './util.js';
import {
  state, hooks, planCaja, saveCuentaDinero, delCuentaDinero, setPlanConfig, saveCompromiso, compromisoGastado, compromisosPorAjustar, atribuido, netoCompra, saveRutina, delRutina, setPlanMaximo, marcaPago, gmfDe,
} from './store.js';
import { modal, field, moneyInput, select, toast } from './ui.js';
import { card, lineaSaldo } from './charts.js';
import { movForm, ingresoForm, editarMov } from './view-lists.js';
import { pagarMov, avisoCuenta, movimientoHoy } from './cuentas-enlace.js';
import { addIngreso, addMov, recordarCuenta } from './store.js';
import { TIPOS_COMPROMISO, abrirGastoReal } from './view-compromisos.js';

const CLASES = {
  ingreso: 'Ingreso', fijo: 'Pago recurrente', mercado: 'Mercado', compromiso: 'Compromiso',
};
const DIAS_SEM = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const tipoLabel = (v) => TIPOS_COMPROMISO.find((x) => x.value === v)?.label || 'Otro';

function modalCuenta(c) {
  const nueva = !c;
  c = c || { id: uid(), nombre: '', saldo: 0, fecha: todayISO() };
  const fNombre = h('input', { type: 'text', value: c.nombre, placeholder: 'Ej. Bancolombia, BBVA, Nequi, Efectivo' });
  const fSaldo = moneyInput(c.saldo);
  const fGmf = h('input', { type: 'checkbox', checked: !!c.gmf });
  modal(nueva ? 'Nueva cuenta o billetera' : 'Editar cuenta', [
    field('Nombre', fNombre, 'full'), field('Saldo de hoy', fSaldo, 'full'),
    h('label', { class: 'switch full' }, fGmf, 'Esta cuenta cobra el 4x1000: se suma a lo que se descuenta en los pagos nuevos'),
  ], {
    onSave: () => {
      if (!fNombre.value.trim()) return 'Escribe el nombre.';
      saveCuentaDinero({ ...c, nombre: fNombre.value.trim(), saldo: fSaldo.getValue(), fecha: todayISO(), gmf: fGmf.checked || undefined });
      hooks.rerender();
    },
    peligro: nueva ? null : { label: 'Eliminar', fn: () => { delCuentaDinero(c.id); hooks.rerender(); } },
  });
}

function modalRutina(r) {
  const nueva = !r;
  r = r || { id: uid(), nombre: '', categoria: 'comida-rapida', tipo: 'hormiga', monto: 0, dia: 4, activo: true };
  const catsDe = (tipo) => state.data.categorias.filter((c) => c.tipo === tipo).map((c) => ({ value: c.id, label: c.nombre }));
  const fNombre = h('input', { type: 'text', value: r.nombre, placeholder: 'Ej. Domicilios del domingo' });
  const fTipo = select([{ value: 'hormiga', label: 'Hormiga (antojos, comida rápida, domicilios)' }, { value: 'variable', label: 'Variable (parqueadero, gasolina…)' }], r.tipo);
  const catWrap = h('div', {});
  let fCat = select(catsDe(r.tipo), r.categoria);
  catWrap.append(fCat);
  fTipo.addEventListener('change', () => { fCat = select(catsDe(fTipo.value), catsDe(fTipo.value)[0]?.value); catWrap.replaceChildren(fCat); });
  const fMonto = moneyInput(r.monto);
  const fFrec = select([{ value: 'semanal', label: 'Cada semana, el mismo día' }, { value: 'cada', label: 'Cada cierto número de días' }], r.cadaDias ? 'cada' : 'semanal');
  const fDia = select(DIAS_SEM.map((n, i) => ({ value: String(i), label: n })), String(r.dia ?? 0));
  const fCada = h('input', { type: 'number', min: 1, max: 60, step: 0.5, value: r.cadaDias || 10 });
  const fProximo = h('input', { type: 'date', value: r.proximo || todayISO() });
  const lDia = field('Qué día de la semana', fDia);
  const lCada = field('Cada cuántos días (semana y media = 10,5)', fCada);
  const lProximo = field('Próxima vez', fProximo);
  const ajustar = () => { const c = fFrec.value === 'cada'; lDia.classList.toggle('hidden', c); lCada.classList.toggle('hidden', !c); lProximo.classList.toggle('hidden', !c); };
  fFrec.addEventListener('change', ajustar);
  ajustar();
  const fOcasional = h('input', { type: 'checkbox', checked: !!r.ocasional });
  const fActivo = h('input', { type: 'checkbox', checked: r.activo !== false });
  modal(nueva ? 'Gasto que se repite cada semana' : 'Editar gasto semanal', [
    field('Nombre', fNombre, 'full'), field('Tipo', fTipo, 'full'), field('Categoría', catWrap), field('Valor aproximado por vez', fMonto), field('Frecuencia', fFrec, 'full'), lDia, lCada, lProximo,
    h('label', { class: 'switch full' }, fOcasional, 'Es ocasional ("a veces"): solo cuenta si planeas con el máximo'),
    h('label', { class: 'switch full' }, fActivo, 'Tenerlo en cuenta en el plan'),
  ], {
    onSave: () => {
      if (!fNombre.value.trim()) return 'Escribe el nombre.';
      if (!fMonto.getValue()) return 'Escribe el valor.';
      const cada = fFrec.value === 'cada';
      const nueva = {
        ...r, nombre: fNombre.value.trim(), tipo: fTipo.value, categoria: fCat.value, monto: fMonto.getValue(),
        ocasional: fOcasional.checked || undefined, activo: fActivo.checked,
      };
      if (cada) {
        if (!fProximo.value) return 'Elige la fecha de la próxima vez.';
        nueva.cadaDias = Number(fCada.value) || 10; nueva.proximo = fProximo.value; delete nueva.dia;
      } else {
        nueva.dia = Number(fDia.value); delete nueva.cadaDias; delete nueva.proximo;
      }
      saveRutina(nueva);
      hooks.rerender();
    },
    peligro: nueva ? null : { label: 'Eliminar', fn: () => { delRutina(r.id); hooks.rerender(); } },
  });
}

// Registrar plata recibida desde el mismo plan: se elige la cuenta y "Tengo hoy" sube de una vez.
function modalIngresoRapido(ini = {}, extra = {}) {
  const f = ingresoForm(ini);
  modal(ini.fuente ? 'Recibí el pago de ' + ini.fuente : 'Registrar plata recibida', f.nodes, {
    guardar: 'Registrar',
    onSave: () => {
      const r = f.read();
      if (typeof r === 'string') return r;
      addIngreso({ ...r, ...extra });
      recordarCuenta('ingreso', r.fuente, r.cuentaId);
      toast(avisoCuenta('ingreso', r.monto, r.cuentaId) || 'Ingreso registrado');
      hooks.rerender();
    },
  });
}
// Registrar un gasto desde el mismo plan: se elige la cuenta y "Tengo hoy" baja de una vez.
function modalGastoRapido() {
  const f = movForm({});
  modal('Registrar un gasto', f.nodes, {
    guardar: 'Registrar',
    onSave: () => {
      const r = f.read();
      if (typeof r === 'string') return r;
      if (r.financiado) { toast(r.financiado()); hooks.rerender(); return; }
      const mov = addMov(r);
      recordarCuenta('gasto', r.concepto, mov.cuentaId);
      toast(avisoCuenta('gasto', r.monto, mov.cuentaId, mov) || 'Gasto registrado');
      hooks.rerender();
    },
  });
}

export function renderPlan(root) {
  const p = planCaja();
  const mesN = monthName(p.mes + '-01').split(' ')[0].toLowerCase();
  const porPagar = p.fijosPend + p.mercadoRest; // solo lo obligatorio: pagos recurrentes y mercado
  const pagosMes = p.fijosPend;

  // ---- Lo primero: cuánto tengo, cuánto espero recibir y cuánto sí o sí falta por pagar ----
  const diaFin = Number(p.corte.slice(8)); // día en que entra el pago grande (el 30): ya es del mes siguiente
  const hastaDia = Number(p.finGasto.slice(8)); // último día que cubre el plan (el 29)
  const stat = (label, valor, sub) => h('div', { class: 'stat' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value num' }, money(valor)), sub ? h('div', { class: 'card-sub num' }, sub) : null);
  const grande = (valor, mal) => h('div', { class: 'hero-value num' + (mal ? ' neg' : ''), style: { fontSize: '34px' } }, money(valor));
  const fila = (nombre, meta, valor, accion) => h('div', { class: 'list-item' },
    h('div', {}, h('div', { class: 'name' }, nombre), meta || accion ? h('div', { class: 'meta' }, meta, accion || null) : null),
    h('span', { class: 'amt num' }, money(valor)));

  const filaCuenta = (c) => {
    const inp = moneyInput(c.saldo, { 'aria-label': 'Saldo de ' + c.nombre, class: 'mny' });
    inp.addEventListener('change', () => { saveCuentaDinero({ ...c, saldo: inp.getValue(), fecha: todayISO() }); hooks.rerender(); });
    // Lo que movió este saldo en los últimos días (cada gasto se abre para corregirlo): para ver de dónde sale cada diferencia.
    const desde = addDays(todayISO(), -7);
    const movs = [
      ...state.data.movimientos.filter((m) => m.estado === 'pagado' && m.cuentaId === c.id && m.fecha >= desde).map((m) => ({ m, signo: -1, texto: m.concepto })),
      ...state.data.ingresos.filter((i) => i.cuentaId === c.id && i.fecha >= desde).map((i) => ({ m: i, signo: 1, texto: i.fuente })),
    ].sort((a, b) => marcaPago(b.m).localeCompare(marcaPago(a.m))).slice(0, 15);
    const detalle = movs.length ? h('details', { class: 'full' }, h('summary', {}, '¿Qué movió este saldo?'),
      movs.map(({ m, signo, texto }) => h('div', { class: 'list-item' },
        h('div', {}, h('div', { class: 'name' }, texto), h('div', { class: 'meta' }, dayShort(m.fecha) + (m.hora ? ' ' + m.hora : '') + (signo < 0 ? (m.gmf ? ` · incluye ${money(gmfDe(m))} de 4x1000` : '') : ' · ingreso'))),
        signo < 0
          ? h('button', { class: 'btn ghost sm num', title: 'Abrir para corregirlo', onclick: () => editarMov(m) }, '− ' + money(m.monto + gmfDe(m)))
          : h('span', { class: 'amt num' }, '+ ' + money(m.monto))))) : null;
    return h('div', {},
      h('div', { class: 'list-item' },
        h('div', {}, h('div', { class: 'name' }, c.nombre), h('div', { class: 'meta' }, 'Saldo al ' + dayShort(c.fecha) + (movimientoHoy(c.id) ? ' · ' + movimientoHoy(c.id) : '') + (c.gmf ? ' · cobra 4x1000' : ''))),
        h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, inp,
          h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + c.nombre, onclick: () => modalCuenta(c) }, '✎'))),
      detalle);
  };
  const cCuentas = h('section', { class: 'card w2 det', style: '--c: var(--s1)' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Tengo hoy'), h('div', { class: 'card-sub' }, 'Actualiza el saldo cuando quieras')),
      h('button', { class: 'btn sm', onclick: () => modalCuenta() }, '+ Cuenta')),
    grande(p.saldo, p.saldo < 0),
    p.cuentas.length ? h('div', {}, p.cuentas.map(filaCuenta)) : h('div', { class: 'muted' }, 'Agrega tus cuentas y billeteras para saber con cuánto cuentas hoy.'),
    h('div', { class: 'card-sub' }, 'Este saldo se mueve solo: sube con lo que recibes y baja con lo que pagas, según la cuenta que elijas al registrarlo.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm primary', onclick: () => modalIngresoRapido() }, '+ Recibí plata'),
      h('button', { class: 'btn sm', onclick: () => modalGastoRapido() }, '+ Registré un gasto')));

  const ingresosLista = p.eventos.filter((e) => e.clase === 'ingreso');
  const cRecibir = h('section', { class: 'card w2 det', style: '--c: var(--s3)' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Espero recibir'), h('div', { class: 'card-sub' }, `Hasta el ${hastaDia} de ${mesN}, con su fecha`))),
    grande(p.ingresosPend),
    p.proximo.entra > 0 ? h('div', { class: 'card-sub num' }, `Lo que entra el ${diaFin} (${money(p.proximo.entra)}) ya es de ${p.sigNombre}: no cuenta para ${mesN}.`) : null,
    ingresosLista.length
      ? h('div', {}, ingresosLista.map((e) => fila(e.concepto, dayShort(e.fecha) + (e.aprox ? ' · fecha aproximada' : ''), e.monto,
        h('button', { class: 'btn ghost sm', title: 'Registrar que ya lo recibí y elegir la cuenta', onclick: () => modalIngresoRapido({ fuente: e.fuente || e.concepto, monto: e.monto, centro: e.centro }, { mesPlan: e.mesPlan }) }, 'Ya lo recibí'))))
      : h('div', { class: 'muted' }, 'No hay ingresos pendientes. Agrégalos en la pestaña Ingresos.'));

  const pagosLista = p.eventos.filter((e) => e.clase === 'fijo');
  const nPagosMes = pagosLista.length;
  const cPagar = h('section', { class: 'card w2 det', style: '--c: var(--s2)' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Falta por pagar'), h('div', { class: 'card-sub' }, 'Lo que sí o sí hay que pagar'))),
    grande(porPagar),
    h('div', {},
      pagosMes > 0 ? fila(`Pagos recurrentes de ${mesN}`, `${nPagosMes} pago${nPagosMes === 1 ? '' : 's'}`, pagosMes) : null,
      fila('Mercado que falta', `Presupuesto ${money(p.mercado.presupuesto)} − ya gastado ${money(p.mercado.gastado)}`, p.mercadoRest)),
    pagosLista.length ? h('details', {}, h('summary', {}, 'Ver cada pago'),
      pagosLista.map((e) => fila(e.concepto, dayShort(e.fecha), -e.monto,
        e.movId ? h('button', { class: 'btn ghost sm', title: 'Marcar como pagado y elegir la cuenta', onclick: () => { const mv = state.data.movimientos.find((x) => x.id === e.movId); if (mv) pagarMov(mv); } }, 'Ya lo pagué') : null))) : null,
    p.proximo.sale > 0 ? h('div', { class: 'card-sub num' }, `Los pagos desde el ${diaFin} (${money(p.proximo.sale)}: tarjeta, carro…) se pagan con lo que entra ese día, no con el dinero de ${mesN}.`) : null);

  // ---- La cuenta del mes en una sola mirada: tengo + espero − pago − colchón = puedes gastar, y en qué se va ----
  const colInp = h('input', { type: 'number', min: 0, max: 50, value: p.colchonPct, 'aria-label': 'Colchón de seguridad en porcentaje' });
  colInp.addEventListener('change', () => { setPlanConfig({ colchonPct: Math.max(0, Math.min(50, Number(colInp.value) || 0)) }); hooks.rerender(); });
  const diaCorteInp = h('input', { type: 'number', min: 2, max: 31, value: p.diaCorte, 'aria-label': 'Día desde el que lo que entra ya es del mes siguiente' });
  diaCorteInp.addEventListener('change', () => { setPlanConfig({ diaCorte: Math.max(2, Math.min(31, Number(diaCorteInp.value) || 30)) }); hooks.rerender(); });
  const maxChk = h('input', { type: 'checkbox', checked: p.conMaximo });
  maxChk.addEventListener('change', () => { setPlanMaximo(maxChk.checked); hooks.rerender(); });
  const neg = p.paraGastar < 0;
  const nodo = (lbl, val, sub, color, extra = '') => h('div', { class: 'node' + extra, style: color ? '--c:' + color : null },
    h('div', { class: 'lbl' }, lbl), h('div', { class: 'val num' }, money(val)), sub ? h('div', { class: 'sub' }, sub) : null);
  const op = (txt) => h('span', { class: 'op', 'aria-hidden': 'true' }, txt);
  const conPres = p.compromisos.filter((x) => x.presupuesto > 0).length;
  const partes = [
    { label: 'Tu hormiga y rutinas', valor: p.rutinaEsperada, color: 'var(--s2)', sub: `Lo que sueles gastar hasta el ${hastaDia}` },
    { label: 'Compromisos presupuestados', valor: p.asignado, color: 'var(--s1)', sub: `${conPres} de ${p.compromisos.length} tienen presupuesto (abajo lo cambias)` },
    { label: 'Te queda para gustos', valor: p.gustos, color: 'var(--s3)', sub: 'Ocio, gustos y lo que quieras comprar' },
  ];
  const totalBarra = Math.max(partes.reduce((a, x) => a + Math.max(0, x.valor), 0), 1);
  const cNumeros = h('section', { class: 'card w6 flow-card' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, `La cuenta de ${mesN}`),
      h('div', { class: 'card-sub' }, `Solo cuenta lo que entra y se paga hasta el ${hastaDia}: lo que entra el ${diaFin} ya es de ${p.sigNombre}.`)),
    neg ? h('span', { class: 'status crit' }, '▲ No alcanza') : p.gustos < 0 ? h('span', { class: 'status crit' }, '▲ Te pasas') : h('span', { class: 'status' }, '✓ Alcanza')),
    h('div', { class: 'flow' },
      nodo('Tengo hoy', p.saldo, `${p.cuentas.length} cuenta${p.cuentas.length === 1 ? '' : 's'}`, 'var(--s1)'), op('+'),
      nodo('Espero recibir', p.ingresosPend, `Hasta el ${hastaDia}`, 'var(--s3)'), op('−'),
      nodo('Falta por pagar', porPagar, 'Pagos recurrentes y mercado', 'var(--s2)'), op('−'),
      nodo(`Colchón (${p.colchonPct}%)`, p.colchon, 'Por si algo cambia', 'var(--muted)'), op('='),
      nodo('Puedes gastar', p.paraGastar, 'Hormiga, compromisos y gustos', null, ' result')),
    h('div', { class: 'split' },
      h('div', { class: 'tile-label' }, '¿En qué se va lo que puedes gastar?'),
      h('div', { class: 'split-bar', role: 'img', 'aria-label': partes.map((x) => `${x.label}: ${money(x.valor)}`).join(', ') },
        partes.filter((x) => x.valor > 0).map((x) => h('i', { style: { flex: String(x.valor / totalBarra), background: x.color }, title: `${x.label}: ${money(x.valor)}` }))),
      h('div', { class: 'split-legend' }, partes.map((x) => h('div', { class: 'it' },
        h('i', { class: 'sw', style: { background: x.color } }),
        h('div', {}, h('div', { class: 'name' }, x.label), h('div', { class: 'big num' + (x.valor < 0 ? ' neg' : '') }, money(x.valor)), h('div', { class: 'sub' }, x.sub)))))),
    p.gustos < 0 ? h('span', { class: 'status crit' }, `▲ Tu hormiga y tus compromisos pasan lo que puedes gastar por ${money(-p.gustos)}: recorta alguno o espera más ingresos.`) : null,
    h('div', { class: 'card-sub' }, 'Hormiga, compromisos y gustos los puedes variar: cambia un presupuesto o una rutina y "te queda para gustos" se actualiza. Lo que ya pagaste en hormiga no se resta: ya está en tu saldo.'),
    h('details', { class: 'ajustes-plan' }, h('summary', {}, 'Ajustes del plan'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'f' }, 'Colchón de seguridad (%)', colInp),
        h('label', { class: 'f' }, 'Lo que entra desde el día… ya es del mes siguiente', diaCorteInp)),
      h('label', { class: 'switch' }, maxChk, 'Contar también lo ocasional en mi rutina (como el domicilio del domingo)')));

  // ---- Mercado: cuánto falta por gastar ----
  const M = p.mercado;
  const ratioM = M.presupuesto > 0 ? Math.min(1, M.gastado / M.presupuesto) : 0;
  const porCompra = M.veces > 0 ? M.falta / M.veces : 0;
  const cMercado = h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, `Mercado de ${mesN}: ¿cuánto nos falta por gastar?`),
      h('div', { class: 'card-sub' }, 'Presupuesto del mes − lo que ya compraste = lo que falta. Lo que ya gastaste no se vuelve a contar en lo que falta.')),
    h('button', { class: 'btn', onclick: () => hooks.goTab('ajustes') }, 'Cambiar el presupuesto')),
    h('div', { class: 'stats' },
      stat('Presupuesto del mes', M.presupuesto, M.origen ? M.origen.charAt(0).toUpperCase() + M.origen.slice(1) : null),
      stat('Ya gastado', M.gastado, `${M.compras.length} compra${M.compras.length === 1 ? '' : 's'} este mes`),
      M.enTarjeta > 0 ? stat('Ya va en la tarjeta', M.enTarjeta, 'Está dentro del pago de la tarjeta') : null,
      stat('Falta por gastar ≈', M.falta, M.falta > 0 && M.veces > 0 ? `≈ ${money(porCompra)} en cada una de las ${M.veces} compras que quedan (sábados)` : 'Ya llegaste al presupuesto')),
    M.presupuesto > 0 ? h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': Math.round(ratioM * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('i', { style: { width: ratioM * 100 + '%' } })) : null,
    h('div', { class: 'card-sub num' }, M.presupuesto > 0 ? `Llevas ${pct(ratioM)} del presupuesto de mercado.` : 'Define un presupuesto o agrega el historial de mercado para estimar lo que falta.'),
    M.compras.length ? h('div', {}, M.compras.map((m) => h('div', { class: 'list-item' },
      h('div', {}, h('div', { class: 'name' }, m.concepto),
        h('div', { class: 'meta' }, dayShort(m.fecha) + (m.medio ? ' · ' + m.medio : '') + (atribuido(m) > 0 ? ` · ${money(atribuido(m))} fueron de un compromiso` : ''))),
      h('span', { class: 'amt num' }, money(netoCompra(m)))))) : null,
    M.falta === 0 && M.presupuesto > 0 ? h('div', { class: 'card-sub' }, 'Si compras más, ese gasto sale de lo que te queda para gustos.') : null);

  // ---- El mes en orden de fechas: cada ingreso, pago y compromiso, por quincena ----
  const celdaSaldo = (v) => h('td', { class: 'r', style: v < 0 ? { color: 'var(--crit-ink)', fontWeight: 650 } : {} }, (v < 0 ? '▲ ' : '') + money(v));
  const filasPeriodo = (q) => {
    const lineas = p.eventos.filter((e) => e.fecha >= q.desde && e.fecha <= q.hasta);
    const entra = q.ingresos;
    const sale = q.fijos + q.mercado + q.compromisos;
    const mesQ = monthName(q.hasta).split(' ')[0].toLowerCase();
    const titulo = `Del ${Number(q.desde.slice(8))} al ${Number(q.hasta.slice(8))} de ${mesQ}`;
    return [
      h('tr', { class: 'periodo' }, h('td', { colspan: 4 },
        h('b', {}, titulo),
        h('div', { class: 'card-sub num' }, `Empiezas con ${money(q.inicio)} · entra ${money(entra)} · sale ${money(sale)} · terminas con ${money(q.final)} · punto más bajo ${money(q.minimo)}`))),
      ...lineas.map((e) => {
        const cx = e.sinPresupuesto ? p.compromisos.find((x) => x.c.id === e.cid) : null;
        return h('tr', {},
          h('td', { class: 'num' }, dayShort(e.fecha)),
          h('td', {}, e.concepto, h('div', { class: 'card-sub' }, CLASES[e.clase] + (e.aprox ? ' · fecha aproximada' : '') + (cx ? ` · sin presupuesto (máximo ${money(cx.maximo)})` : ''))),
          cx ? h('td', { class: 'r muted' }, '—') : h('td', { class: 'r', style: e.monto > 0 ? { color: 'var(--good)' } : {} }, (e.monto > 0 ? '+ ' : '− ') + money(Math.abs(e.monto))),
          celdaSaldo(e.saldo));
      }),
      q.rutina > 0 ? h('tr', { class: 'estimado' }, h('td'), h('td', {}, 'Tu hormiga y rutinas (estimado)', h('div', { class: 'card-sub' }, 'No se resta aquí: sale de lo que puedes gastar')), h('td', { class: 'r' }, '− ' + money(q.rutina)), h('td')) : null,
    ];
  };
  // Lo que entra y se paga desde el día de corte: se ve, pero ya es del mes siguiente.
  const filasProx = () => {
    const X = p.proximo;
    if (!X.eventos.length) return [];
    return [
      h('tr', { class: 'periodo' }, h('td', { colspan: 4 },
        h('b', {}, `Desde el ${diaFin}: ya es de ${p.sigNombre}`),
        h('div', { class: 'card-sub num' }, `Entra ${money(X.entra)}${X.sale > 0 ? ` · salen ${money(X.sale)} de pagos del 1 al 5` : ''} · ${p.sigNombre} arranca con ${money(X.inicio)}. Esto no cuenta para gastar en ${mesN}.`))),
      ...X.eventos.map((e) => h('tr', { class: 'estimado' },
        h('td', { class: 'num' }, dayShort(e.fecha)),
        h('td', {}, e.concepto, h('div', { class: 'card-sub' }, CLASES[e.clase])),
        h('td', { class: 'r' }, (e.monto > 0 ? '+ ' : '− ') + money(Math.abs(e.monto))),
        celdaSaldo(e.saldo))),
    ];
  };
  const cFechas = h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, `El mes en orden de fechas`),
      h('div', { class: 'card-sub' }, `Cada ingreso y pago con su día y cuánto queda en cuentas. Empiezas hoy (${dayShort(p.hoy)}) con ${money(p.saldo)}; hasta el ${hastaDia} terminas con ${money(p.finMes)}.`))),
    h('div', { class: 'callout' }, `Tu punto más bajo hasta el ${hastaDia} es ${money(p.minimo.valor)} (${dayShort(p.minimo.fecha)}). No cuenta lo que entra el ${diaFin}: eso ya es de ${p.sigNombre}.`),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Fecha'), h('th', {}, 'Qué'), h('th', { class: 'r' }, 'Monto'), h('th', { class: 'r' }, 'Queda en cuentas'))),
      h('tbody', {}, ...p.quincenas.flatMap(filasPeriodo), ...filasProx()))),
    h('div', { class: 'card-sub' }, 'Estos saldos no descuentan tu hormiga ni tus rutinas: eso sale de lo que puedes gastar.'));

  // ---- Gastos que se repiten cada semana ----
  const filaRut = (x) => h('tr', {},
    h('td', {}, h('b', {}, x.r.nombre), x.r.activo === false ? h('div', { class: 'card-sub' }, 'Pausado') : null,
      x.cumplidaHoy ? h('div', { class: 'card-sub' }, '✓ Hoy ya lo gastaste: no se vuelve a contar') : null),
    h('td', {}, x.r.tipo === 'hormiga' ? 'Hormiga' : 'Variable'),
    h('td', {}, x.r.cadaDias ? `Cada ${String(x.r.cadaDias).replace('.', ',')} días (próxima ${dayShort(x.r.proximo)})` : DIAS_SEM[x.r.dia]),
    h('td', { class: 'r' }, money(x.r.monto)),
    h('td', {}, x.r.ocasional ? 'A veces' : 'Siempre'),
    h('td', { class: 'r' }, String(x.veces)),
    h('td', { class: 'r' }, money(x.total)),
    h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + x.r.nombre, onclick: () => modalRutina(x.r) }, '✎')));
  const cRutinas = h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, 'Tu hormiga y rutinas de la semana'),
      h('div', { class: 'card-sub' }, `Lo que sueles gastar cada semana. No es un pago obligatorio: sale de lo que puedes gastar. Hasta el ${hastaDia}: hormiga normal ${money(p.hormigaNormal)}, máxima ${money(p.hormigaNormal + p.hormigaOcasional)}.`)),
    h('button', { class: 'btn primary', onclick: () => modalRutina() }, '+ Agregar gasto semanal')),
    p.rutinas.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Gasto', 'Tipo', 'Día'].map((t) => h('th', {}, t)), h('th', { class: 'r' }, 'Valor'), h('th', {}, 'Frecuencia'), h('th', { class: 'r' }, `Veces hasta el ${hastaDia}`), h('th', { class: 'r' }, 'Total'), h('th'))),
        h('tbody', {}, p.rutinas.map(filaRut))))
      : h('div', { class: 'muted' }, 'Agrega lo que gastas cada semana (comida rápida, domicilios, parqueadero…) y verás cuánto de lo que puedes gastar se va en eso.'));

  // ---- Compromisos: tú pones el presupuesto; lo que sobra es lo que tienes de más por si alguno necesita más dinero ----
  const filaComp = (x) => {
    const c = x.c;
    const gastado = compromisoGastado(c.id);
    const inp = moneyInput(c.presupuesto || 0, { 'aria-label': 'Presupuesto de ' + c.nombre, class: 'mny' });
    inp.addEventListener('change', () => { saveCompromiso({ ...c, presupuesto: inp.getValue() }); hooks.rerender(); });
    return h('tr', {},
      h('td', {}, h('b', {}, c.nombre), h('div', { class: 'card-sub' }, tipoLabel(c.tipo))),
      h('td', {}, dayShort(c.fecha) + (c.fechaFin ? ' – ' + dayShort(c.fechaFin) : '')),
      h('td', { class: 'r' }, inp),
      h('td', { class: 'r' }, gastado > 0 ? money(gastado) : '—'));
  };
  const porAjustar = compromisosPorAjustar();
  const cComp = h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, `¿Cuánto presupuesto en cada compromiso de ${mesN}?`),
      h('div', { class: 'card-sub' }, 'Tú decides cuánto poner en cada uno y lo puedes cambiar cuando quieras.')),
    h('button', { class: 'btn', onclick: () => hooks.goTab('compromisos') }, 'Ver todos los compromisos')),
    porAjustar.length ? h('div', { class: 'callout' },
      h('b', {}, porAjustar.length === 1 ? 'Ya pasó un compromiso: ¿cuánto se gastó de verdad?' : 'Ya pasaron compromisos: ¿cuánto se gastó de verdad?'),
      h('div', { class: 'card-sub' }, 'Escribe lo real: lo que no estaba pagado en otra compra sale de la cuenta que elijas, y el plan y tus saldos quedan al día.'),
      porAjustar.map((c) => h('div', { class: 'list-item' },
        h('div', {}, h('div', { class: 'name' }, c.nombre), h('div', { class: 'meta' }, `${dayShort(c.fecha)} · registrado ${money(compromisoGastado(c.id))}${c.presupuesto > 0 ? ' · presupuesto ' + money(c.presupuesto) : ''}`)),
        h('button', { class: 'btn sm', onclick: () => abrirGastoReal(c) }, 'Poner gasto real')))) : null,
    p.compromisos.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Compromiso'), h('th', {}, 'Fecha'), h('th', { class: 'r' }, 'Tu presupuesto'), h('th', { class: 'r' }, 'Ya gastado'))),
        h('tbody', {}, p.compromisos.map(filaComp)),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, 'Presupuestado (lo que falta por gastar)'), h('td', { class: 'r' }, money(p.asignado)), h('td')))))
      : h('div', { class: 'muted' }, `No hay compromisos pendientes en ${mesN}. Agrégalos en la pestaña Compromisos.`),
    p.deMas >= 0
      ? h('div', { class: 'callout' }, h('b', { class: 'num' }, `Tienes ${money(p.deMas)} de más`), ' por si algún compromiso necesita más dinero. Si uno se pasa, lo anotas cuando pongas su gasto real y sale de ahí.')
      : h('div', { class: 'callout' }, h('span', { class: 'status crit' }, `▲ Te faltan ${money(-p.deMas)}: tu hormiga y tus presupuestos pasan lo que puedes gastar.`)),
    h('div', { class: 'card-sub' }, 'Los compromisos de diciembre (aniversario, grado…) se planean con el dinero de diciembre: míralos en la pestaña Compromisos.'));

  // ---- Saldo día a día (el gráfico) ----
  const porFecha = new Map();
  for (const e of p.eventos) { if (!porFecha.has(e.fecha)) porFecha.set(e.fecha, []); porFecha.get(e.fecha).push(e); }
  const puntosSaldo = [{ fecha: p.hoy, saldo: p.saldo, eventos: [] }, ...[...porFecha].map(([fecha, evs]) => ({ fecha, saldo: evs[evs.length - 1].saldo, eventos: evs }))];
  const cSaldo = card({
    titulo: 'Tu saldo, día a día',
    sub: `Cuánto queda en tus cuentas después de cada ingreso y pago hasta el ${hastaDia}. Pasa el cursor por un punto para ver qué pasó ese día.`,
    clase: 'w6',
  }, (host) => lineaSaldo(host, { puntos: puntosSaldo, desde: p.hoy, hasta: p.finGasto, colchon: p.colchon }),
  () => ({ cab: ['Día', 'Queda en cuentas'], filas: puntosSaldo.map((x) => [dayShort(x.fecha), money(x.saldo)]) }));

  root.replaceChildren(h('div', { class: 'grid' }, cNumeros, cSaldo, cCuentas, cRecibir, cPagar, cComp, cFechas, cMercado, cRutinas));
}
