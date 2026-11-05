// Conexión entre los ingresos, los gastos y las cuentas del Plan del mes ("Tengo hoy").
// Un ingreso con cuenta SUMA a esa cuenta; un pago con cuenta RESTA. Se deshace solo al editar, borrar o volver a pendiente.
import { h, money } from './util.js';
import { state, hooks, marcarPagado, cuentaSugerida, recordarCuenta, cuentaDinero } from './store.js';
import { modal, select, field, toast } from './ui.js';

export const hayCuentas = () => state.data.cuentasDinero.length > 0;
export const nombreCuenta = (id) => (cuentaDinero(id) ? cuentaDinero(id).nombre : '');
// Efectivo y tarjeta de crédito no salen de una cuenta del banco en el momento de comprar.
export const esMedioSinCuenta = (medio) => /efectivo|tarjeta de cr|cr[eé]dito|\btc\b|rappi card/i.test(medio || '');

// Lista de cuentas (con su saldo de hoy) y la opción de no tocar ninguna.
export function selectorCuenta(valor, tipo) {
  const ninguna = tipo === 'ingreso' ? 'Ninguna: ya la tenía en mi saldo (no sumar)' : 'Ninguna: efectivo o tarjeta (no descontar)';
  const opciones = [...state.data.cuentasDinero.map((c) => ({ value: c.id, label: `${c.nombre} · hoy ${money(c.saldo)}` })), { value: '', label: ninguna }];
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
