// Conexión entre los ingresos, los gastos y las cuentas del Plan del mes ("Tengo hoy").
// Un ingreso con cuenta SUMA a esa cuenta; un pago con cuenta RESTA. Se deshace solo al editar, borrar o volver a pendiente.
import { h, money, dayShort, todayISO } from './util.js';
import {
  state, hooks, marcarPagado, cuentaSugerida, recordarCuenta, cuentaDinero, esMedioSinCuenta, sum, gmfDe, conPago, pagarConTarjeta, tarjetaById,
} from './store.js';
import { modal, select, field, toast } from './ui.js';

export { esMedioSinCuenta };
export const hayCuentas = () => state.data.cuentasDinero.length > 0;
export const nombreCuenta = (id) => (cuentaDinero(id) ? cuentaDinero(id).nombre : '');

// Lista de cuentas (con su saldo de hoy) y la opción de no tocar ninguna.
export function selectorCuenta(valor, tipo, ninguna, conTarjetas = false) {
  const sinCuenta = ninguna || (tipo === 'ingreso' ? 'Ninguna: ya la tenía en mi saldo (no sumar)' : 'Ninguna: efectivo o tarjeta (no descontar)');
  const tarjetas = conTarjetas ? state.data.tarjetas.map((t) => ({ value: '@tc:' + t.id, label: `Tarjeta ${t.nombre} (crédito)` })) : [];
  const opciones = [...state.data.cuentasDinero.map((c) => ({ value: c.id, label: `${c.nombre} · hoy ${money(c.saldo)}` })), ...tarjetas, { value: '', label: sinCuenta }];
  return select(opciones, valor && (cuentaDinero(valor) || tarjetas.some((t) => t.value === valor)) ? valor : '');
}

// Mensaje corto con el efecto que tuvo en la cuenta (se llama DESPUÉS de guardar).
export function avisoCuenta(tipo, monto, cuentaId, mov) {
  const c = cuentaDinero(cuentaId);
  if (!c) return null;
  const gmf = tipo === 'gasto' ? gmfDe(mov) : 0;
  return tipo === 'ingreso'
    ? `Se sumaron ${money(monto)} a ${c.nombre} · ahora tiene ${money(c.saldo)}`
    : `Se descontaron ${money(monto)}${gmf ? ` + ${money(gmf)} de 4x1000` : ''} de ${c.nombre} · ahora tiene ${money(c.saldo)}`;
}

// "Marcar pagado": pregunta de qué cuenta salió el pago y lo descuenta de "Tengo hoy".
export function pagarMov(m, alTerminar) {
  const terminar = alTerminar || (() => hooks.rerender());
  if (!hayCuentas()) { marcarPagado(m.id, true); terminar(); return; }
  // Si el pago recurrente ya dice con qué se paga (una cuenta o la tarjeta), esa es la que se propone.
  const pl = m.plantillaId && state.data.plantillas.find((x) => x.id === m.plantillaId);
  const con = pl ? conPago(pl, m.nPago || 0) : '';
  const inicial = con && (cuentaDinero(con) || (con.startsWith('@tc:') && tarjetaById(con.slice(4)))) ? con
    : esMedioSinCuenta(m.medio) ? '' : (m.cuentaId && cuentaDinero(m.cuentaId) ? m.cuentaId : cuentaSugerida('gasto', m.concepto));
  const sel = selectorCuenta(inicial, 'gasto', undefined, true);
  modal(`¿Con qué pagaste «${m.concepto}»?`, [
    h('div', { class: 'card-sub full' }, `${money(m.monto)} · si es una cuenta, se descuenta de "Tengo hoy"; si es la tarjeta, entra en su extracto.`),
    field('Cuenta o tarjeta', sel, 'full'),
  ], {
    guardar: 'Marcar pagado',
    onSave: () => {
      if (sel.value.startsWith('@tc:')) {
        const r = pagarConTarjeta(m.id, sel.value.slice(4));
        toast(r ? `Pagado con ${r.tarjeta.nombre}: entra en el extracto del corte ${dayShort(r.corte)} (se paga el ${dayShort(r.pago)})` : 'No se encontró la tarjeta');
        terminar();
        return;
      }
      recordarCuenta('gasto', m.concepto, sel.value);
      marcarPagado(m.id, true, sel.value);
      toast(avisoCuenta('gasto', m.monto, sel.value, m) || 'Marcado como pagado');
      terminar();
    },
  });
}

// Volver un pago a pendiente: la plata vuelve sola a la cuenta de donde salió.
export function desmarcarPago(m, alTerminar) {
  const c = cuentaDinero(m.cuentaId);
  const devuelto = m.monto + gmfDe(m); // incluye el 4x1000 si lo llevaba
  const eraTarjeta = !!m.tarjetaCompra;
  marcarPagado(m.id, false); // si se había pagado con la tarjeta, también se quita esa compra
  if (eraTarjeta) { toast('Vuelto a pendiente: se quitó la compra de la tarjeta'); (alTerminar || (() => hooks.rerender()))(); return; }
  toast(c ? `Se devolvieron ${money(devuelto)} a ${c.nombre} · ahora tiene ${money(c.saldo)}` : 'Vuelto a pendiente');
  (alTerminar || (() => hooks.rerender()))();
}

// Lo que entró y salió hoy de una cuenta, para ver al instante cómo se movió su saldo.
export function movimientoHoy(cuentaId) {
  const hoy = todayISO();
  const sale = sum(state.data.movimientos.filter((m) => m.estado === 'pagado' && m.fecha === hoy && m.cuentaId === cuentaId), (m) => m.monto + gmfDe(m));
  const entra = sum(state.data.ingresos.filter((i) => i.fecha === hoy && i.cuentaId === cuentaId));
  return [entra > 0 ? `+ ${money(entra)} hoy` : null, sale > 0 ? `− ${money(sale)} hoy` : null].filter(Boolean).join(' · ');
}

// Cuánta plata hay en cada cuenta, con lo que ya salió hoy. Si se pasa `alElegir`, cada cuenta sirve de filtro.
export function barraCuentas({ activa = '', alElegir } = {}) {
  const cuentas = state.data.cuentasDinero;
  if (!cuentas.length) return null;
  const tile = (id, nombre, saldo, sub, extra = '') => {
    const hijos = [h('span', { class: 'nm' }, nombre), h('span', { class: 'sd num' + (saldo < 0 ? ' neg' : '') }, money(saldo)), sub ? h('span', { class: 'sb' }, sub) : null];
    return alElegir && id !== 'total'
      ? h('button', { type: 'button', class: 'cta' + extra, 'aria-pressed': String(activa === id), title: activa === id ? 'Quitar el filtro' : `Ver solo lo que salió de ${nombre}`, onclick: () => alElegir(activa === id ? '' : id) }, ...hijos)
      : h('div', { class: 'cta' + extra }, ...hijos);
  };
  return h('div', { class: 'cuentas-bar', role: 'group', 'aria-label': 'Saldo de cada cuenta' },
    tile('total', 'Tengo hoy', sum(cuentas, (c) => c.saldo), `${cuentas.length} cuenta${cuentas.length === 1 ? '' : 's'}`, ' total'),
    ...cuentas.map((c) => tile(c.id, c.nombre, c.saldo, movimientoHoy(c.id) || 'Saldo al ' + dayShort(c.fecha))));
}
