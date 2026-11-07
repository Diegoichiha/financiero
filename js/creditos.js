// Lógica pura de tarjeta de crédito (cortes, cuotas, proyección) y de créditos de cuota fija.
// No importa el estado: recibe la tarjeta / el crédito como argumento.
import { pad, daysInMonth, addMonths } from './util.js';

const ymDe = (f) => f.slice(0, 7);
const sumaMes = (ym, n) => addMonths(ym + '-01', n).slice(0, 7);
const clamp = (ym, dia) => `${ym}-${pad(Math.min(Math.max(dia, 1), daysInMonth(ym + '-01')))}`;
export const mesesEntre = (a, b) => (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7))) - (Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7)));
const suma = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);

// ---------- Fechas de la tarjeta ----------
// Corte al que pertenece algo comprado en `fecha` (el primer corte en o después de esa fecha).
export function corteDeFecha(fecha, t) {
  const ym = ymDe(fecha);
  return Number(fecha.slice(8)) <= t.corte ? clamp(ym, t.corte) : clamp(sumaMes(ym, 1), t.corte);
}
// Día de pago del extracto que cierra en `corte` (si el pago es antes que el corte, cae el mes siguiente).
export function pagoDeCorte(corte, t) {
  const ym = ymDe(corte);
  return clamp(t.diaPago <= t.corte ? sumaMes(ym, 1) : ym, t.diaPago);
}
// Corte del extracto que se paga en el mes `ymPago`.
export const corteDelPago = (ymPago, t) => clamp(t.diaPago <= t.corte ? sumaMes(ymPago, -1) : ymPago, t.corte);
export const corteMasN = (corte, t, n) => clamp(sumaMes(ymDe(corte), n), t.corte);

// ---------- Extractos ----------
export const compraCorte = (c, t) => (c.fecha ? corteDeFecha(c.fecha, t) : c.corte);

// Lo que trae el extracto que cierra en `corte`: compras de contado + cuotas de compras diferidas.
export function extracto(t, corte) {
  const compras = (t.compras || []).filter((c) => compraCorte(c, t) === corte);
  const cuotas = (t.planes || [])
    .map((plan) => ({ plan, n: plan.pagadas + mesesEntre(ymDe(plan.corteRef), ymDe(corte)) }))
    .filter((x) => x.n >= 1 && x.n <= x.plan.cuotas);
  const totalCompras = suma(compras, (c) => c.monto);
  const totalCuotas = suma(cuotas, (x) => x.plan.cuota);
  return {
    corte, pago: pagoDeCorte(corte, t), compras, cuotas, totalCompras, totalCuotas, total: totalCompras + totalCuotas,
    comprasMercado: suma(compras.filter((c) => c.categoria === 'mercado'), (c) => c.monto - suma(c.atribuciones || [], (a) => a.monto)),
  };
}
export const extractoPagadoEn = (t, ymPago) => extracto(t, corteDelPago(ymPago, t));

// Próximos `k` extractos desde el corte `desde`.
export const proyeccion = (t, desde, k) => Array.from({ length: k }, (_, i) => extracto(t, corteMasN(desde, t, i)));

// Resumen de una compra a cuotas: cuántas faltan y cuánto queda por pagar (sin intereses futuros extra).
export function estadoPlan(plan, corteActual) {
  const nActual = plan.pagadas + mesesEntre(ymDe(plan.corteRef), ymDe(corteActual));
  const facturadas = Math.min(plan.cuotas, Math.max(0, nActual - 1)); // antes del extracto abierto
  const restantes = Math.max(0, plan.cuotas - facturadas);
  return { nActual, facturadas, restantes, porPagar: restantes * plan.cuota, terminada: restantes === 0 };
}

// Cuota mensual de una compra diferida (con tasa efectiva mensual en %, o sin interés si es 0).
export function cuotaPmt(valor, n, tasaMV) {
  const r = (tasaMV || 0) / 100;
  if (!valor || !n) return 0;
  return r ? (valor * r) / (1 - Math.pow(1 + r, -n)) : valor / n;
}

// ---------- Crédito de cuota fija (carro) ----------
export function amortizacion(saldo, tasaMV, cuota) {
  const r = (tasaMV || 0) / 100;
  const interes = saldo * r;
  const capital = cuota - interes;
  let restantes = null;
  if (cuota > interes && r > 0) restantes = Math.ceil(-Math.log(1 - (r * saldo) / cuota) / Math.log(1 + r));
  else if (r === 0 && cuota > 0) restantes = Math.ceil(saldo / cuota);
  return { interes, capital, restantes };
}
