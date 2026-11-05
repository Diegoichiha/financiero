// Pestaña Compromisos: paseos, cumpleaños, grados y otros gastos importantes con fecha y presupuesto.
// Responde: ¿cuánto puedo gastar en cada uno sin dañar el presupuesto de fijos?
import {
  h, money, uid, todayISO, daysBetween, addMonths, parse, MESES_C, monthName, dayShort, pct,
} from './util.js';
import {
  state, hooks, cuentaSugerida, recordarCuenta, saveCompromiso, delCompromiso, compromisoGastado, margenMes, addMov, sum, categoria, planCaja,
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

import { selectorCuenta, esMedioSinCuenta, avisoCuenta } from './cuentas-enlace.js';

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
    const otrosReservado = m.reservado - (definido ? Math.max(c.presupuesto, gastado) : 0);
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
        h('button', { class: 'btn sm', onclick: () => modalGasto(c) }, '+ Gasto'),
        h('button', { class: 'btn sm', onclick: () => modalApartar(c) }, '+ Apartar dinero')));
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
          h('thead', {}, h('tr', {}, h('th', {}, 'Compromiso'), h('th', {}, 'Fecha'), h('th', { class: 'r' }, 'Presupuesto'), h('th', { class: 'r' }, 'Gastado'), h('th'))),
          h('tbody', {}, [...pasados].reverse().map((c) => h('tr', {},
            h('td', {}, `${c.nombre} · ${tipoLabel(c.tipo)}`), h('td', {}, fechaLarga(c.fecha)), h('td', { class: 'r' }, money(c.presupuesto)), h('td', { class: 'r' }, money(compromisoGastado(c.id))),
            h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + c.nombre, onclick: () => modalCompromiso(c) }, '✎')))))))));
    }
  }
  root.replaceChildren(h('div', { class: 'stack' }, resumen, h('div', { class: 'grid' }, ...cuerpo)));
}
