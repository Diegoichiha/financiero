// Pestaña Compromisos: paseos, cumpleaños, grados y otros gastos importantes con fecha y presupuesto.
// Responde: ¿cuánto puedo gastar en cada uno sin dañar el presupuesto de fijos?
import {
  h, money, uid, todayISO, daysBetween, addMonths, parse, MESES_C, monthName, dayShort, pct,
} from './util.js';
import {
  state, hooks, cuentaSugerida, recordarCuenta, saveCompromiso, delCompromiso, compromisoGastado, margenMes, addMov, sum, categoria, planCaja,
  gastosDeCompromiso, ajustarGastoReal, reabrirCompromiso, atribuirCompra, atribuido, ordenPago, reservadoDe, cuentaDinero,
  esAjusteReal, ajustesDeCompromiso, gastadoSinAjuste,
} from './store.js';
import { modal, field, moneyInput, select, toast } from './ui.js';

export const TIPOS_COMPROMISO = [
  { value: 'paseo', label: 'Paseo' },
  { value: 'social', label: 'Salida / compartir' },
  { value: 'aniversario', label: 'Aniversario' },
  { value: 'cumpleanos', label: 'Cumpleaños' },
  { value: 'grado', label: 'Grado' },
  { value: 'familiar', label: 'Evento familiar' },
  { value: 'otro', label: 'Otro' },
];
const tipoLabel = (v) => TIPOS_COMPROMISO.find((x) => x.value === v)?.label || 'Otro';
const fechaLarga = (f) => `${parse(f).getDate()} ${MESES_C[parse(f).getMonth()]} ${parse(f).getFullYear()}`;
const mesCorto = (ym) => monthName(ym + '-01').split(' ')[0].slice(0, 3);

function modalCompromiso(c) {
  const nuevo = !c;
  c = c || { id: uid(), nombre: '', tipo: 'cumpleanos', fecha: addMonths(todayISO(), 1).slice(0, 7) + '-15', presupuesto: 0, apartado: 0, nota: '' };
  const fNombre = h('input', { type: 'text', value: c.nombre, placeholder: 'Ej. Cumpleaños de mi mamá' });
  const fTipo = select(TIPOS_COMPROMISO, c.tipo);
  const fFecha = h('input', { type: 'date', value: c.fecha });
  const fFin = h('input', { type: 'date', value: c.fechaFin || '' });
  const fAprox = h('input', { type: 'checkbox', checked: !!c.fechaAprox });
  const fPres = moneyInput(c.presupuesto);
  const fApart = moneyInput(c.apartado || 0);
  const fNota = h('input', { type: 'text', value: c.nota || '', placeholder: 'Opcional' });
  modal(nuevo ? 'Nuevo compromiso' : 'Editar compromiso', [
    field('Nombre', fNombre, 'full'), field('Tipo', fTipo), field('Fecha del evento', fFecha),
    field('Hasta (si dura varios días)', fFin),
    h('label', { class: 'switch full' }, fAprox, 'Fecha por confirmar (solo sé el mes)'),
    field('Presupuesto (tú lo decides; el Plan del mes te dice el máximo posible)', fPres), field('Ya apartado para esto', fApart), field('Nota', fNota, 'full'),
  ], {
    onSave: () => {
      if (!fNombre.value.trim()) return 'Escribe el nombre.';
      if (!fFecha.value) return 'Elige la fecha.';
      saveCompromiso({ ...c, nombre: fNombre.value.trim(), tipo: fTipo.value, fecha: fFecha.value, presupuesto: fPres.getValue(), apartado: fApart.getValue(), fechaFin: fFin.value || undefined, fechaAprox: fAprox.checked || undefined, nota: fNota.value.trim() });
      hooks.rerender();
    },
    peligro: nuevo ? null : { label: 'Eliminar', fn: () => { delCompromiso(c.id); hooks.rerender(); } },
  });
}

import { selectorCuenta, esMedioSinCuenta, avisoCuenta, nombreCuenta } from './cuentas-enlace.js';

function modalGasto(c) {
  const fFecha = h('input', { type: 'date', value: todayISO() });
  const fConcepto = h('input', { type: 'text', value: '', placeholder: 'Ej. Regalo, pasajes, comida…' });
  const fMonto = moneyInput(0);
  const fCat = select(state.data.categorias.filter((x) => x.tipo !== 'recurrente').map((x) => ({ value: x.id, label: x.nombre })), 'otros-var');
  const fMedio = select([{ value: '', label: '—' }, ...state.data.medios.map((m) => ({ value: m, label: m }))], '');
  const fCuenta = selectorCuenta(cuentaSugerida('gasto', ''), 'gasto');
  fMedio.addEventListener('change', () => { fCuenta.value = esMedioSinCuenta(fMedio.value) ? '' : (fCuenta.value || cuentaSugerida('gasto', '')); });
  modal('Gasto de «' + c.nombre + '»', [
    field('Fecha', fFecha), field('Valor', fMonto), field('Concepto', fConcepto, 'full'), field('Categoría', fCat), field('Medio de pago', fMedio),
    state.data.cuentasDinero.length ? field('Pagado desde (se descuenta de "Tengo hoy")', fCuenta, 'full') : null,
    h('div', { class: 'card-sub full' }, `Presupuesto ${money(c.presupuesto)} · gastado ${money(compromisoGastado(c.id))}`),
  ], {
    onSave: () => {
      if (!fConcepto.value.trim()) return 'Escribe el concepto.';
      if (!fMonto.getValue()) return 'Escribe el valor.';
      addMov({ fecha: fFecha.value, concepto: fConcepto.value.trim(), monto: fMonto.getValue(), tipo: 'variable', categoria: fCat.value, centro: 'hogar', medio: fMedio.value, compromisoId: c.id, cuentaId: fCuenta.value || undefined });
      recordarCuenta('gasto', '', fCuenta.value);
      toast(avisoCuenta('gasto', fMonto.getValue(), fCuenta.value) || 'Gasto agregado a ' + c.nombre);
      hooks.rerender();
    },
  });
}

// Compras ya pagadas a las que se les puede atribuir algo de un compromiso (lo más reciente primero; la preferida es el mercado cercano a su fecha).
function comprasParaAtribuir(c) {
  const lista = state.data.movimientos.filter((m) => m.estado === 'pagado' && !m.compromisoId && m.tipo !== 'recurrente' && m.monto > 0).sort(ordenPago).slice(0, 40);
  const cerca = (m) => Math.abs(daysBetween(m.fecha, c.fecha)) <= 3;
  const preferida = lista.find((m) => m.categoria === 'mercado' && cerca(m)) || lista.find((m) => m.categoria === 'mercado') || lista[0] || null;
  return { lista, preferida };
}
const parteDe = (m, id) => (m.atribuciones || []).find((a) => a.compromisoId === id)?.monto || 0;
const etiquetaCompra = (m) => `${m.concepto} · ${money(m.monto)} · ${dayShort(m.fecha)}${m.hora ? ' ' + m.hora : ''}${atribuido(m) ? ` (ya atribuido ${money(atribuido(m))})` : ''}`;

// Cuando el compromiso pasa: se escribe lo que REALMENTE se gastó (el total). Lo que falta por registrar sale de una cuenta, o —si no eliges
// cuenta— se atribuye ahí mismo a una compra que ya hiciste (no se descuenta de nada). Volver a ajustar reemplaza el ajuste anterior.
export function abrirGastoReal(c) {
  const base = gastadoSinAjuste(c.id); // lo registrado de verdad (sin el ajuste anterior, que se reemplaza)
  const previos = ajustesDeCompromiso(c.id);
  const { lista: compras, preferida } = comprasParaAtribuir(c);
  const fReal = moneyInput(c.cerrado && c.gastoReal != null ? c.gastoReal : base);
  const cuentas = state.data.cuentasDinero;
  const fCuenta = select([...cuentas.map((x) => ({ value: x.id, label: `${x.nombre} · hoy ${money(x.saldo)}` })), { value: '', label: 'Ninguna: no sale de ninguna cuenta ahora' }], cuentas.length ? cuentaSugerida('gasto', '') : '');
  const fCompra = select([{ value: '', label: 'Fue en efectivo o ya estaba en mi saldo' }, ...compras.map((m) => ({ value: m.id, label: etiquetaCompra(m) }))], preferida ? preferida.id : '');
  const fCat = select(state.data.categorias.filter((x) => x.tipo !== 'recurrente').map((x) => ({ value: x.id, label: x.nombre })), 'otros-var');
  const info = h('div', { class: 'card-sub full', 'aria-live': 'polite' });
  const compraSel = () => compras.find((m) => m.id === fCompra.value);
  const disponible = (m) => m.monto - (atribuido(m) - parteDe(m, c.id));
  const bloqueCompra = field('¿En qué compra ya estaba pagado?', fCompra, 'full');
  const bloqueCat = field('Categoría de lo que falta', fCat, 'full');
  const pintar = () => {
    const dif = Math.round(fReal.getValue() - base);
    const cu = cuentaDinero(fCuenta.value);
    const m = compraSel();
    const sinCuenta = !fCuenta.value;
    bloqueCompra.style.display = dif > 0 && sinCuenta ? '' : 'none';
    bloqueCat.style.display = dif > 0 && !(sinCuenta && m) ? '' : 'none';
    const reemplazo = previos.length ? ` Se reemplaza el ajuste anterior de ${money(sum(previos))}${previos.some((x) => x.cuentaId) ? ' (se devuelve a su cuenta)' : ''}.` : '';
    if (dif < 0) info.textContent = `Lo registrado de verdad es ${money(base)}, más de lo que escribiste. Quita arriba lo que no corresponda.`;
    else if (dif === 0) info.textContent = 'Ya está todo registrado: solo queda marcado como ajustado a lo real.' + reemplazo;
    else if (cu) info.textContent = `Ya tienes registrado ${money(base)}: se agregan ${money(dif)} que salen de ${cu.nombre} (hoy ${money(cu.saldo)} → quedará ${money(cu.saldo - dif)}).` + reemplazo;
    else if (m) info.textContent = `Se cuentan ${money(dif)} de «${m.concepto}» a este compromiso. No se descuenta de ninguna cuenta: esa compra ya salió completa.` + (dif > disponible(m) ? ` OJO: esa compra solo tiene ${money(disponible(m))} disponibles.` : '') + reemplazo;
    else info.textContent = `Se agregan ${money(dif)} sin descontar de ninguna cuenta (efectivo o ya estaba en tu saldo).` + reemplazo;
  };
  fReal.addEventListener('input', pintar);
  [fCuenta, fCompra].forEach((el) => el.addEventListener('change', pintar));
  pintar();
  const quitarAtribucion = (m) => (ev) => {
    const dlg = ev.currentTarget.closest('dialog');
    dlg.close(); dlg.remove();
    atribuirCompra(m.id, c.id, 0);
    hooks.rerender();
    abrirGastoReal(state.data.compromisos.find((x) => x.id === c.id));
  };
  const gastos = gastosDeCompromiso(c.id);
  modal('¿Cuánto se gastó de verdad en «' + c.nombre + '»?', [
    h('div', { class: 'card-sub full' }, `Presupuesto ${money(c.presupuesto)} · registrado ${money(base)}${previos.length ? ` (más un ajuste anterior de ${money(sum(previos))} que se reemplaza)` : ''}. Escribe el total real, lo ya registrado incluido.`),
    gastos.length ? h('div', { class: 'full' }, gastos.map(({ m, monto, parcial }) => h('div', { class: 'list-item' + (esAjusteReal(m) ? ' tachado' : '') },
      h('div', {}, h('div', { class: 'name' }, m.concepto), h('div', { class: 'meta' },
        dayShort(m.fecha) + (m.cuentaId && nombreCuenta(m.cuentaId) ? ' · ' + nombreCuenta(m.cuentaId) : '') + (parcial ? ` · parte de una compra de ${money(m.monto)}` : '') + (esAjusteReal(m) ? ' · ajuste anterior: se reemplaza' : ''),
        parcial ? h('button', { type: 'button', class: 'btn ghost sm', title: 'Quitar esta atribución (no mueve ninguna cuenta)', onclick: quitarAtribucion(m) }, 'Quitar') : null)),
      h('span', { class: 'amt num' }, money(monto))))) : null,
    field('Gasto real total', fReal, 'full'),
    cuentas.length ? field('Lo que falta por registrar, ¿de qué cuenta salió?', fCuenta, 'full') : null,
    bloqueCompra,
    bloqueCat,
    info,
    h('div', { class: 'card-sub full' }, 'Si lo pagaste con la tarjeta de crédito, regístralo mejor en Créditos y aquí deja "Ninguna".'),
  ], {
    guardar: 'Guardar gasto real',
    onSave: () => {
      const real = fReal.getValue();
      const dif = Math.round(real - base);
      if (dif < 0) return `Lo registrado de verdad (${money(base)}) supera lo que escribiste. Quita arriba lo que no corresponda.`;
      const m = dif > 0 && !fCuenta.value ? compraSel() : null;
      if (m && dif > disponible(m)) return `«${m.concepto}» solo tiene ${money(disponible(m))} disponibles para atribuir. Elige otra compra o una cuenta.`;
      const r = ajustarGastoReal(c.id, real, { cuentaId: fCuenta.value, categoria: fCat.value, compraId: m ? m.id : '' });
      if (fCuenta.value) recordarCuenta('gasto', '', fCuenta.value);
      toast(r.mov ? (avisoCuenta('gasto', r.mov.monto, r.mov.cuentaId) || `Gasto real guardado: ${money(real)}`)
        : r.compra ? `${money(r.dif)} de «${r.compra.concepto}» se cuentan a ${c.nombre}. No se descontó nada otra vez.` : `Ajustado: se gastó ${money(real)}`);
      hooks.rerender();
    },
    peligro: c.cerrado ? { label: 'Volver a abrir', fn: () => { reabrirCompromiso(c.id); hooks.rerender(); } } : null,
  });
}

// Una compra ya pagada trajo cosas de este compromiso (un parche, un regalo…): se dice cuánto fue. La compra ya salió completa de la cuenta,
// así que NO se descuenta otra vez; solo sube lo gastado del compromiso y baja lo gastado en mercado.
function modalAtribuir(c) {
  const { lista: candidatas, preferida } = comprasParaAtribuir(c);
  if (!candidatas.length) { toast('Todavía no hay compras pagadas para atribuir.'); return; }
  const fCompra = select(candidatas.map((m) => ({ value: m.id, label: etiquetaCompra(m) })), preferida.id);
  const fMonto = moneyInput(parteDe(preferida, c.id));
  const info = h('div', { class: 'card-sub full', 'aria-live': 'polite' });
  const actual = () => candidatas.find((m) => m.id === fCompra.value);
  const pintar = () => {
    const m = actual();
    const otras = atribuido(m) - parteDe(m, c.id);
    const tope = m.monto - otras;
    const parte = Math.min(fMonto.getValue(), tope);
    info.textContent = `La compra fue de ${money(m.monto)} y ya salió de ${m.cuentaId && nombreCuenta(m.cuentaId) ? nombreCuenta(m.cuentaId) : 'tus cuentas'}: no se descuenta otra vez. `
      + (parte > 0 ? `${money(parte)} se cuentan a «${c.nombre}»${m.categoria === 'mercado' ? ` y en el mercado queda ${money(m.monto - otras - parte)}` : ''}.` : 'Escribe cuánto de esa compra fue para este compromiso.');
  };
  fCompra.addEventListener('change', () => { fMonto.value = parteDe(actual(), c.id) ? new Intl.NumberFormat('es-CO').format(parteDe(actual(), c.id)) : ''; pintar(); });
  fMonto.addEventListener('input', pintar);
  pintar();
  modal('Atribuir parte de una compra a «' + c.nombre + '»', [
    h('div', { class: 'card-sub full' }, 'Por ejemplo: en el mercado de ayer compraste cosas para el parche. Dices cuánto fue y ese valor se cuenta al compromiso, sin descontar de la cuenta otra vez.'),
    field('Compra', fCompra, 'full'),
    field('¿Cuánto de esa compra fue para este compromiso?', fMonto, 'full'),
    info,
  ], {
    guardar: 'Atribuir',
    onSave: () => {
      const m = actual();
      const otras = atribuido(m) - parteDe(m, c.id);
      const valor = fMonto.getValue();
      if (valor > m.monto - otras) return `Esa compra solo tiene ${money(m.monto - otras)} disponibles para atribuir.`;
      atribuirCompra(m.id, c.id, valor);
      toast(valor > 0 ? `${money(valor)} de «${m.concepto}» se cuentan a ${c.nombre}. No se descontó nada otra vez.` : 'Atribución quitada');
      hooks.rerender();
    },
  });
}

function modalApartar(c) {
  const fMonto = moneyInput(0);
  modal('Apartar dinero para «' + c.nombre + '»', [
    field('Cuánto apartas ahora', fMonto, 'full'),
    h('div', { class: 'card-sub full' }, `Ya apartado: ${money(c.apartado || 0)} de ${money(c.presupuesto)}.`),
  ], {
    onSave: () => {
      if (!fMonto.getValue()) return 'Escribe el valor.';
      saveCompromiso({ ...c, apartado: (c.apartado || 0) + fMonto.getValue() });
      hooks.rerender();
    },
  });
}

// En qué se gastó un compromiso (sus gastos y lo atribuido de otras compras), para ver de dónde sale la cifra.
function detalleGastos(c) {
  const gastos = gastosDeCompromiso(c.id);
  if (!gastos.length) return null;
  return h('details', {}, h('summary', {}, `En qué se gastó (${gastos.length})`),
    gastos.map(({ m, monto, parcial }) => h('div', { class: 'list-item' },
      h('div', {}, h('div', { class: 'name' }, m.concepto), h('div', { class: 'meta' }, dayShort(m.fecha) + (m.cuentaId && nombreCuenta(m.cuentaId) ? ' · ' + nombreCuenta(m.cuentaId) : '') + (parcial ? ` · parte de una compra de ${money(m.monto)}` : ''))),
      h('span', { class: 'amt num' }, money(monto)))));
}

export function renderCompromisos(root) {
  const hoy = todayISO();
  const mesHoy = hoy.slice(0, 7);
  const lista = [...state.data.compromisos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const proximos = lista.filter((c) => c.fecha >= hoy.slice(0, 7) + '-01');
  const pasados = lista.filter((c) => c.fecha < hoy.slice(0, 7) + '-01');

  // ---- ¿Caben? Margen de los próximos meses ----
  const meses = Array.from({ length: 6 }, (_, i) => addMonths(hoy, i).slice(0, 7));
  const mg = new Map(meses.map((m) => [m, margenMes(m)]));
  const filaMes = (ym) => {
    const x = mg.get(ym);
    const ok = x.queda >= 0;
    return h('tr', {},
      h('td', {}, h('b', {}, monthName(ym + '-01'))),
      h('td', { class: 'r' }, money(x.base)),
      h('td', { class: 'r' }, money(x.fijos)),
      h('td', { class: 'r' }, money(x.libre)),
      h('td', { class: 'r' }, money(x.reservado)),
      h('td', { class: 'r', style: ok ? {} : { color: 'var(--crit-ink)' } }, (ok ? '' : '▲ ') + money(x.queda)),
      h('td', {}, x.reservado > 0 ? (ok ? h('span', { class: 'estado-ok' }, '✓ Caben') : h('span', { class: 'status crit' }, 'Te pasas')) : h('span', { class: 'muted' }, 'Sin compromisos')));
  };
  const resumen = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', {},
      h('div', { class: 'card-title' }, '¿Cuánto me queda para compromisos?'),
      h('div', { class: 'card-sub' }, 'Ingresos del mes − fijos (recurrentes, créditos, mercado) = libre. De lo libre salen los compromisos, tu hormiga y tus gustos.')),
    h('button', { class: 'btn primary', onclick: () => modalCompromiso() }, '+ Nuevo compromiso')),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Mes'), h('th', { class: 'r' }, 'Ingresos'), h('th', { class: 'r' }, 'Fijos'),
        h('th', { class: 'r' }, 'Libre'), h('th', { class: 'r' }, 'Compromisos'), h('th', { class: 'r' }, 'Queda'), h('th', {}, 'Estado'))),
      h('tbody', {}, meses.map(filaMes)))),
    h('div', { class: 'card-sub' }, 'Ingresos = lo esperado (o lo recibido si fue más). En meses sin plan se usan tus ingresos recurrentes. Los gastos hormiga y variables no se restan: salen de lo libre. La tarjeta se proyecta con las cuotas ya comprometidas.'));

  // ---- Tarjeta por compromiso ----
  const pc = planCaja();
  const tarjeta = (c) => {
    const gastado = compromisoGastado(c.id);
    const ym = c.fecha.slice(0, 7);
    const dias = daysBetween(hoy, c.fecha);
    const pasado = c.fechaAprox ? ym < mesHoy : dias < 0;
    const delPlan = pc.compromisos.find((x) => x.c.id === c.id);
    const definido = c.presupuesto > 0;
    const maximoPlan = delPlan ? delPlan.maximo : 0;
    const tope = definido ? c.presupuesto : maximoPlan; // lo que se puede gastar: tu presupuesto o, si no hay, el máximo que permite el plan
    const restante = tope - gastado;
    const m = margenMes(ym);
    const otrosReservado = m.reservado - (definido ? reservadoDe(c) : 0);
    const maximo = m.libre - otrosReservado;
    const apartado = c.apartado || 0;
    const faltaAhorrar = Math.max(0, tope - gastado - apartado);
    const mesesHasta = Math.max(1, (parse(c.fecha).getFullYear() * 12 + parse(c.fecha).getMonth()) - (parse(hoy).getFullYear() * 12 + parse(hoy).getMonth()));
    const ratio = tope > 0 ? gastado / tope : 0;
    const clase = ratio > 1 ? 'crit' : ratio >= 0.85 ? 'warn' : '';
    const fila = (a, b) => h('div', { class: 'list-item' }, h('div', { class: 'name' }, a), h('span', { class: 'amt num' }, b));
    const cuando = c.fechaAprox ? `${monthName(ym + '-01').split(' ')[0]} · fecha por confirmar`
      : `${fechaLarga(c.fecha)}${c.fechaFin ? ' – ' + fechaLarga(c.fechaFin) : ''} · ${pasado ? 'ya pasó' : dias === 0 ? 'es hoy' : `faltan ${dias} día${dias === 1 ? '' : 's'}`}`;
    return h('section', { class: 'card w3' + (pasado ? ' pasado' : '') },
      h('div', { class: 'card-head' },
        h('div', {}, h('div', { class: 'card-title' }, c.nombre), h('div', { class: 'card-sub' }, `${tipoLabel(c.tipo)} · ${cuando}`)),
        h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + c.nombre, onclick: () => modalCompromiso(c) }, '✎')),
      h('div', { class: 'tile-value num', style: { fontSize: '26px' } }, tope > 0 || definido ? money(tope) : '—'),
      h('div', { class: 'card-sub' }, definido ? 'Presupuesto' : (delPlan ? 'Máximo que puedes gastar según tu Plan del mes (fija tu presupuesto para apartarlo)' : 'Sin presupuesto: el máximo se calcula cuando empiece su mes')),
      tope > 0 ? h('div', { class: 'meter ' + clase, role: 'progressbar', 'aria-valuenow': Math.round(Math.min(1, ratio) * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('i', { style: { width: Math.min(100, ratio * 100) + '%' } })) : null,
      h('div', {},
        fila(`Gastado${tope > 0 ? ` (${pct(Math.min(ratio, 9.99))})` : ''}`, money(gastado)),
        tope > 0 ? fila(restante >= 0 ? 'Te queda por gastar' : 'Te pasaste por', money(Math.abs(restante))) : null,
        fila('Apartado', money(apartado)),
        delPlan ? fila('Tendrás en cuentas ese día', money(delPlan.saldoAntes)) : null),
      c.cerrado ? h('div', { class: 'card-sub' }, `✓ Ajustado al gasto real: ${money(c.gastoReal != null ? c.gastoReal : gastado)}`) : null,
      detalleGastos(c),
      !pasado && definido
        ? h('div', { class: 'callout' },
          c.presupuesto <= maximo
            ? h('span', {}, '✓ Cabe: en ', mesCorto(ym), ` te quedan ${money(maximo)} libres para este compromiso (presupuesto ${money(c.presupuesto)}).`)
            : h('span', { class: 'status crit' }, `▲ No cabe: en ${mesCorto(ym)} solo hay ${money(Math.max(0, maximo))} libres para este compromiso; te pasarías por ${money(c.presupuesto - Math.max(0, maximo))}.`),
          faltaAhorrar > 0 ? h('div', { class: 'card-sub num' }, `Faltan ${money(faltaAhorrar)} por apartar: ≈ ${money(faltaAhorrar / mesesHasta)} al mes durante ${mesesHasta} mes${mesesHasta === 1 ? '' : 'es'}.`) : h('div', { class: 'card-sub' }, '✓ Ya tienes apartado todo el presupuesto.'))
        : null,
      !pasado && !definido && !delPlan
        ? h('div', { class: 'callout' }, `En ${mesCorto(ym)} te quedarían unos ${money(Math.max(0, m.queda))} libres antes de este compromiso. Pon un presupuesto o espera a que llegue su mes para ver el máximo.`)
        : null,
      c.nota ? h('div', { class: 'card-sub' }, c.nota) : null,
      h('div', { class: 'row' },
        pasado ? h('button', { class: 'btn sm primary', onclick: () => abrirGastoReal(c) }, c.cerrado ? 'Cambiar gasto real' : 'Ajustar gasto real') : null,
        h('button', { class: 'btn sm', onclick: () => modalGasto(c) }, '+ Gasto'),
        h('button', { class: 'btn sm', title: 'Una compra ya pagada trajo cosas de este compromiso', onclick: () => modalAtribuir(c) }, 'Atribuir parte de una compra'),
        pasado ? null : h('button', { class: 'btn sm', onclick: () => modalApartar(c) }, '+ Apartar dinero')));
  };

  const cuerpo = [];
  if (!lista.length) {
    cuerpo.push(h('section', { class: 'card w6' }, h('div', { class: 'empty' },
      h('h3', {}, 'Aún no tienes compromisos'),
      h('div', {}, 'Agrega paseos, cumpleaños, grados y otros eventos con su fecha y presupuesto. Aquí verás si caben en tus ingresos de cada mes.'),
      h('button', { class: 'btn primary', onclick: () => modalCompromiso() }, '+ Nuevo compromiso'))));
  } else {
    cuerpo.push(...proximos.map(tarjeta));
    if (pasados.length) {
      cuerpo.push(h('section', { class: 'card w6' }, h('div', { class: 'card-title' }, 'Ya pasaron'),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Compromiso'), h('th', {}, 'Fecha'), h('th', { class: 'r' }, 'Presupuesto'), h('th', { class: 'r' }, 'Gastado'), h('th', {}, 'Gasto real'), h('th'))),
          h('tbody', {}, [...pasados].reverse().map((c) => h('tr', {},
            h('td', {}, `${c.nombre} · ${tipoLabel(c.tipo)}`), h('td', {}, fechaLarga(c.fecha)), h('td', { class: 'r' }, money(c.presupuesto)), h('td', { class: 'r' }, money(compromisoGastado(c.id))),
            h('td', {}, h('button', { class: 'btn sm' + (c.cerrado ? ' ghost' : ''), onclick: () => abrirGastoReal(c) }, c.cerrado ? '✓ Ajustado' : 'Ajustar')),
            h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + c.nombre, onclick: () => modalCompromiso(c) }, '✎')))))))));
    }
  }
  root.replaceChildren(h('div', { class: 'stack' }, resumen, h('div', { class: 'grid' }, ...cuerpo)));
}
