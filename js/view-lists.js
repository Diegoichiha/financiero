// Pantallas de captura: Recurrentes (elegir y pagar), Movimientos (variables y hormiga) e Ingresos.
import {
  h, money, num, uid, todayISO, nowHHMM, monthEnd, addMonths, dayShort, monthName, pad, download, pct,
} from './util.js';
import {
  state, TIPOS, TIPO, hooks, curMes, curRange, visibleMovs, visibleIngresos, sum, categoria, centroNombre, cuentaById, ordenPago, marcaPago,
  instancia, incluirPlantilla, quitarPlantilla, fechaPlantilla, savePlantilla, delPlantilla, marcarPagado, ingresoMinimo,
  addMov, updateMov, delMov, addIngreso, updateIngreso, delIngreso, saveFuente, delFuente, save,
  planGasto, setEsperado, addEsperado, delEsperado, setCobros, cuentaSugerida, recordarCuenta,
  tarjetaById, registrarCompraTarjeta, registrarCompraAddi, fechaCuotaAddi,
} from './store.js';
import { modal, confirmar, field, moneyInput, select, toast, copiar } from './ui.js';
import { medidor } from './charts.js';
import { extractoPagadoEn, corteDeFecha, pagoDeCorte, cuotaPmt } from './creditos.js';
import { selectorCuenta, esMedioSinCuenta, pagarMov, desmarcarPago, nombreCuenta, avisoCuenta, barraCuentas } from './cuentas-enlace.js';

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
        onclick: () => { if (inst.estado === 'pagado') desmarcarPago(inst); else pagarMov(inst); } },
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

export function movForm(ini) {
  let tipo = ini.tipo || ultimoTipo;
  const fFecha = h('input', { type: 'date', value: ini.fecha || defaultDate() });
  // Hora del pago: sirve para ordenar lo que pasó el mismo día. Si no la tocas, se guarda la hora exacta en que registras.
  const fHora = h('input', { type: 'time', value: ini.id ? (ini.hora || '') : (fFecha.value === todayISO() ? nowHHMM() : '') });
  let horaTocada = false;
  fHora.addEventListener('input', () => { horaTocada = true; });
  fFecha.addEventListener('change', () => { if (!ini.id && !horaTocada) fHora.value = fFecha.value === todayISO() ? nowHHMM() : ''; });
  const fConcepto = h('input', { type: 'text', value: ini.concepto || '', placeholder: 'Ej. Mercado Cañaveral', list: 'dl-conceptos', autocomplete: 'off' });
  const fMonto = moneyInput(ini.monto);
  let fCat = select(catOpts(tipo), ini.categoria || catOpts(tipo)[0]?.value);
  const fCentro = select(centroOpts(), ini.centro || (state.centro === 'todos' ? 'hogar' : state.centro));
  // Al registrar algo NUEVO también se puede elegir la tarjeta de crédito o ADDI: el formulario muestra sus campos (cuotas, interés, fecha de pago…).
  const mediosFin = ini.id ? [] : [...state.data.tarjetas.map((t) => ({ value: '@tc:' + t.id, label: `Tarjeta ${t.nombre} (crédito)` })), { value: '@addi', label: 'ADDI (en cuotas)' }];
  // Al registrar algo nuevo, el medio genérico "TC Rappi" se reemplaza por la opción de la tarjeta (que sí guarda cuotas, corte y fecha de pago).
  const medioTarjeta = (m) => /tc|tarjeta de cr|cr[eé]dito|rappi card/i.test(m);
  const mediosBase = state.data.medios.filter((m) => ini.id || !state.data.tarjetas.length || !medioTarjeta(m));
  const fMedio = select([{ value: '', label: '—' }, ...mediosBase.map((m) => ({ value: m, label: m })), ...mediosFin], ini.medio || '');
  // De qué cuenta salió la plata: se descuenta de "Tengo hoy" en el Plan del mes (efectivo y tarjeta no descuentan de una cuenta).
  const cuentaOk = (id) => (state.data.cuentasDinero.some((c) => c.id === id) ? id : '');
  // Lo que tú eliges a mano manda: el autocompletado (por concepto) nunca lo pisa.
  const tocado = new Set();
  // Al EDITAR algo que no tiene cuenta no se propone ninguna: ya estaba dentro de tu saldo, y guardar (por ejemplo para atribuir una parte a un
  // compromiso) no debe volver a descontarlo.
  const fCuenta = selectorCuenta(ini.id ? cuentaOk(ini.cuentaId) : (esMedioSinCuenta(ini.medio) ? '' : cuentaSugerida('gasto', ini.concepto)), 'gasto');
  fCuenta.addEventListener('change', () => tocado.add('cuenta'));
  fMedio.addEventListener('change', () => { tocado.add('medio'); fCuenta.value = esMedioSinCuenta(fMedio.value) ? '' : (fCuenta.value || cuentaSugerida('gasto', '')); });
  fCentro.addEventListener('change', () => tocado.add('centro'));
  const fNota = h('input', { type: 'text', value: ini.nota || '', placeholder: 'Opcional' });
  const fComp = select([{ value: '', label: '— Ninguno —' }, ...[...state.data.compromisos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((c) => ({ value: c.id, label: c.nombre }))], ini.compromisoId || '');
  // Si solo UNA PARTE de la compra fue para el compromiso (ej. unos manjares del mercado para un parche), se dice cuánto: esa parte se
  // cuenta al compromiso sin volver a descontar de ninguna cuenta. Vacío = toda la compra es del compromiso.
  const atrib0 = (ini.atribuciones || [])[0];
  if (atrib0) fComp.value = atrib0.compromisoId;
  const fParte2 = moneyInput(atrib0 ? atrib0.monto : 0);
  const fEstado = select([{ value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente' }], ini.estado || 'pagado');
  const catWrap = h('div', {}, fCat);
  const seg = h('div', { class: 'seg small', role: 'group', 'aria-label': 'Tipo de gasto' });
  catWrap.addEventListener('change', () => tocado.add('categoria'));
  const pintarSeg = () => seg.replaceChildren(...TIPOS.map((t) => h('button', { type: 'button', 'aria-pressed': String(t.id === tipo), onclick: () => {
    tocado.add('tipo');
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
    if (!prev || ini.id) return;
    if (!tocado.has('tipo') && !tocado.has('categoria')) {
      tipo = prev.tipo;
      fCat = select(catOpts(tipo), prev.categoria);
      catWrap.replaceChildren(fCat);
      pintarSeg();
    }
    if (!fMonto.getValue()) fMonto.value = num(prev.monto);
    if (!tocado.has('centro')) fCentro.value = prev.centro;
    if (!tocado.has('medio')) fMedio.value = prev.medio || '';
    if (!tocado.has('cuenta')) fCuenta.value = esMedioSinCuenta(fMedio.value) ? '' : (cuentaOk(prev.cuentaId) || cuentaSugerida('gasto', prev.concepto));
  });

  // ---- Compra con tarjeta de crédito o con ADDI: cuotas, interés y fecha de pago ----
  const fCuotas = h('input', { type: 'number', min: 1, max: 60, value: 1 });
  const fTasa = h('input', { type: 'number', min: 0, step: 0.01, value: 0, placeholder: '0 = sin interés' });
  const fCuotaFin = moneyInput(0);
  let cuotaManual = false;
  const fPrimera = h('input', { type: 'date', value: '' });
  const fPartes = h('input', { type: 'number', min: 1, max: 10, value: 1 });
  const infoFin = h('div', { class: 'card-sub full', 'aria-live': 'polite', style: { gridColumn: '1 / -1' } }); // ocupa toda la fila también fuera de un diálogo
  const modo = () => (fMedio.value === '@addi' ? 'addi' : fMedio.value.startsWith('@tc:') ? 'tc' : '');
  const refrescarFin = () => {
    const m = modo();
    if (!m) return;
    const n = Math.max(1, Math.round(Number(fCuotas.value) || 1));
    const tasa = Number(fTasa.value) || 0;
    const valor = fMonto.getValue();
    if (!cuotaManual) fCuotaFin.value = valor && (n > 1 || m === 'addi') ? num(cuotaPmt(valor, n, tasa)) : '';
    const cuota = fCuotaFin.getValue();
    if (m === 'tc') {
      const t = tarjetaById(fMedio.value.slice(4));
      const fecha = fFecha.value || todayISO();
      const corte = corteDeFecha(fecha, t);
      const partes = Math.max(1, Math.round(Number(fPartes.value) || 1));
      infoFin.textContent = (n > 1
        ? `${n} cuotas de ${money(cuota)}. La primera entra en el extracto del corte ${dayShort(corte)} (se paga el ${dayShort(pagoDeCorte(corte, t))}).`
        : `Entra en el extracto del corte ${dayShort(corte)} y se paga el ${dayShort(pagoDeCorte(corte, t))}. No se descuenta de ninguna cuenta hasta que pagues la tarjeta.`)
        + (partes > 1 && n === 1 && valor ? ` Compartida entre ${partes}: tu parte es ${money(valor / partes)}; lo demás queda como reembolso esperado.` : '');
    } else if (fPrimera.value && valor) {
      const a = { primera: fPrimera.value };
      const total = cuota * n;
      infoFin.textContent = `${n} cuota${n === 1 ? '' : 's'} de ${money(cuota)}: la primera el ${dayShort(fPrimera.value)} y la última el ${dayShort(fechaCuotaAddi(a, n))}. Pagas en total ${money(total)}${total > valor + 1 ? ` (${money(total - valor)} de intereses)` : ''}. Las cuotas aparecen solas en "Falta por pagar".`;
    } else infoFin.textContent = 'Escribe el valor y la fecha de pago de la primera cuota.';
  };
  fCuotaFin.addEventListener('input', () => { cuotaManual = true; refrescarFin(); });
  [fFecha, fMonto, fCuotas, fTasa, fPartes, fPrimera].forEach((el) => el.addEventListener('input', refrescarFin));

  const lista = [...new Set(state.data.movimientos.map((m) => m.concepto))].slice(-80);
  const wHora = field('Hora', fHora);
  const wTipo = h('div', { class: 'f wide' }, h('span', { style: { fontSize: '12px', color: 'var(--ink-2)' } }, 'Tipo'), seg);
  const wCentro = field('Centro', fCentro);
  const wCuenta = state.data.cuentasDinero.length ? field('Pagado desde (se descuenta de "Tengo hoy")', fCuenta, 'wide') : null;
  const wComp = state.data.compromisos.length ? field('Compromiso (paseo, cumpleaños…)', fComp) : null;
  const wParte = state.data.compromisos.length ? field('Si solo una parte fue para el compromiso, ¿cuánto? (no se descuenta otra vez; vacío = todo)', fParte2, 'wide') : null;
  const wCuotas = field('Número de cuotas', fCuotas);
  const wTasa = field('Interés mensual % (M.V.)', fTasa);
  const wCuotaFin = field('Valor de cada cuota (puedes ajustarlo)', fCuotaFin, 'wide');
  const wPrimera = field('Fecha de pago de la primera cuota (las demás, el mismo día de cada mes)', fPrimera, 'wide');
  const wPartes = field('¿Entre cuántas personas se divide? (contándote; 1 = solo tuya)', fPartes, 'wide');
  let finActivo = false;
  const pintarModo = () => {
    const m = modo();
    const fin = !!m;
    const ocultar = (w, si) => { if (w) w.style.display = si ? 'none' : ''; };
    [wHora, wTipo, wCentro, wCuenta, wComp, wParte].forEach((w) => ocultar(w, fin));
    [wCuotas, wTasa, wCuotaFin].forEach((w) => ocultar(w, !fin));
    ocultar(wPrimera, m !== 'addi');
    ocultar(wPartes, m !== 'tc');
    ocultar(infoFin, !fin);
    if (fin !== finActivo) { // con tarjeta o ADDI la categoría se elige entre todas
      finActivo = fin;
      const actual = fCat.value;
      const opts = fin ? catOpts() : catOpts(tipo);
      // con tarjeta o ADDI se propone "Otros variables" (no "Mercado", que cambiaría el presupuesto de mercado) salvo que ya hayas elegido categoría
      const porDefecto = fin && !tocado.has('categoria') && opts.some((o) => o.value === 'otros-var') ? 'otros-var' : actual;
      fCat = select(opts, opts.some((o) => o.value === porDefecto) ? porDefecto : opts[0]?.value);
      catWrap.replaceChildren(fCat);
    }
    if (m === 'addi') {
      if (Number(fCuotas.value) <= 1) fCuotas.value = 3;
      if (!fPrimera.value && fFecha.value) fPrimera.value = fechaCuotaAddi({ primera: fFecha.value }, 2);
    }
    if (fin) cuotaManual = false;
    refrescarFin();
  };
  fMedio.addEventListener('change', pintarModo);
  const nodes = [
    h('datalist', { id: 'dl-conceptos' }, lista.map((c) => h('option', { value: c }))),
    field('Fecha', fFecha),
    wHora,
    field('Concepto', fConcepto, 'wide full'),
    field('Monto', fMonto),
    wTipo,
    field('Categoría', catWrap),
    wCentro,
    field('Medio de pago', fMedio),
    wCuotas, wTasa, wCuotaFin, wPrimera, wPartes, infoFin,
    wCuenta,
    wComp,
    wParte,
    ini.id ? field('Estado', fEstado) : null,
    field('Nota', fNota, 'wide full'),
  ];
  pintarModo();
  const read = () => {
    if (!fConcepto.value.trim()) return 'Escribe el concepto.';
    if (!fMonto.getValue()) return 'Escribe el monto.';
    if (!fFecha.value) return 'Elige la fecha.';
    const mf = modo();
    if (mf) {
      const n = Math.max(1, Math.round(Number(fCuotas.value) || 1));
      const tasa = Number(fTasa.value) || 0;
      const valor = fMonto.getValue();
      const cuota = fCuotaFin.getValue() || Math.round(cuotaPmt(valor, n, tasa));
      const concepto = fConcepto.value.trim();
      if (mf === 'tc') {
        const partes = Math.max(1, Math.round(Number(fPartes.value) || 1));
        if (n > 1 && partes > 1) return 'Dividir entre personas solo sirve en compras de una sola cuota.';
        if (n > 1 && !cuota) return 'Falta el valor de la cuota.';
        const tid = fMedio.value.slice(4);
        return { financiado: () => {
          const t = tarjetaById(tid);
          const r = registrarCompraTarjeta(tid, { fecha: fFecha.value, concepto, monto: valor, cuotas: n, tasaMV: tasa, cuota, categoria: fCat.value, partes });
          return `Compra en ${t.nombre}: ${n > 1 ? `${n} cuotas de ${money(cuota)}, la primera` : 'entra'} en el extracto del corte ${dayShort(r.corte)} (se paga el ${dayShort(r.pago)}).`;
        } };
      }
      if (!fPrimera.value) return 'Elige la fecha de pago de la primera cuota.';
      if (!cuota) return 'Falta el valor de la cuota.';
      return { financiado: () => {
        registrarCompraAddi({ concepto, fecha: fFecha.value, valor, cuotas: n, cuota, tasaMV: tasa, primera: fPrimera.value, categoria: fCat.value });
        return `ADDI: ${n} cuota${n === 1 ? '' : 's'} de ${money(cuota)} desde el ${dayShort(fPrimera.value)}. Quedan en "Falta por pagar" y en Créditos.`;
      } };
    }
    const estado = ini.id ? fEstado.value : 'pagado';
    const parte = fComp.value ? fParte2.getValue() : 0;
    if (parte > fMonto.getValue()) return 'La parte para el compromiso no puede ser mayor que el valor del gasto.';
    const soloParte = parte > 0 && parte < fMonto.getValue();
    // Nuevo y sin tocar la hora: la de este momento (si es de hoy). Al pasar un pendiente a pagado también se pone la de ahora.
    let hora = fHora.value;
    if (estado === 'pendiente') hora = '';
    else if (!hora && fFecha.value === todayISO() && (!ini.id || ini.estado === 'pendiente')) hora = nowHHMM();
    else if (!ini.id && !horaTocada) hora = fFecha.value === todayISO() ? nowHHMM() : '';
    return {
      fecha: fFecha.value, hora, concepto: fConcepto.value.trim(), monto: fMonto.getValue(), tipo, categoria: fCat.value,
      centro: fCentro.value, medio: fMedio.value, nota: fNota.value.trim(), compromisoId: fComp.value && !soloParte ? fComp.value : undefined, atribuciones: soloParte ? [{ compromisoId: fComp.value, monto: parte }] : undefined,
      cuentaId: fCuenta.value || undefined,
      yaEnSaldo: fCuenta.value ? undefined : ini.yaEnSaldo,
      ...(ini.id ? { estado } : {}),
    };
  };
  const reset = () => { fConcepto.value = ''; fMonto.value = ''; fNota.value = ''; };
  return { nodes, read, reset, focus: () => fConcepto.focus() };
}

// Editar un gasto (desde Gastos o desde "¿Qué movió este saldo?").
export function editarMov(m) {
  const f = movForm(m);
  modal('Editar movimiento', f.nodes, {
    onSave: () => {
      const r = f.read(); if (typeof r === 'string') return r;
      const antes = m.cuentaId;
      updateMov(m.id, r);
      recordarCuenta('gasto', r.concepto, r.cuentaId);
      if (r.estado === 'pagado' && r.cuentaId && r.cuentaId !== antes) toast(avisoCuenta('gasto', r.monto, r.cuentaId));
      hooks.rerender();
    },
    peligro: { label: 'Eliminar', fn: () => { delMov(m.id); hooks.rerender(); } },
  });
}

const filtrosMov = { q: '', tipo: 'todos', soloPend: false, cuenta: '' };

export function renderMovimientos(root) {
  const filtros = filtrosMov;
  if (filtros.cuenta && !state.data.cuentasDinero.some((c) => c.id === filtros.cuenta)) filtros.cuenta = '';
  const form = movForm({});
  const range = curRange();
  const todos = visibleMovs(range);
  const filtrar = () => {
    const q = filtros.q.toLowerCase();
    return todos.filter((m) => (filtros.tipo === 'todos' || m.tipo === filtros.tipo) && (!filtros.soloPend || m.estado === 'pendiente')
      && (!filtros.cuenta || m.cuentaId === filtros.cuenta)
      && (!q || `${m.concepto} ${categoria(m.categoria)?.nombre || ''} ${m.nota}`.toLowerCase().includes(q)));
  };

  const agregar = () => {
    const r = form.read();
    if (typeof r === 'string') { toast(r); return; }
    if (r.financiado) { toast(r.financiado()); hooks.rerender(); return; }
    ultimoTipo = r.tipo;
    const mov = addMov(r);
    recordarCuenta('gasto', r.concepto, mov.cuentaId);
    enfocarConcepto = true;
    toast(avisoCuenta('gasto', r.monto, mov.cuentaId) || 'Agregado: ' + r.concepto);
    hooks.rerender();
  };
  const formCard = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Registrar gasto'),
    h('form', { class: 'form-grid', onsubmit: (e) => { e.preventDefault(); agregar(); } },
      ...form.nodes,
      h('button', { type: 'submit', class: 'btn primary', style: { height: '34px' } }, 'Agregar')));

  const editar = editarMov;

  // Solo se vuelven a pintar los chips y la tabla (el formulario conserva lo que estés escribiendo).
  const cuentasHost = h('div', {});
  const chipsHost = h('div', { class: 'row', style: { gap: '6px' } });
  const tablaHost = h('div', {});
  const pintar = () => {
    const lista = filtrar();
    // Primero lo ya pagado, en el orden en que se pagó (lo último arriba, con la hora para desempatar); lo pendiente va aparte, abajo.
    const pagados = lista.filter((m) => m.estado !== 'pendiente').sort(ordenPago);
    const pendientes = lista.filter((m) => m.estado === 'pendiente').sort((a, b) => a.fecha.localeCompare(b.fecha) || a.concepto.localeCompare(b.concepto));
    const barra = barraCuentas({ activa: filtros.cuenta, alElegir: (id) => { filtros.cuenta = id; pintar(); } });
    cuentasHost.replaceChildren(...(barra ? [barra] : []));
    chipsHost.replaceChildren(
      ...[{ id: 'todos', n: 'Todos' }, ...TIPOS.map((t) => ({ id: t.id, n: t.nombre }))].map((t) =>
        h('button', { class: 'chip', 'aria-pressed': String(filtros.tipo === t.id), onclick: () => { filtros.tipo = t.id; pintar(); } }, t.n)),
      h('button', { class: 'chip', 'aria-pressed': String(filtros.soloPend), onclick: () => { filtros.soloPend = !filtros.soloPend; pintar(); } }, 'Solo pendientes'));
    const fila = (m) => h('tr', {},
      h('td', { class: 'num' }, dayShort(m.fecha), m.estado !== 'pendiente' && m.hora ? h('div', { class: 'card-sub num' }, m.hora) : null),
      h('td', {}, m.concepto, m.compromisoId ? h('div', { class: 'card-sub' }, '↳ ' + (state.data.compromisos.find((c) => c.id === m.compromisoId)?.nombre || 'Compromiso')) : null,
        ...(m.atribuciones || []).map((a) => h('div', { class: 'card-sub' }, `↳ ${money(a.monto)} fueron para «${state.data.compromisos.find((c) => c.id === a.compromisoId)?.nombre || 'un compromiso'}»`)), m.nota ? h('div', { class: 'card-sub' }, m.nota) : null),
      h('td', {}, categoria(m.categoria)?.nombre || m.categoria),
      h('td', {}, tipoDot(m.tipo)),
      h('td', {}, centroNombre(m.centro)),
      h('td', {}, m.medio || '—',
        m.estado === 'pagado' && m.cuentaId && nombreCuenta(m.cuentaId) ? h('div', { class: 'card-sub' }, '↳ ' + nombreCuenta(m.cuentaId)) : null),
      h('td', { class: 'r' }, money(m.monto)),
      h('td', {}, m.estado === 'pendiente'
        ? h('button', { class: 'chip', title: 'Marcar como pagado', onclick: () => pagarMov(m) }, 'Pendiente · pagar')
        : h('span', { class: 'muted' }, 'Pagado')),
      h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + m.concepto, onclick: () => editar(m) }, '✎')));
    tablaHost.replaceChildren(lista.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Fecha', 'Concepto', 'Categoría', 'Tipo', 'Centro', 'Medio'].map((t) => h('th', {}, t)), h('th', { class: 'r' }, 'Monto'), h('th', {}, 'Estado'), h('th'))),
        h('tbody', {},
          ...pagados.map(fila),
          pendientes.length ? h('tr', { class: 'periodo' }, h('td', { colspan: 9 },
            h('b', {}, `Por pagar · ${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}`),
            h('div', { class: 'card-sub num' }, `${money(sum(pendientes))} · por fecha de vencimiento, aparte de lo ya pagado`))) : null,
          ...pendientes.map(fila)),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: 6 }, `${lista.length} movimiento${lista.length === 1 ? '' : 's'}`), h('td', { class: 'r' }, money(sum(lista))), h('td'), h('td')))))
      : h('div', { class: 'empty' }, h('div', {}, todos.length ? 'Ningún movimiento coincide con el filtro.' : 'Aún no hay movimientos en este periodo.')));
  };

  const buscar = h('input', { type: 'search', placeholder: 'Buscar concepto, categoría o nota…', value: filtros.q, 'aria-label': 'Buscar', style: { minWidth: '240px' } });
  buscar.addEventListener('input', () => { filtros.q = buscar.value; pintar(); });
  pintar();

  root.replaceChildren(h('div', { class: 'stack' }, cuentasHost, formCard,
    h('section', { class: 'card' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, buscar, chipsHost,
        h('button', { class: 'btn', onclick: () => exportarCSV(filtrar()) }, 'Exportar CSV')),
      tablaHost)));
  if (enfocarConcepto) { enfocarConcepto = false; form.focus(); }
}

function exportarCSV(lista) {
  const esc = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  const filas = [['fecha', 'hora', 'concepto', 'categoria', 'tipo', 'centro', 'medio', 'cuenta', 'monto', 'estado', 'nota']];
  for (const m of lista) filas.push([m.fecha, m.hora || '', m.concepto, categoria(m.categoria)?.nombre || m.categoria, m.tipo, centroNombre(m.centro), m.medio, nombreCuenta(m.cuentaId), m.monto, m.estado, m.nota]);
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

export function ingresoForm(ini) {
  const fFecha = h('input', { type: 'date', value: ini.fecha || defaultDate() });
  const fHora = h('input', { type: 'time', value: ini.id ? (ini.hora || '') : (fFecha.value === todayISO() ? nowHHMM() : '') });
  let horaTocada = false;
  fHora.addEventListener('input', () => { horaTocada = true; });
  fFecha.addEventListener('change', () => { if (!ini.id && !horaTocada) fHora.value = fFecha.value === todayISO() ? nowHHMM() : ''; });
  const fFuente = h('input', { type: 'text', value: ini.fuente || '', placeholder: 'Ej. VEC', list: 'dl-fuentes', autocomplete: 'off' });
  const fMonto = moneyInput(ini.monto);
  const fCentro = select(centroOpts(), ini.centro || (state.centro === 'todos' ? 'hogar' : state.centro));
  const fNota = h('input', { type: 'text', value: ini.nota || '', placeholder: 'Opcional' });
  // En qué cuenta entró la plata: se suma a "Tengo hoy" en el Plan del mes.
  const cuentaOk = (id) => (state.data.cuentasDinero.some((c) => c.id === id) ? id : '');
  const fCuenta = selectorCuenta(ini.id ? cuentaOk(ini.cuentaId) : cuentaSugerida('ingreso', ini.fuente), 'ingreso');
  fFuente.addEventListener('change', () => {
    const f = state.data.fuentesIngreso.find((x) => x.nombre.toLowerCase() === fFuente.value.trim().toLowerCase());
    if (f) { if (!fMonto.getValue()) fMonto.value = num(f.monto); fCentro.value = f.centro; }
    if (!ini.id) fCuenta.value = cuentaSugerida('ingreso', fFuente.value);
  });
  const nodes = [
    h('datalist', { id: 'dl-fuentes' }, state.data.fuentesIngreso.map((f) => h('option', { value: f.nombre }))),
    field('Fecha', fFecha), field('Hora', fHora), field('Fuente', fFuente, 'wide full'), field('Monto', fMonto), field('Centro', fCentro),
    state.data.cuentasDinero.length ? field('¿En qué cuenta entró? (se suma a "Tengo hoy")', fCuenta, 'wide full') : null,
    field('Nota', fNota, 'wide full'),
  ];
  const read = () => {
    if (!fFuente.value.trim()) return 'Escribe la fuente.';
    if (!fMonto.getValue()) return 'Escribe el monto.';
    if (!fFecha.value) return 'Elige la fecha.';
    const hora = !ini.id && !horaTocada ? (fFecha.value === todayISO() ? nowHHMM() : '') : fHora.value;
    return { fecha: fFecha.value, hora, fuente: fFuente.value.trim(), monto: fMonto.getValue(), centro: fCentro.value, nota: fNota.value.trim(), cuentaId: fCuenta.value || undefined };
  };
  return { nodes, read };
}

function registrarPago(mes, r) {
  const hoy = todayISO();
  const fFecha = h('input', { type: 'date', value: hoy.slice(0, 7) === mes ? hoy : mes + '-01' });
  const fMonto = moneyInput(r.falta || r.esperado || 0);
  const fNota = h('input', { type: 'text', placeholder: 'Opcional' });
  const fCuenta = selectorCuenta(cuentaSugerida('ingreso', r.nombre), 'ingreso');
  modal('Registrar pago recibido de ' + r.nombre, [
    field('Fecha', fFecha), field('Monto recibido', fMonto),
    state.data.cuentasDinero.length ? field('¿En qué cuenta entró? (se suma a "Tengo hoy")', fCuenta, 'full') : null,
    field('Nota', fNota, 'full'),
    h('div', { class: 'card-sub full' }, r.esperado ? `Esperado ${money(r.esperado)} · ya recibido ${money(r.recibido)} · falta ${money(r.falta)}` : 'Este ingreso no tenía un valor esperado.'),
  ], {
    onSave: () => {
      if (!fMonto.getValue()) return 'Escribe el monto.';
      if (!fFecha.value) return 'Elige la fecha.';
      addIngreso({ fecha: fFecha.value, fuente: r.nombre, monto: fMonto.getValue(), centro: r.centro, nota: fNota.value.trim(), mesPlan: mes, cuentaId: fCuenta.value || undefined });
      recordarCuenta('ingreso', r.nombre, fCuenta.value);
      toast(avisoCuenta('ingreso', fMonto.getValue(), fCuenta.value) || 'Pago registrado');
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
  const pagos = visibleIngresos(range).sort((a, b) => marcaPago(b).localeCompare(marcaPago(a)) || state.data.ingresos.indexOf(b) - state.data.ingresos.indexOf(a));

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
      onSave: () => { const r = f.read(); if (typeof r === 'string') return r; updateIngreso(i.id, r); recordarCuenta('ingreso', r.fuente, r.cuentaId); hooks.rerender(); },
      peligro: { label: 'Eliminar', fn: () => { delIngreso(i.id); hooks.rerender(); } },
    });
  };
  const cPagos = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Pagos recibidos del mes'),
    pagos.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Fecha', 'Fuente', 'Centro', 'Nota'].map((t) => h('th', {}, t)), h('th', { class: 'r' }, 'Monto'), h('th'))),
        h('tbody', {}, pagos.map((i) => h('tr', {},
          h('td', { class: 'num' }, dayShort(i.fecha), i.hora ? h('div', { class: 'card-sub num' }, i.hora) : null), h('td', {}, i.fuente, i.cuentaId && nombreCuenta(i.cuentaId) ? h('div', { class: 'card-sub' }, '↳ entró a ' + nombreCuenta(i.cuentaId)) : null), h('td', {}, centroNombre(i.centro)), h('td', { class: 'muted' }, i.nota),
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
        recordarCuenta('ingreso', r.fuente, r.cuentaId);
        toast(avisoCuenta('ingreso', r.monto, r.cuentaId) || 'Ingreso agregado');
        hooks.rerender();
      } }, ...form.nodes, h('button', { type: 'submit', class: 'btn primary', style: { height: '34px' } }, 'Agregar'))));

  root.replaceChildren(h('div', { class: 'stack' }, resumen, cRec, cVar, cPagos));
}
