// Conexión entre los ingresos, los gastos y las cuentas del Plan del mes ("Tengo hoy").
// Un ingreso con cuenta SUMA a esa cuenta; un pago con cuenta RESTA. Se deshace solo al editar, borrar o volver a pendiente.
import { h, money, dayShort, todayISO } from './util.js';
import {
  state, hooks, marcarPagado, cuentaSugerida, recordarCuenta, cuentaDinero, esMedioSinCuenta, pagosSinCuenta, asignarCuentas, sum,
} from './store.js';
import { modal, select, field, toast } from './ui.js';

export { esMedioSinCuenta };
export const hayCuentas = () => state.data.cuentasDinero.length > 0;
export const nombreCuenta = (id) => (cuentaDinero(id) ? cuentaDinero(id).nombre : '');

// Lista de cuentas (con su saldo de hoy) y la opción de no tocar ninguna.
export function selectorCuenta(valor, tipo, ninguna) {
  const sinCuenta = ninguna || (tipo === 'ingreso' ? 'Ninguna: ya la tenía en mi saldo (no sumar)' : 'Ninguna: efectivo o tarjeta (no descontar)');
  const opciones = [...state.data.cuentasDinero.map((c) => ({ value: c.id, label: `${c.nombre} · hoy ${money(c.saldo)}` })), { value: '', label: sinCuenta }];
  return select(opciones, valor && cuentaDinero(valor) ? valor : '');
}

// Mensaje corto con el efecto que tuvo en la cuenta (se llama DESPUÉS de guardar).
export function avisoCuenta(tipo, monto, cuentaId) {
  const c = cuentaDinero(cuentaId);
  if (!c) return null;
  return tipo === 'ingreso'
    ? `Se sumaron ${money(monto)} a ${c.nombre} · ahora tiene ${money(c.saldo)}`
    : `Se descontaron ${money(monto)} de ${c.nombre} · ahora tiene ${money(c.saldo)}`;
}

// "Marcar pagado": pregunta de qué cuenta salió el pago y lo descuenta de "Tengo hoy".
export function pagarMov(m, alTerminar) {
  const terminar = alTerminar || (() => hooks.rerender());
  if (!hayCuentas()) { marcarPagado(m.id, true); terminar(); return; }
  const inicial = esMedioSinCuenta(m.medio) ? '' : (m.cuentaId && cuentaDinero(m.cuentaId) ? m.cuentaId : cuentaSugerida('gasto', m.concepto));
  const sel = selectorCuenta(inicial, 'gasto');
  modal(`¿De qué cuenta pagaste «${m.concepto}»?`, [
    h('div', { class: 'card-sub full' }, `${money(m.monto)} · se descuenta de "Tengo hoy" en el Plan del mes.`),
    field('Cuenta', sel, 'full'),
  ], {
    guardar: 'Marcar pagado',
    onSave: () => {
      recordarCuenta('gasto', m.concepto, sel.value);
      marcarPagado(m.id, true, sel.value);
      toast(avisoCuenta('gasto', m.monto, sel.value) || 'Marcado como pagado');
      terminar();
    },
  });
}

// Volver un pago a pendiente: la plata vuelve sola a la cuenta de donde salió.
export function desmarcarPago(m, alTerminar) {
  const c = cuentaDinero(m.cuentaId);
  marcarPagado(m.id, false);
  toast(c ? `Se devolvieron ${money(m.monto)} a ${c.nombre} · ahora tiene ${money(c.saldo)}` : 'Vuelto a pendiente');
  (alTerminar || (() => hooks.rerender()))();
}

// ---------------------------------------------------------------------------------------------------------------------
// Pagos que se hicieron sin elegir de qué cuenta salieron: el plan no los descontó. Aquí se eligen y se descuentan de una vez.
export function modalPagosSinCuenta(soloEstos) {
  const lista = soloEstos || pagosSinCuenta();
  if (!lista.length) { toast('No hay pagos sin cuenta.'); return; }
  const filas = lista.map((m) => ({ m, sel: selectorCuenta(cuentaSugerida('gasto', m.concepto), 'gasto', 'Ninguna: ya estaba descontado de mi saldo') }));
  const efecto = h('div', { class: 'card-sub full', 'aria-live': 'polite' });
  const pintar = () => {
    const por = new Map();
    for (const { m, sel } of filas) if (sel.value) por.set(sel.value, (por.get(sel.value) || 0) + m.monto);
    efecto.replaceChildren(...(por.size
      ? [...por].map(([id, total]) => h('div', {}, `${nombreCuenta(id)}: hoy ${money(cuentaDinero(id).saldo)} → quedará ${money(cuentaDinero(id).saldo - total)}`))
      : [h('div', {}, 'No se descontará de ninguna cuenta.')]));
  };
  filas.forEach(({ sel }) => sel.addEventListener('change', pintar));
  pintar();
  modal(lista.length === 1 ? `¿De qué cuenta pagaste «${lista[0].concepto}»?` : 'Pagos que no se han descontado de ninguna cuenta', [
    h('div', { class: 'card-sub full' }, 'Elige la cuenta de donde salió cada pago y se descuenta de "Tengo hoy": así el plan queda al día. Si ya lo habías restado de tu saldo, elige "Ninguna".'),
    ...filas.map(({ m, sel }) => field(`${m.concepto} · ${money(m.monto)} · ${dayShort(m.fecha)}${m.hora ? ' ' + m.hora : ''}`, sel, 'full')),
    efecto,
  ], {
    guardar: 'Descontar',
    onSave: () => {
      for (const { m, sel } of filas) recordarCuenta('gasto', m.concepto, sel.value);
      const mensajes = filas.filter(({ sel }) => sel.value).map(({ m, sel }) => ({ id: m.id, cuentaId: sel.value, monto: m.monto }));
      asignarCuentas(filas.map(({ m, sel }) => ({ id: m.id, cuentaId: sel.value })));
      const total = sum(mensajes, (x) => x.monto);
      toast(mensajes.length ? `Se descontaron ${money(total)} de tus cuentas` : 'Listo: quedaron como ya descontados');
      hooks.rerender();
    },
  });
}

// Aviso que se ve en todas las pestañas mientras haya pagos sin cuenta.
export function avisoSinCuenta() {
  const lista = pagosSinCuenta();
  if (!lista.length) return null;
  const nombres = lista.slice(0, 3).map((m) => m.concepto).join(', ') + (lista.length > 3 ? '…' : '');
  return h('div', { class: 'banner' },
    h('span', {}, h('b', {}, lista.length === 1 ? '1 pago sin cuenta' : `${lista.length} pagos sin cuenta`), ` (${nombres}) por ${money(sum(lista, (m) => m.monto))}: el plan todavía no los descontó de ninguna cuenta.`),
    h('button', { class: 'btn sm primary', onclick: () => modalPagosSinCuenta() }, 'Descontar de mi cuenta'));
}

// Cuánta plata hay en cada cuenta, con lo que ya salió hoy. Si se pasa `alElegir`, cada cuenta sirve de filtro.
export function barraCuentas({ activa = '', alElegir } = {}) {
  const cuentas = state.data.cuentasDinero;
  if (!cuentas.length) return null;
  const hoy = todayISO();
  const saleHoy = (id) => sum(state.data.movimientos.filter((m) => m.estado === 'pagado' && m.fecha === hoy && m.cuentaId === id));
  const entraHoy = (id) => sum(state.data.ingresos.filter((i) => i.fecha === hoy && i.cuentaId === id));
  const tile = (id, nombre, saldo, sub, extra = '') => {
    const hijos = [h('span', { class: 'nm' }, nombre), h('span', { class: 'sd num' + (saldo < 0 ? ' neg' : '') }, money(saldo)), sub ? h('span', { class: 'sb' }, sub) : null];
    return alElegir && id !== 'total'
      ? h('button', { type: 'button', class: 'cta' + extra, 'aria-pressed': String(activa === id), title: activa === id ? 'Quitar el filtro' : `Ver solo lo que salió de ${nombre}`, onclick: () => alElegir(activa === id ? '' : id) }, ...hijos)
      : h('div', { class: 'cta' + extra }, ...hijos);
  };
  return h('div', { class: 'cuentas-bar', role: 'group', 'aria-label': 'Saldo de cada cuenta' },
    tile('total', 'Tengo hoy', sum(cuentas, (c) => c.saldo), `${cuentas.length} cuenta${cuentas.length === 1 ? '' : 's'}`, ' total'),
    ...cuentas.map((c) => {
      const sale = saleHoy(c.id), entra = entraHoy(c.id);
      const partes = [entra > 0 ? `+ ${money(entra)} hoy` : null, sale > 0 ? `− ${money(sale)} hoy` : null].filter(Boolean);
      return tile(c.id, c.nombre, c.saldo, partes.length ? partes.join(' · ') : 'Saldo al ' + dayShort(c.fecha));
    }));
}
