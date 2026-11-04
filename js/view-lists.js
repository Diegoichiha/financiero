// Pantallas de captura: Recurrentes (elegir y pagar), Movimientos (variables y hormiga) e Ingresos.
import {
  h, money, num, uid, todayISO, monthEnd, addMonths, dayShort, monthName, pad, download, pct,
} from './util.js';
import {
  state, TIPOS, TIPO, hooks, curMes, curRange, visibleMovs, visibleIngresos, sum, categoria, centroNombre, cuentaById,
  instancia, incluirPlantilla, quitarPlantilla, fechaPlantilla, savePlantilla, delPlantilla, marcarPagado, ingresoMinimo,
  addMov, updateMov, delMov, addIngreso, updateIngreso, delIngreso, saveFuente, delFuente, save,
  planGasto, setEsperado, addEsperado, delEsperado, setCobros,
} from './store.js';
import { modal, confirmar, field, moneyInput, select, toast, copiar } from './ui.js';
import { medidor } from './charts.js';
import { extractoPagadoEn } from './creditos.js';

const centroOpts = () => state.data.centros.map((c) => ({ value: c.id, label: c.nombre }));
const catOpts = (tipo) => state.data.categorias.filter((c) => !tipo || c.tipo === tipo).map((c) => ({ value: c.id, label: c.nombre }));
const defaultDate = () => {
  const hoy = todayISO();
  const r = curRange();
  return hoy >= r.from && hoy <= r.to ? hoy : r.from;
};
const tipoDot = (t) => h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, h('i', { class: 'dot', style: { background: TIPO[t].cssVar } }), TIPO[t].corto);

// =====================================================================
// RECURRENTES
// =====================================================================
function editarPlantilla(p) {
  const nuevo = !p;
  p = p || { id: uid(), concepto: '', monto: 0, dia: null, categoria: 'servicios', centro: state.centro === 'todos' ? 'hogar' : state.centro, cuenta: '' };
  const fConcepto = h('input', { type: 'text', value: p.concepto, placeholder: 'Ej. Netflix' });
  const fMonto = moneyInput(p.monto);
  const fDia = h('input', { type: 'number', min: 1, max: 31, value: p.dia || '', placeholder: 'Día del mes' });
  const fCat = select(catOpts('recurrente'), p.categoria);
  const fCentro = select(centroOpts(), p.centro);
  const fTarjeta = select([{ value: '', label: 'No es pago de tarjeta' }, ...state.data.tarjetas.map((x) => ({ value: x.id, label: x.nombre }))], p.tarjeta || '');
  const fAuto = h('input', { type: 'checkbox', checked: !!p.auto });
  const fCuenta = select([{ value: '', label: 'Sin cuenta asociada' }, ...state.data.cuentas.map((c) => ({ value: c.id, label: `${c.proveedor} · ${c.referencia}` }))], p.cuenta || '');
  modal(nuevo ? 'Nuevo pago recurrente' : 'Editar pago recurrente', [
    field('Concepto', fConcepto, 'full'), field('Monto estimado', fMonto), field('Día de pago (opcional)', fDia),
    field('Categoría', fCat), field('Centro', fCentro), field('Cuenta para pagar', fCuenta, 'full'), field('Pago de tarjeta (el monto sale de las compras y cuotas)', fTarjeta, 'full'),
    h('label', { class: 'switch full' }, fAuto, 'Incluir automáticamente cada mes (como los créditos)'),
  ], {
    onSave: () => {
      if (!fConcepto.value.trim()) return 'Escribe el concepto.';
      if (!fMonto.getValue()) return 'Escribe el monto estimado.';
      const nueva = { ...p, concepto: fConcepto.value.trim(), monto: fMonto.getValue(), dia: Number(fDia.value) || null, categoria: fCat.value, centro: fCentro.value, cuenta: fCuenta.value, tarjeta: fTarjeta.value };
      if (!nueva.tarjeta) delete nueva.tarjeta;
      nueva.auto = fAuto.checked;
      if (!nueva.auto) delete nueva.auto;
      savePlantilla(nueva);
      hooks.rerender();
    },
    peligro: nuevo ? null : { label: 'Eliminar del catálogo', fn: async () => { delPlantilla(p.id); hooks.rerender(); } },
  });
}

export function renderRecurrentes(root) {
  const mes = curMes();
  const mesIni = mes + '-01';
  const plantillas = state.data.plantillas.filter((pl) => state.centro === 'todos' || pl.centro === state.centro);
  const resumen = h('section', { class: 'card' });

  const stats = () => {
    const inst = plantillas.map((pl) => instancia(pl.id, mes)).filter(Boolean);
    const total = sum(inst);
    const pagado = sum(inst.filter((m) => m.estado === 'pagado'));
    return { n: inst.length, total, pagado, pend: total - pagado };
  };
  const pintarResumen = () => {
    const st = stats();
    resumen.replaceChildren(
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-end' } },
        h('div', {}, h('div', { class: 'card-sub' }, 'Recurrentes de ' + monthName(mesIni)),
          h('div', { class: 'tile-value num' }, money(st.total)),
          h('div', { class: 'card-sub num' }, `${st.n} de ${plantillas.length} incluidos · Pagado ${money(st.pagado)} · Por pagar ${money(st.pend)}`),
          (() => {
            const mn = ingresoMinimo(mes);
            return h('div', { class: 'card-sub num' }, `Ingreso mínimo del mes (recurrentes + mercado): `, h('b', {}, money(mn.total)),
              mn.total > 0 ? ` · mercado ${money(mn.mercado)}` : '');
          })()),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => { plantillas.forEach((pl) => incluirPlantilla(pl, mes)); hooks.rerender(); } }, 'Incluir todos'),
          h('button', { class: 'btn', title: 'Incluye los que tenías el mes anterior', onclick: () => {
            const prev = addMonths(mesIni, -1).slice(0, 7);
            const antes = plantillas.filter((pl) => instancia(pl.id, prev));
            if (!antes.length) { toast('El mes anterior no tiene recurrentes incluidos'); return; }
            antes.forEach((pl) => incluirPlantilla(pl, mes));
            hooks.rerender();
          } }, 'Copiar del mes anterior'),
          h('button', { class: 'btn', onclick: async () => {
            const pend = plantillas.map((pl) => instancia(pl.id, mes)).filter((m) => m && m.estado === 'pendiente');
            if (!pend.length) { toast('No hay pendientes para quitar'); return; }
            if (!(await confirmar(`Quitar ${pend.length} recurrentes pendientes de este mes? Los ya pagados se conservan.`, 'Quitar'))) return;
            plantillas.forEach((pl) => { const m = instancia(pl.id, mes); if (m && m.estado === 'pendiente') quitarPlantilla(pl, mes); });
            hooks.rerender();
          } }, 'Quitar pendientes'),
          h('button', { class: 'btn primary', onclick: () => editarPlantilla() }, '+ Nuevo recurrente'))),
      medidor(st.pagado, st.total, false));
  };
  pintarResumen();

  const grupos = state.data.centros.filter((c) => state.centro === 'todos' || c.id === state.centro);
  const bloques = grupos.map((c) => {
    const lista = plantillas.filter((pl) => pl.centro === c.id);
    if (!lista.length) return null;
    const inc = lista.filter((pl) => instancia(pl.id, mes)).length;
    return h('section', { class: 'card rec-group' },
      h('h3', {}, c.nombre, h('span', { class: 'muted' }, `${inc} de ${lista.length} incluidos este mes`)),
      h('div', { class: 'rec-row rec-head' }, h('span'), h('span', {}, 'Concepto'), h('span', {}, 'Cuenta para pagar'), h('span', {}, 'Día'), h('span', {}, 'Monto'), h('span', {}, 'Estado'), h('span')),
      lista.map((pl) => fila(pl)));
  }).filter(Boolean);

  function fila(pl) {
    const inst = instancia(pl.id, mes);
    const cu = pl.cuenta && cuentaById(pl.cuenta);
    const chk = h('input', { type: 'checkbox', checked: !!inst, 'aria-label': 'Incluir ' + pl.concepto + ' este mes' });
    chk.addEventListener('change', async () => {
      if (chk.checked) { incluirPlantilla(pl, mes); hooks.rerender(); return; }
      if (inst && inst.estado === 'pagado' && !(await confirmar(`"${pl.concepto}" ya está marcado como pagado. ¿Quitarlo de este mes?`, 'Quitar'))) { chk.checked = true; return; }
      quitarPlantilla(pl, mes);
      hooks.rerender();
    });
    const dia = h('input', { type: 'number', min: 1, max: 31, value: pl.dia || '', placeholder: '—', 'aria-label': 'Día de pago de ' + pl.concepto });
    dia.addEventListener('change', () => {
      pl.dia = Math.min(31, Math.max(1, Number(dia.value))) || null;
      const i = instancia(pl.id, mes);
      if (i && i.estado === 'pendiente') i.fecha = fechaPlantilla(pl, mes);
      save();
    });
    const monto = moneyInput(inst ? inst.monto : pl.monto, { class: 'mny', 'aria-label': 'Monto de ' + pl.concepto });
    monto.disabled = !inst;
    // Si es el pago de una tarjeta, el monto sugerido sale del extracto que se paga ese mes.
    const tj = pl.tarjeta && state.data.tarjetas.find((x) => x.id === pl.tarjeta);
    const est = tj ? extractoPagadoEn(tj, mes).total : 0;
    const montoCell = h('div', { class: 'monto-cell' }, monto,
      est > 0 && (!inst || inst.estado === 'pendiente')
        ? (inst && inst.montoManual && Math.round(inst.monto) !== Math.round(est)
          ? h('button', { class: 'btn ghost sm', title: 'Volver a seguir las compras de la tarjeta', onclick: () => { delete inst.montoManual; inst.monto = est; save(); hooks.rerender(); } }, `↻ Seguir tarjeta: ${money(est)}`)
          : h('span', { class: 'card-sub' }, `Según la tarjeta: ${money(est)}`))
        : null);
    monto.addEventListener('change', () => { if (inst) { inst.monto = monto.getValue(); inst.montoManual = true; save(); pintarResumen(); } });
    const estado = inst
      ? h('button', { class: 'btn paid-btn' + (inst.estado === 'pagado' ? ' is-paid' : ''), title: inst.estado === 'pagado' ? 'Clic para volver a pendiente' : 'Marcar como pagado',
        onclick: () => { marcarPagado(inst.id, inst.estado !== 'pagado'); hooks.rerender(); } },
      inst.estado === 'pagado' ? `Pagado ✓ ${dayShort(inst.fecha)}` : 'Marcar pagado')
      : h('span', { class: 'muted' }, 'No incluido');
    return h('div', { class: 'rec-row' + (inst ? '' : ' off') },
      chk,
      h('div', { class: 'nm' }, pl.concepto, h('small', {}, (categoria(pl.categoria)?.nombre || pl.categoria) + (pl.auto ? ' · automático' : ''))),
      h('div', { class: 'acct' }, cu
        ? [h('span', {}, `${cu.proveedor} · ${cu.referencia}`), h('button', { class: 'btn ghost sm', title: 'Copiar número de cuenta', 'aria-label': 'Copiar número de cuenta ' + cu.referencia, onclick: () => copiar(cu.referencia) }, '⧉')]
        : h('span', { class: 'muted' }, '—')),
      h('div', { class: 'dia' }, dia),
      montoCell, estado,
      h('button', { class: 'btn ghost icon', title: 'Editar en el catálogo', 'aria-label': 'Editar ' + pl.concepto, onclick: () => editarPlantilla(pl) }, '✎'));
  }

  root.replaceChildren(h('div', { class: 'stack' },
    resumen,
    ...(bloques.length ? bloques : [h('section', { class: 'card' }, h('div', { class: 'empty' }, h('h3', {}, 'No hay recurrentes en este centro'),
      h('button', { class: 'btn primary', onclick: () => editarPlantilla() }, '+ Nuevo recurrente')))]),
    h('div', { class: 'card-sub' }, 'Marca los pagos que aplican este mes. El monto que ajustes aquí solo cambia este mes; para cambiar el estimado usa ✎.')));
}

// =====================================================================
// MOVIMIENTOS
// =====================================================================
let ultimoTipo = 'variable';
let enfocarConcepto = false;

function movForm(ini) {
  let tipo = ini.tipo || ultimoTipo;
  const fFecha = h('input', { type: 'date', value: ini.fecha || defaultDate() });
  const fConcepto = h('input', { type: 'text', value: ini.concepto || '', placeholder: 'Ej. Mercado Cañaveral', list: 'dl-conceptos', autocomplete: 'off' });
  const fMonto = moneyInput(ini.monto);
  let fCat = select(catOpts(tipo), ini.categoria || catOpts(tipo)[0]?.value);
  const fCentro = select(centroOpts(), ini.centro || (state.centro === 'todos' ? 'hogar' : state.centro));
  const fMedio = select([{ value: '', label: '—' }, ...state.data.medios.map((m) => ({ value: m, label: m }))], ini.medio || '');
  const fNota = h('input', { type: 'text', value: ini.nota || '', placeholder: 'Opcional' });
  const fComp = select([{ value: '', label: '— Ninguno —' }, ...[...state.data.compromisos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((c) => ({ value: c.id, label: c.nombre }))], ini.compromisoId || '');
  const fEstado = select([{ value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente' }], ini.estado || 'pagado');
  const catWrap = h('div', {}, fCat);
  const seg = h('div', { class: 'seg small', role: 'group', 'aria-label': 'Tipo de gasto' });
  const pintarSeg = () => seg.replaceChildren(...TIPOS.map((t) => h('button', { type: 'button', 'aria-pressed': String(t.id === tipo), onclick: () => {
    tipo = t.id;
    fCat = select(catOpts(tipo), catOpts(tipo)[0]?.value);
    catWrap.replaceChildren(fCat);
    pintarSeg();
  } }, t.corto)));
  pintarSeg();

  // Autocompletar con el último movimiento del mismo concepto.
  fConcepto.addEventListener('change', () => {
    const q = fConcepto.value.trim().toLowerCase();
    const prev = [...state.data.movimientos].reverse().find((m) => m.concepto.toLowerCase() === q);
    if (!prev) return;
    tipo = prev.tipo;
    fCat = select(catOpts(tipo), prev.categoria);
    catWrap.replaceChildren(fCat);
    pintarSeg();
    if (!fMonto.getValue()) fMonto.value = num(prev.monto);
    fCentro.value = prev.centro;
    fMedio.value = prev.medio || '';
  });

  const lista = [...new Set(state.data.movimientos.map((m) => m.concepto))].slice(-80);
  const nodes = [
    h('datalist', { id: 'dl-conceptos' }, lista.map((c) => h('option', { value: c }))),
    field('Fecha', fFecha),
    field('Concepto', fConcepto, 'wide full'),
    field('Monto', fMonto),
    h('div', { class: 'f wide' }, h('span', { style: { fontSize: '12px', color: 'var(--ink-2)' } }, 'Tipo'), seg),
    field('Categoría', catWrap),
    field('Centro', fCentro),
    field('Medio de pago', fMedio),
    state.data.compromisos.length ? field('Compromiso (paseo, cumpleaños…)', fComp) : null,
    ini.id ? field('Estado', fEstado) : null,
    field('Nota', fNota, 'wide full'),
  ];
  const read = () => {
    if (!fConcepto.value.trim()) return 'Escribe el concepto.';
    if (!fMonto.getValue()) return 'Escribe el monto.';
    if (!fFecha.value) return 'Elige la fecha.';
    return {
      fecha: fFecha.value, concepto: fConcepto.value.trim(), monto: fMonto.getValue(), tipo, categoria: fCat.value,
      centro: fCentro.value, medio: fMedio.value, nota: fNota.value.trim(), compromisoId: fComp.value || undefined, ...(ini.id ? { estado: fEstado.value } : {}),
    };
  };
  const reset = () => { fConcepto.value = ''; fMonto.value = ''; fNota.value = ''; };
  return { nodes, read, reset, focus: () => fConcepto.focus() };
}

const filtrosMov = { q: '', tipo: 'todos', soloPend: false };

export function renderMovimientos(root) {
  const filtros = filtrosMov;
  const form = movForm({});
  const range = curRange();
  const todos = visibleMovs(range).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.concepto.localeCompare(b.concepto));
  const filtrar = () => {
    const q = filtros.q.toLowerCase();
    return todos.filter((m) => (filtros.tipo === 'todos' || m.tipo === filtros.tipo) && (!filtros.soloPend || m.estado === 'pendiente')
      && (!q || `${m.concepto} ${categoria(m.categoria)?.nombre || ''} ${m.nota}`.toLowerCase().includes(q)));
  };

  const agregar = () => {
    const r = form.read();
    if (typeof r === 'string') { toast(r); return; }
    ultimoTipo = r.tipo;
    addMov(r);
    enfocarConcepto = true;
    toast('Agregado: ' + r.concepto);
    hooks.rerender();
  };
  const formCard = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Registrar gasto'),
    h('form', { class: 'form-grid', onsubmit: (e) => { e.preventDefault(); agregar(); } },
      ...form.nodes,
      h('button', { type: 'submit', class: 'btn primary', style: { height: '34px' } }, 'Agregar')));

  const editar = (m) => {
    const f = movForm(m);
    modal('Editar movimiento', f.nodes, {
      onSave: () => { const r = f.read(); if (typeof r === 'string') return r; updateMov(m.id, r); hooks.rerender(); },
      peligro: { label: 'Eliminar', fn: () => { delMov(m.id); hooks.rerender(); } },
    });
  };

  // Solo se vuelven a pintar los chips y la tabla (el formulario conserva lo que estés escribiendo).
  const chipsHost = h('div', { class: 'row', style: { gap: '6px' } });
  const tablaHost = h('div', {});
  const pintar = () => {
    const lista = filtrar();
    chipsHost.replaceChildren(
      ...[{ id: 'todos', n: 'Todos' }, ...TIPOS.map((t) => ({ id: t.id, n: t.nombre }))].map((t) =>
        h('button', { class: 'chip', 'aria-pressed': String(filtros.tipo === t.id), onclick: () => { filtros.tipo = t.id; pintar(); } }, t.n)),
      h('button', { class: 'chip', 'aria-pressed': String(filtros.soloPend), onclick: () => { filtros.soloPend = !filtros.soloPend; pintar(); } }, 'Solo pendientes'));
    tablaHost.replaceChildren(lista.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Fecha', 'Concepto', 'Categoría', 'Tipo', 'Centro', 'Medio'].map((t) => h('th', {}, t)), h('th', { class: 'r' }, 'Monto'), h('th', {}, 'Estado'), h('th'))),
        h('tbody', {}, lista.map((m) => h('tr', {},
          h('td', { class: 'num' }, dayShort(m.fecha)),
          h('td', {}, m.concepto, m.compromisoId ? h('div', { class: 'card-sub' }, '↳ ' + (state.data.compromisos.find((c) => c.id === m.compromisoId)?.nombre || 'Compromiso')) : null, m.nota ? h('div', { class: 'card-sub' }, m.nota) : null),
          h('td', {}, categoria(m.categoria)?.nombre || m.categoria),
          h('td', {}, tipoDot(m.tipo)),
          h('td', {}, centroNombre(m.centro)),
          h('td', {}, m.medio || '—'),
          h('td', { class: 'r' }, money(m.monto)),
          h('td', {}, m.estado === 'pendiente'
            ? h('button', { class: 'chip', title: 'Marcar como pagado', onclick: () => { marcarPagado(m.id, true); hooks.rerender(); } }, 'Pendiente · pagar')
            : h('span', { class: 'muted' }, 'Pagado')),
          h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + m.concepto, onclick: () => editar(m) }, '✎'))))),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: 6 }, `${lista.length} movimiento${lista.length === 1 ? '' : 's'}`), h('td', { class: 'r' }, money(sum(lista))), h('td'), h('td')))))
      : h('div', { class: 'empty' }, h('div', {}, todos.length ? 'Ningún movimiento coincide con el filtro.' : 'Aún no hay movimientos en este periodo.')));
  };

  const buscar = h('input', { type: 'search', placeholder: 'Buscar concepto, categoría o nota…', value: filtros.q, 'aria-label': 'Buscar', style: { minWidth: '240px' } });
  buscar.addEventListener('input', () => { filtros.q = buscar.value; pintar(); });
  pintar();

  root.replaceChildren(h('div', { class: 'stack' }, formCard,
    h('section', { class: 'card' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, buscar, chipsHost,
        h('button', { class: 'btn', onclick: () => exportarCSV(filtrar()) }, 'Exportar CSV')),
      tablaHost)));
  if (enfocarConcepto) { enfocarConcepto = false; form.focus(); }
}

function exportarCSV(lista) {
  const esc = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  const filas = [['fecha', 'concepto', 'categoria', 'tipo', 'centro', 'medio', 'monto', 'estado', 'nota']];
  for (const m of lista) filas.push([m.fecha, m.concepto, categoria(m.categoria)?.nombre || m.categoria, m.tipo, centroNombre(m.centro), m.medio, m.monto, m.estado, m.nota]);
  download('movimientos.csv', '﻿' + filas.map((f) => f.map(esc).join(',')).join('\n'), 'text/csv');
}

// =====================================================================
// INGRESOS
// =====================================================================
function editarFuente(f, tipoPorDefecto = 'recurrente') {
  const nuevo = !f;
  f = f || { id: uid(), nombre: '', monto: 0, tipo: tipoPorDefecto, centro: state.centro === 'todos' ? 'hogar' : state.centro };
  const fNombre = h('input', { type: 'text', value: f.nombre, placeholder: 'Ej. VEC' });
  const fMonto = moneyInput(f.monto);
  const fTipo = select([{ value: 'recurrente', label: 'Recurrente (llega cada mes)' }, { value: 'variable', label: 'Variable (depende del trabajo)' }], f.tipo || 'variable');
  const fCentro = select(centroOpts(), f.centro);
  const fDia = h('input', { type: 'number', min: 1, max: 31, value: f.dia || '', placeholder: 'Ej. 30' });
  const fAdel = h('input', { type: 'checkbox', checked: !!f.adelanto });
  const fQuin = h('input', { type: 'checkbox', checked: !!f.quincenal });
  modal(nuevo ? 'Nueva fuente de ingreso' : 'Editar fuente de ingreso', [
    field('Nombre', fNombre, 'full'), field('Tipo', fTipo, 'full'), field('Monto habitual (al mes)', fMonto), field('Centro', fCentro),
    field('Día del mes en que lo recibes', fDia),
    h('label', { class: 'switch' }, fQuin, 'Me pagan cada quincena (el 15 y el día indicado, la mitad cada vez)'),
    h('label', { class: 'switch' }, fAdel, 'Llega por adelantado (el pago del 30 es el ingreso del mes siguiente)'),
    h('div', { class: 'card-sub full' }, 'Las fuentes recurrentes aparecen solas cada mes como ingreso esperado; las variables las agregas según el trabajo que salga.'),
  ], {
    onSave: () => {
      if (!fNombre.value.trim()) return 'Escribe el nombre.';
      const nueva = { ...f, nombre: fNombre.value.trim(), monto: fMonto.getValue(), tipo: fTipo.value, centro: fCentro.value, dia: Number(fDia.value) || undefined, adelanto: fAdel.checked || undefined, quincenal: fQuin.checked || undefined };
      saveFuente(nueva);
      hooks.rerender();
    },
    peligro: nuevo ? null : { label: 'Eliminar', fn: () => { delFuente(f.id); hooks.rerender(); } },
  });
}

function ingresoForm(ini) {
  const fFecha = h('input', { type: 'date', value: ini.fecha || defaultDate() });
  const fFuente = h('input', { type: 'text', value: ini.fuente || '', placeholder: 'Ej. VEC', list: 'dl-fuentes', autocomplete: 'off' });
  const fMonto = moneyInput(ini.monto);
  const fCentro = select(centroOpts(), ini.centro || (state.centro === 'todos' ? 'hogar' : state.centro));
  const fNota = h('input', { type: 'text', value: ini.nota || '', placeholder: 'Opcional' });
  fFuente.addEventListener('change', () => {
    const f = state.data.fuentesIngreso.find((x) => x.nombre.toLowerCase() === fFuente.value.trim().toLowerCase());
    if (f) { if (!fMonto.getValue()) fMonto.value = num(f.monto); fCentro.value = f.centro; }
  });
  const nodes = [
    h('datalist', { id: 'dl-fuentes' }, state.data.fuentesIngreso.map((f) => h('option', { value: f.nombre }))),
    field('Fecha', fFecha), field('Fuente', fFuente, 'wide full'), field('Monto', fMonto), field('Centro', fCentro), field('Nota', fNota, 'wide full'),
  ];
  const read = () => {
    if (!fFuente.value.trim()) return 'Escribe la fuente.';
    if (!fMonto.getValue()) return 'Escribe el monto.';
    if (!fFecha.value) return 'Elige la fecha.';
    return { fecha: fFecha.value, fuente: fFuente.value.trim(), monto: fMonto.getValue(), centro: fCentro.value, nota: fNota.value.trim() };
  };
  return { nodes, read };
}

function registrarPago(mes, r) {
  const hoy = todayISO();
  const fFecha = h('input', { type: 'date', value: hoy.slice(0, 7) === mes ? hoy : mes + '-01' });
  const fMonto = moneyInput(r.falta || r.esperado || 0);
  const fNota = h('input', { type: 'text', placeholder: 'Opcional' });
  modal('Registrar pago recibido de ' + r.nombre, [
    field('Fecha', fFecha), field('Monto recibido', fMonto), field('Nota', fNota, 'full'),
    h('div', { class: 'card-sub full' }, r.esperado ? `Esperado ${money(r.esperado)} · ya recibido ${money(r.recibido)} · falta ${money(r.falta)}` : 'Este ingreso no tenía un valor esperado.'),
  ], {
    onSave: () => {
      if (!fMonto.getValue()) return 'Escribe el monto.';
      if (!fFecha.value) return 'Elige la fecha.';
      addIngreso({ fecha: fFecha.value, fuente: r.nombre, monto: fMonto.getValue(), centro: r.centro, nota: fNota.value.trim(), mesPlan: mes });
      hooks.rerender();
    },
  });
}

function modalEsperadoVariable(mes) {
  const fNombre = h('input', { type: 'text', placeholder: 'Ej. Pago web cliente nuevo', list: 'dl-var', autocomplete: 'off' });
  const fMonto = moneyInput(0);
  const fCentro = select(centroOpts(), state.centro === 'todos' ? 'hogar' : state.centro);
  const nombres = [...new Set([...state.data.fuentesIngreso.filter((x) => x.tipo === 'variable').map((x) => x.nombre), ...state.data.ingresos.map((i) => i.fuente)])];
  fNombre.addEventListener('change', () => {
    const fu = state.data.fuentesIngreso.find((x) => x.nombre.toLowerCase() === fNombre.value.trim().toLowerCase());
    if (fu) { if (!fMonto.getValue()) fMonto.value = num(fu.monto); fCentro.value = fu.centro; }
  });
  modal('Ingreso variable esperado en ' + monthName(mes + '-01'), [
    h('datalist', { id: 'dl-var' }, nombres.map((n) => h('option', { value: n }))),
    field('Fuente o cliente', fNombre, 'full'), field('Cuánto esperas recibir', fMonto), field('Centro', fCentro),
  ], {
    onSave: () => {
      if (!fNombre.value.trim()) return 'Escribe la fuente.';
      if (!fMonto.getValue()) return 'Escribe cuánto esperas recibir.';
      const fu = state.data.fuentesIngreso.find((x) => x.nombre.toLowerCase() === fNombre.value.trim().toLowerCase());
      addEsperado(mes, { nombre: fNombre.value.trim(), tipo: fu?.tipo || 'variable', centro: fCentro.value, esperado: fMonto.getValue(), fuenteId: fu?.id });
      hooks.rerender();
    },
  });
}

function modalCobros(mes, r) {
  const lineas = h('div', { class: 'stack', style: { gap: '8px' }, 'data-lineas': '1' });
  const nueva = (c) => {
    const fecha = h('input', { type: 'date', value: c.fecha || '', 'aria-label': 'Fecha del cobro' });
    const monto = moneyInput(c.monto || 0, { 'aria-label': 'Monto del cobro' });
    const fila = h('div', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } }, fecha, monto,
      h('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'Quitar este cobro', onclick: () => fila.remove() }, '✕'));
    fila.leer = () => ({ fecha: fecha.value, monto: monto.getValue() });
    return fila;
  };
  const base = r.cobros && r.cobros.length ? r.cobros : [{ fecha: r.fechaEsperada || '', monto: r.esperado || 0 }];
  base.forEach((c) => lineas.append(nueva(c)));
  modal('Cobros esperados de ' + r.nombre + ' en ' + monthName(mes + '-01').split(' ')[0].toLowerCase(), [
    h('div', { class: 'full' }, lineas, h('div', { style: { marginTop: '8px' } }, h('button', { type: 'button', class: 'btn sm', onclick: () => lineas.append(nueva({})) }, '+ Agregar otro cobro'))),
    h('div', { class: 'card-sub full' }, 'Cada cobro es una fecha y un valor (por ejemplo, las dos quincenas). Lo que ya recibiste se aplica primero a los cobros más antiguos.'),
  ], {
    onSave: () => {
      const cobros = [...lineas.children].map((x) => x.leer());
      if (!cobros.some((c) => c.fecha && c.monto > 0)) return 'Agrega al menos un cobro con fecha y valor.';
      setCobros(mes, r, cobros);
      hooks.rerender();
    },
  });
}

const ESTADO_ING = {
  recibido: ['✓ Recibido', 'estado-ok'],
  parcial: ['◐ Parcial', 'estado-parcial'],
  pendiente: ['○ Pendiente', 'estado-pend'],
};

export function renderIngresos(root) {
  const mes = curMes();
  const pg = planGasto(mes);
  const form = ingresoForm({});
  const range = { from: mes + '-01', to: monthEnd(mes + '-01') };
  const pagos = visibleIngresos(range).sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ---- ¿Cuánto puedo gastar? ----
  const stat = (label, valor, sub) => h('div', { class: 'stat' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value num' }, money(valor)), sub ? h('div', { class: 'card-sub' }, sub) : null);
  const neg = pg.dispEsperado < 0;
  const resumen = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, '¿Cuánto puedo gastar en ' + monthName(mes + '-01').split(' ')[0].toLowerCase() + '?'),
      h('div', { class: 'card-sub' }, 'Ingresos del mes − presupuesto de fijos (recurrentes, créditos y mercado) − compromisos reservados. De ahí sale tu hormiga y lo que quieras comprar.'))),
    h('div', { class: 'stats' },
      stat('Ingreso esperado', pg.esperado, pg.base > pg.esperado ? `+ ${money(pg.base - pg.esperado)} recibido sin plan = ${money(pg.base)}` : (pg.esperado > 0 ? `Recibido: ${pct(Math.min(1, pg.recibido / pg.esperado))} de lo esperado` : 'Define lo que esperas abajo')),
      stat('Ya recibido', pg.recibido), stat('Falta por recibir', pg.falta), stat('Presupuesto de fijos', pg.fijos, 'Lo que hay que cubrir sí o sí')),
    pg.esperado > 0 ? h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': Math.round(Math.min(1, pg.recibido / pg.esperado) * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('i', { style: { width: Math.min(100, (pg.recibido / pg.esperado) * 100) + '%' } })) : null,
    h('div', { class: 'callout disponible' },
      h('div', { class: 'card-sub' }, pg.recibido > pg.esperado ? 'Disponible para gastar (con lo recibido)' : 'Disponible para gastar (si entra lo esperado)'),
      h('div', { class: 'hero-value num' + (neg ? ' neg' : ''), style: { fontSize: '40px' } }, money(pg.dispEsperado)),
      h('div', { class: 'card-sub num' }, `Tu hormiga y variables ya pagados (${money(pg.otros)} este mes) no se restan aquí: son parte de lo que puedes gastar.`),
      neg
        ? h('span', { class: 'status crit' }, `▲ Los fijos y compromisos superan los ingresos por ${money(-pg.dispEsperado)}: consigue más ingresos o recorta.`)
        : h('span', { class: 'status' }, '✓ Esto es lo que tienes para tu hormiga, tus gustos y lo que quieras comprar este mes.')),
    h('div', { class: 'card-sub num' }, pg.dispRecibido >= 0
      ? `Con lo que ya recibiste hoy: ${money(pg.dispRecibido)} disponibles.`
      : `Con lo que ya recibiste aún no cubres los fijos: faltan ${money(-pg.dispRecibido)} por recibir antes de gastar de más.`),
    h('div', { class: 'card-sub' }, 'Esta cuenta es del presupuesto del mes. Para ver cuánto tienes de verdad en tus cuentas y cuánto repartir en compromisos:'),
    h('div', {}, h('button', { class: 'btn sm', onclick: () => hooks.goTab('plan') }, 'Ver el Plan del mes')));

  // ---- Tablas de ingresos esperados ----
  const fila = (r) => {
    const conFechas = r.cobros && r.cobros.length > 0;
    const inp = conFechas ? h('span', { class: 'num' }, money(r.esperado)) : moneyInput(r.esperado, { 'aria-label': 'Esperado de ' + r.nombre, class: 'mny' });
    if (!conFechas) inp.addEventListener('change', () => { setEsperado(mes, r, inp.getValue()); hooks.rerender(); });
    const prox = r.cobrosPend && r.cobrosPend[0];
    const [txt, cls] = ESTADO_ING[r.estado];
    const fu = r.fuenteId && state.data.fuentesIngreso.find((x) => x.id === r.fuenteId);
    return h('tr', {},
      h('td', {}, h('b', {}, r.nombre), r.centro !== 'hogar' ? h('div', { class: 'card-sub' }, centroNombre(r.centro)) : null,
        prox ? h('div', { class: 'card-sub num' }, `Próximo cobro: ${dayShort(prox.fecha)} · ${money(prox.monto)}${r.cobrosPend.length > 1 ? ` (+${r.cobrosPend.length - 1} más)` : ''}`) : null),
      h('td', { class: 'r' }, inp),
      h('td', { class: 'r' }, money(r.recibido)),
      h('td', { class: 'r' }, r.esperado > 0 ? money(r.falta) : '—'),
      h('td', {}, h('span', { class: cls }, r.esperado <= 0 && r.recibido > 0 ? '✓ Recibido (sin esperado)' : txt)),
      h('td', { class: 'acciones' },
        h('button', { class: 'btn sm', onclick: () => registrarPago(mes, r) }, '+ Recibí'),
        h('button', { class: 'btn ghost sm', title: 'Fechas y cobros esperados', onclick: () => modalCobros(mes, r) }, 'Fechas'),
        fu ? h('button', { class: 'btn ghost icon', 'aria-label': 'Editar fuente ' + r.nombre, onclick: () => editarFuente(fu) }, '✎') : null,
        r.plan ? h('button', { class: 'btn ghost icon', 'aria-label': 'Quitar ' + r.nombre + ' de este mes', title: 'Quitar de este mes', onclick: () => { delEsperado(mes, r); hooks.rerender(); } }, '✕') : null));
  };
  const tabla = (lista, vacio) => (lista.length
    ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Fuente'), h('th', { class: 'r' }, 'Esperado'), h('th', { class: 'r' }, 'Recibido'), h('th', { class: 'r' }, 'Falta'), h('th', {}, 'Estado'), h('th'))),
      h('tbody', {}, lista.map(fila)),
      h('tfoot', {}, h('tr', {}, h('td', {}, 'Total'), h('td', { class: 'r' }, money(sum(lista, (r) => r.esperado))), h('td', { class: 'r' }, money(sum(lista, (r) => r.recibido))),
        h('td', { class: 'r' }, money(sum(lista, (r) => r.falta))), h('td'), h('td')))))
    : h('div', { class: 'muted' }, vacio));
  const recurrentes = pg.rows.filter((r) => r.tipo === 'recurrente');
  const variables = pg.rows.filter((r) => r.tipo !== 'recurrente');

  const cRec = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Ingresos recurrentes'),
      h('div', { class: 'card-sub' }, 'Llegan cada mes: aparecen solos como esperados y tú registras cuándo los recibes.')),
    h('button', { class: 'btn', onclick: () => editarFuente(null, 'recurrente') }, '+ Nueva fuente recurrente')),
    tabla(recurrentes, 'No hay ingresos recurrentes. Crea una fuente recurrente (por ejemplo VEC o TAP) y aparecerá cada mes.'));
  const cVar = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Ingresos variables'),
      h('div', { class: 'card-sub' }, 'Dependen del trabajo que salga: pon lo que esperas y marca lo que ya llegó.')),
    h('button', { class: 'btn primary', onclick: () => modalEsperadoVariable(mes) }, '+ Ingreso variable esperado')),
    tabla(variables, 'No hay ingresos variables este mes. Agrega los trabajos que esperas cobrar.'));

  // ---- Pagos recibidos ----
  const editar = (i) => {
    const f = ingresoForm(i);
    modal('Editar ingreso', f.nodes, {
      onSave: () => { const r = f.read(); if (typeof r === 'string') return r; updateIngreso(i.id, r); hooks.rerender(); },
      peligro: { label: 'Eliminar', fn: () => { delIngreso(i.id); hooks.rerender(); } },
    });
  };
  const cPagos = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Pagos recibidos del mes'),
    pagos.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Fecha', 'Fuente', 'Centro', 'Nota'].map((t) => h('th', {}, t)), h('th', { class: 'r' }, 'Monto'), h('th'))),
        h('tbody', {}, pagos.map((i) => h('tr', {},
          h('td', { class: 'num' }, dayShort(i.fecha)), h('td', {}, i.fuente), h('td', {}, centroNombre(i.centro)), h('td', { class: 'muted' }, i.nota),
          h('td', { class: 'r' }, money(i.monto)),
          h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + i.fuente, onclick: () => editar(i) }, '✎'))))),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: 4 }, 'Total recibido'), h('td', { class: 'r' }, money(sum(pagos))), h('td')))))
      : h('div', { class: 'muted' }, 'Aún no has registrado pagos recibidos en este mes.'),
    h('details', { class: 'extra' }, h('summary', {}, 'Registrar un pago recibido sin pasar por la tabla'),
      h('form', { class: 'form-grid', onsubmit: (e) => {
        e.preventDefault();
        const r = form.read();
        if (typeof r === 'string') { toast(r); return; }
        addIngreso(r);
        toast('Ingreso agregado');
        hooks.rerender();
      } }, ...form.nodes, h('button', { type: 'submit', class: 'btn primary', style: { height: '34px' } }, 'Agregar'))));

  root.replaceChildren(h('div', { class: 'stack' }, resumen, cRec, cVar, cPagos));
}
