// Estado, persistencia (servidor local) y consultas sobre los datos.
import {
  uid, pad, parse, monthName, MESES_C, todayISO, nowHHMM, monthStart, monthEnd, addDays, addMonths, weekStart, daysInMonth, mulberry32,
} from './util.js';
import { extractoPagadoEn, corteDeFecha, pagoDeCorte, corteMasN } from './creditos.js';

export const TIPOS = [
  { id: 'recurrente', nombre: 'Recurrentes', corto: 'Recurrente', cssVar: 'var(--s1)' },
  { id: 'variable', nombre: 'Variables', corto: 'Variable', cssVar: 'var(--s2)' },
  { id: 'hormiga', nombre: 'Hormiga', corto: 'Hormiga', cssVar: 'var(--s3)' },
];
export const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));

export const state = {
  data: null,
  period: { mode: 'mes', anchor: todayISO() },
  centro: 'todos',
  tab: 'resumen',
};

// Enlaces que app.js completa (evita dependencias circulares).
export const hooks = { rerender: () => {}, saveStatus: () => {}, goTab: () => {} };

// ---------- Carga y guardado ----------
const HEADERS = { 'X-Requested-With': 'finanzas' };

export async function load() {
  const r = await fetch('api/data', { headers: HEADERS });
  if (!r.ok) throw Object.assign(new Error('El servidor respondió ' + r.status), { status: r.status });
  state.data = await r.json();
  if (migrate(state.data)) save();
}

// Compras de Cañaveral de octubre 2026 que Diego dictó: se cargan una sola vez como historial
// (sin fechas, para no inventarlas); después se editan desde Ajustes.
const MERCADO_OCT_2026 = [118607, 38400, 237280, 68872, 72950, 284689, 63150, 225600, 21800, 8650, 68193, 142055];

// Datos que Diego dictó el 2026-11-03: tarjeta Rappi Card Black (corte 19, pago el 1 del mes siguiente), sus compras
// y cuotas, y el crédito del carro. Se cargan una sola vez; después se editan desde la pestaña Créditos.
const TARJETA_RAPPI = {
  id: 'rappi-black', nombre: 'Rappi Card Black', corte: 19, diaPago: 1,
  compras: [
    { id: 'tc-oct-1', fecha: null, corte: '2026-11-19', concepto: 'Compra con tarjeta (mercado)', monto: 142055, categoria: 'mercado' },
    { id: 'tc-oct-2', fecha: null, corte: '2026-11-19', concepto: 'Compra con tarjeta (mercado)', monto: 68193, categoria: 'mercado' },
    { id: 'tc-oct-3', fecha: null, corte: '2026-11-19', concepto: 'Compra con tarjeta', monto: 34980, categoria: 'otros-var' },
    { id: 'tc-oct-4', fecha: null, corte: '2026-11-19', concepto: 'Compra con tarjeta', monto: 141988, categoria: 'otros-var' },
  ],
  planes: [
    { id: 'pl-celular', concepto: 'Cuota celular', cuota: 164162, cuotas: 24, pagadas: 3, corteRef: '2026-10-19', tasaMV: 0 },
    { id: 'pl-servipeugeot', concepto: 'SERVIPEUGEOT', cuota: 200000, cuotas: 3, pagadas: 1, corteRef: '2026-10-19', tasaMV: 2.11 },
    { id: 'pl-190233', concepto: 'Compra a cuotas (sin nombre)', cuota: 190233, cuotas: 6, pagadas: 1, corteRef: '2026-10-19', tasaMV: 2.11 },
  ],
};
const CREDITO_CARRO = {
  id: 'carro', nombre: 'Crédito del carro', tipo: 'fija', cuota: 940000, diaPago: 2, saldo: 33321754.19, saldoFecha: '2026-11-03',
  tasaMV: 1.52, tasaEA: 19.84, primeraCuota: '2026-06-30', nota: 'Pagada la cuota de noviembre. Falta completar los datos del crédito.',
};

// Plan de noviembre 2026 dictado por Diego: saldos, cobros esperados con fecha y compromisos. Se carga una sola vez.
const PLAN_NOV_2026 = {
  cuentas: [
    { id: 'bancolombia', nombre: 'Bancolombia', saldo: 851498, fecha: '2026-11-03' },
    { id: 'bbva', nombre: 'BBVA', saldo: 1985397, fecha: '2026-11-03' },
  ],
  fuentes: [
    { id: 'f-markethink', nombre: 'Markethink', monto: 1200000, tipo: 'recurrente', centro: 'hogar', dia: 30 },
    { id: 'f-carpol', nombre: 'Proyecto Carpol', monto: 600000, tipo: 'recurrente', centro: 'hogar', dia: 6, hasta: '2027-04' },
  ],
  esperados: [
    { mes: '2026-11', fuenteId: 'f-markethink', nombre: 'Markethink', tipo: 'recurrente', cobros: [{ fecha: '2026-11-06', monto: 1150000 }, { fecha: '2026-11-30', monto: 600000 }] },
    { mes: '2026-11', fuenteId: 'f-carpol', nombre: 'Proyecto Carpol', tipo: 'recurrente', cobros: [{ fecha: '2026-11-07', monto: 600000 }] },
    { mes: '2026-11', nombre: 'Pago Web SIO', tipo: 'variable', cobros: [{ fecha: '2026-11-01', monto: 1250000 }, { fecha: '2026-11-30', monto: 1250000 }] },
  ],
  compromisos: [
    { id: 'cp-1106-amigos', nombre: 'Compartir con amigos (manjar y brevas con queso)', tipo: 'social', fecha: '2026-11-06', prioridad: 1 },
    { id: 'cp-1107-km18', nombre: 'Salida con amigos al km 18', tipo: 'social', fecha: '2026-11-07', prioridad: 1 },
    { id: 'cp-1114-pereira', nombre: 'Paseo a Pereira (regreso a Cali el lunes)', tipo: 'paseo', fecha: '2026-11-14', fechaFin: '2026-11-16', prioridad: 3 },
    { id: 'cp-1120-bailar', nombre: 'Cumpleaños: salida a bailar', tipo: 'cumpleanos', fecha: '2026-11-20', prioridad: 2 },
    { id: 'cp-1121-restaurante', nombre: 'Cumpleaños: ida a restaurante', tipo: 'cumpleanos', fecha: '2026-11-21', prioridad: 2 },
    { id: 'cp-1129-celebracion', nombre: 'Celebración de cumpleaños', tipo: 'cumpleanos', fecha: '2026-11-29', prioridad: 2 },
    { id: 'cp-dic-aniversario', nombre: 'Celebración aniversario', tipo: 'aniversario', fecha: '2026-12-15', fechaAprox: true, prioridad: 3 },
    { id: 'cp-dic-grado', nombre: 'Grado de Andrea', tipo: 'grado', fecha: '2026-12-15', fechaAprox: true, prioridad: 3 },
  ],
};

// Rutinas de gasto que Diego describió (3-nov-2026): comida rápida viernes y sábado ~$60.000, a veces el domingo,
// y ~$20.000 semanales de parqueadero del gimnasio. dia: 0 = lunes … 6 = domingo.
const RUTINAS_2026_11 = [
  { id: 'ru-comida-vie', nombre: 'Comida rápida (viernes)', categoria: 'comida-rapida', tipo: 'hormiga', monto: 60000, dia: 4 },
  { id: 'ru-comida-sab', nombre: 'Comida rápida (sábado)', categoria: 'comida-rapida', tipo: 'hormiga', monto: 60000, dia: 5 },
  { id: 'ru-comida-dom', nombre: 'Comida rápida (domingo, a veces)', categoria: 'comida-rapida', tipo: 'hormiga', monto: 60000, dia: 6, ocasional: true },
  { id: 'ru-parqueadero', nombre: 'Parqueadero del gimnasio (semanal)', categoria: 'transporte', tipo: 'variable', monto: 20000, dia: 0 },
];

// Más rutinas que Diego dictó (3-nov-2026): maduros y pasteles de pollo ~cada semana y media, y huevos ~$20.000 semanales.
// El día de los huevos y la próxima compra de maduros son supuestos: se ajustan en Plan del mes.
const RUTINAS2_2026_11 = [
  { id: 'ru-maduros', nombre: 'Maduros y pasteles de pollo', categoria: 'comida-rapida', tipo: 'hormiga', monto: 79000, cadaDias: 10.5, proximo: '2026-11-06' },
  { id: 'ru-huevos', nombre: 'Huevos (semanal)', categoria: 'mercado', tipo: 'variable', monto: 20000, dia: 2 },
];

// Fechas de una compra que se repite cada N días (puede ser 10,5), desde la fecha de la próxima compra.
function fechasCada(r, desde, hasta) {
  const out = [];
  if (!r.proximo || !(r.cadaDias > 0)) return out;
  for (let k = 0; k < 400; k++) {
    const f = addDays(r.proximo, Math.round(k * r.cadaDias));
    if (f > hasta) break;
    if (f >= desde) out.push(f);
  }
  return out;
}

function migrate(d) {
  let cambio = false;
  d.config ||= {};
  d.config.incluirCuotaCarro ??= true;
  d.config.presupuestos ||= { recurrente: 0, variable: 0, hormiga: 0 };
  d.config.tope ??= 0;
  d.config.mercadoEstimado ??= 0;
  d.config.ingresosEsperados ||= {};
  d.config.migraciones ||= [];
  d.config.autoExcluidos ||= [];
  d.config.colchonPct ??= 10;
  d.medios ||= ['Efectivo', 'Débito', 'Transferencia', 'Otro'];
  for (const k of ['centros', 'categorias', 'cuentas', 'plantillas', 'fuentesIngreso', 'movimientos', 'ingresos', 'mercadoHistorial', 'tarjetas', 'creditos', 'planIngresos', 'compromisos', 'cuentasDinero', 'rutinas', 'addi']) d[k] ||= [];
  d.config.planMaximo ??= true;
  d.config.diaCorte ??= 30;
  if (!d.config.migraciones.includes('plan-nov-2026')) {
    const P = PLAN_NOV_2026;
    if (!d.cuentasDinero.length) d.cuentasDinero.push(...P.cuentas.map((c) => ({ ...c })));
    for (const fu of P.fuentes) if (!d.fuentesIngreso.some((x) => x.id === fu.id || llave(x.nombre) === llave(fu.nombre))) d.fuentesIngreso.push({ ...fu });
    for (const fu of d.fuentesIngreso) if (fu.dia == null && /^(vec|tap)$/i.test(fu.nombre)) fu.dia = 1;
    for (const e of P.esperados) {
      const fila = { ...e, centro: 'hogar', esperado: e.cobros.reduce((a, c) => a + c.monto, 0) };
      const ya = d.planIngresos.find((r) => r.mes === e.mes && llave(r.nombre) === llave(e.nombre));
      if (ya) Object.assign(ya, fila); else d.planIngresos.push({ id: uid(), ...fila });
    }
    // Pago de Mamá: no estaba entre lo que Diego espera recibir en noviembre.
    d.planIngresos = d.planIngresos.filter((r) => !(r.mes === '2026-11' && r.fuenteId === 'f-mama'));
    if (!d.config.autoExcluidos.includes('f:f-mama|2026-11')) d.config.autoExcluidos.push('f:f-mama|2026-11');
    for (const c of P.compromisos) if (!d.compromisos.some((x) => x.id === c.id)) d.compromisos.push({ presupuesto: 0, apartado: 0, nota: '', ...c });
    d.config.migraciones.push('plan-nov-2026');
    cambio = true;
  }
  if (!d.config.migraciones.includes('rutinas-2026-11')) {
    for (const r of RUTINAS_2026_11) if (!d.rutinas.some((x) => x.id === r.id)) d.rutinas.push({ activo: true, ...r });
    d.config.migraciones.push('rutinas-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('rutinas2-2026-11')) {
    for (const r of RUTINAS2_2026_11) if (!d.rutinas.some((x) => x.id === r.id)) d.rutinas.push({ activo: true, ...r });
    d.config.migraciones.push('rutinas2-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('rutinas3-2026-11')) {
    // Aclaración de Diego: lo del fin de semana (~$60.000 viernes y sábado, a veces domingo) son DOMICILIOS; y el parqueadero
    // (~$20.000 por semana, 4–5 idas al gym) a veces es más: se agrega una ida extra ocasional. Solo se renombra lo que no editó.
    const ren = {
      'ru-comida-vie': ['Comida rápida (viernes)', 'Domicilios (viernes)'],
      'ru-comida-sab': ['Comida rápida (sábado)', 'Domicilios (sábado)'],
      'ru-comida-dom': ['Comida rápida (domingo, a veces)', 'Domicilios (domingo, a veces)'],
      'ru-parqueadero': ['Parqueadero del gimnasio (semanal)', 'Parqueadero del gimnasio (4–5 idas por semana)'],
    };
    for (const r of d.rutinas) {
      const x = ren[r.id];
      if (x && r.nombre === x[0]) { r.nombre = x[1]; if (r.id !== 'ru-parqueadero' && r.categoria === 'comida-rapida') r.categoria = 'domicilios'; }
    }
    if (!d.rutinas.some((r) => r.id === 'ru-parqueadero-extra')) {
      d.rutinas.push({ id: 'ru-parqueadero-extra', nombre: 'Parqueadero del gimnasio: idas extra (a veces)', categoria: 'transporte', tipo: 'variable', monto: 5000, dia: 0, ocasional: true, activo: true });
    }
    d.config.migraciones.push('rutinas3-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('cobro-30-2026-11')) {
    // Vectorial y Tapetes pagan el 30: ese pago es el ingreso del mes siguiente (llega por adelantado).
    for (const fu of d.fuentesIngreso) if (/^(vec|tap)$/i.test(fu.nombre)) { fu.dia = 30; fu.adelanto = true; }
    for (const r of d.planIngresos) if (r.mes === '2026-12' && /^(vec|tap)$/i.test(r.nombre) && !r.fechaEsperada) r.fechaEsperada = '2026-11-30';
    d.config.migraciones.push('cobro-30-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('markethink-quincenal-2026-11')) {
    // Markethink paga cada quincena (el 15 y el 30). Desde el 15-nov, medio tiempo: ~$600.000 por quincena ($1.200.000 al mes).
    // En noviembre faltaba el pago del 15; en diciembre se parte el esperado en sus dos fechas. Solo se toca lo que no editó.
    const fu = d.fuentesIngreso.find((x) => x.id === 'f-markethink');
    if (fu) fu.quincenal = true;
    const nov = d.planIngresos.find((r) => r.mes === '2026-11' && r.fuenteId === 'f-markethink');
    if (nov && nov.cobros && !nov.cobros.some((c) => c.fecha === '2026-11-15')) {
      nov.cobros.push({ fecha: '2026-11-15', monto: 600000 });
      nov.cobros.sort((a, b) => a.fecha.localeCompare(b.fecha));
      nov.esperado = sum(nov.cobros, (c) => c.monto);
    }
    const dic = d.planIngresos.find((r) => r.mes === '2026-12' && r.fuenteId === 'f-markethink');
    if (dic && !dic.cobros && dic.esperado > 0) {
      const mitad = Math.round(dic.esperado / 2);
      dic.cobros = [{ fecha: '2026-12-15', monto: mitad }, { fecha: '2026-12-30', monto: dic.esperado - mitad }];
      delete dic.fechaEsperada;
    }
    d.config.migraciones.push('markethink-quincenal-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('mercado-oct-2026')) {
    if (!d.mercadoHistorial.some((x) => x.mes === '2026-10')) d.mercadoHistorial.push({ id: 'mh-2026-10', mes: '2026-10', compras: [...MERCADO_OCT_2026] });
    d.config.migraciones.push('mercado-oct-2026');
    cambio = true;
  }
  if (!d.config.migraciones.includes('creditos-2026-11')) {
    if (!d.centros.some((c) => c.id === 'creditos')) d.centros.push({ id: 'creditos', nombre: 'Créditos' });
    const br = d.centros.find((c) => c.id === 'brisas');
    if (br && br.nombre === 'Brisas (mamá)') br.nombre = 'Mamá (Brisas)';
    const esCredito = (cat) => cat === 'deudas' || cat === 'carro';
    for (const p of d.plantillas) {
      if (esCredito(p.categoria)) p.centro = 'creditos';
      if (p.categoria === 'deudas' && /rappi/i.test(p.concepto)) p.tarjeta = TARJETA_RAPPI.id;
    }
    for (const m of d.movimientos) if (esCredito(m.categoria)) m.centro = 'creditos';
    if (!d.tarjetas.some((x) => x.id === TARJETA_RAPPI.id)) d.tarjetas.push(JSON.parse(JSON.stringify(TARJETA_RAPPI)));
    if (!d.creditos.some((x) => x.id === CREDITO_CARRO.id)) d.creditos.push({ ...CREDITO_CARRO });
    d.config.migraciones.push('creditos-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('auto-ingresos-2026-11')) {
    // Los créditos se incluyen solos cada mes (carro: día 2; tarjeta: el día de pago del extracto).
    for (const p of d.plantillas) {
      if (p.categoria === 'carro') { p.auto = true; p.dia = d.creditos.find((c) => c.id === 'carro')?.diaPago || 2; }
      if (p.tarjeta) { p.auto = true; const tj = d.tarjetas.find((x) => x.id === p.tarjeta); if (tj) p.dia = tj.diaPago; }
    }
    // Fuentes de ingreso: recurrentes (VEC, TAP, Mamá) o variables (el resto); se puede cambiar en Ingresos.
    for (const fu of d.fuentesIngreso) if (!fu.tipo) fu.tipo = /vec|tap|mam[aá]/i.test(fu.nombre) ? 'recurrente' : 'variable';
    d.config.migraciones.push('auto-ingresos-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('cuota-manejo-bancolombia-2026-11')) {
    // La cuota de manejo de Bancolombia ($15.900) se cobra sola el 12 de cada mes: queda como pago recurrente con pago automático desde esa cuenta.
    const cuenta = d.cuentasDinero.find((c) => /bancolombia/i.test(c.nombre));
    if (cuenta && !d.plantillas.some((p) => p.id === 'p-cuota-manejo-bancolombia')) {
      if (!d.categorias.some((c) => c.id === 'bancario')) d.categorias.push({ id: 'bancario', nombre: 'Comisiones bancarias', tipo: 'recurrente' });
      d.plantillas.push({ id: 'p-cuota-manejo-bancolombia', concepto: 'Cuota de manejo Bancolombia', monto: 15900, dia: 12, categoria: 'bancario', centro: 'hogar', cuenta: '', auto: true, autoPago: cuenta.id });
    }
    d.config.migraciones.push('cuota-manejo-bancolombia-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('gmf-bancolombia-2026-11')) {
    // Bancolombia cobra el 4x1000: desde ahora los pagos NUEVOS que salen de ella se descuentan con ese cobro (lo anterior no cambia).
    for (const c of d.cuentasDinero) if (/bancolombia/i.test(c.nombre) && c.gmf == null) c.gmf = true;
    d.config.migraciones.push('gmf-bancolombia-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('cuentas-reparar-2026-11')) {
    // La primera versión marcaba como "sin cuenta a propósito" lo que se guardaba sin elegir cuenta (incluso al solo editar un gasto
    // viejo). Esa marca se quita: esos pagos vuelven a avisarse hasta que se les elija la cuenta de la que salieron.
    for (const m of d.movimientos) delete m.sinCuenta;
    d.config.migraciones.push('cuentas-reparar-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('cuentas-hora-2026-11')) {
    // Desde el 6-nov los pagos llevan la hora y los que se pagaron sin elegir cuenta se avisan para descontarlos de la cuenta real.
    // Lo anterior ya estaba dentro de los saldos que Diego puso el 3-nov, así que no se toca.
    d.config.conciliarDesde ||= '2026-11-06';
    d.config.migraciones.push('cuentas-hora-2026-11');
    cambio = true;
  }
  if (!d.config.migraciones.includes('pagos-recurrentes-2026-11')) {
    // Cada recurrente guarda su lista de pagos { dia, monto, con }. El pago automático pasa a ser un interruptor y la cuenta, la de cada pago.
    for (const p of d.plantillas) {
      if (p.dias || typeof p.autoPago === 'string') {
        p.pagos = pagosDe(p).map((x) => ({ ...x }));
        if (typeof p.autoPago === 'string') { for (const x of p.pagos) if (!x.con) x.con = p.autoPago; p.autoPago = true; }
        delete p.dias;
      }
    }
    d.config.migraciones.push('pagos-recurrentes-2026-11');
    cambio = true;
  }
  return cambio;
}

let timer = null;
let saving = false;
let again = false;
let dirty = false;

export function save() {
  dirty = true;
  hooks.saveStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(flush, 350);
}

export async function flush() {
  clearTimeout(timer);
  if (!dirty) return;
  if (saving) { again = true; return; }
  saving = true;
  dirty = false; // si algo cambia mientras se guarda, save() lo vuelve a marcar
  try {
    const r = await fetch('api/data', {
      method: 'PUT',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(state.data),
    });
    if (r.status === 401) { dirty = true; hooks.saveStatus('sesion'); return; } // la sesión venció: se avisa y no se pierde nada de memoria
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!dirty) hooks.saveStatus('ok');
  } catch (e) {
    dirty = true;
    hooks.saveStatus('error');
  } finally {
    saving = false;
    if (again) { again = false; flush(); }
  }
}

// Al cerrar la pestaña solo se guarda si quedaron cambios sin enviar.
window.addEventListener('beforeunload', () => {
  if (dirty) {
    fetch('api/data', {
      method: 'PUT',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(state.data),
      keepalive: true,
    });
  }
});

// ---------- Periodo ----------
export function curPeriod() {
  // Recurrentes siempre se trabaja por mes.
  return state.tab === 'recurrentes' || state.tab === 'ingresos' ? { mode: 'mes', anchor: state.period.anchor } : state.period;
}

export function rangeOf(p) {
  if (p.mode === 'mes') return { from: monthStart(p.anchor), to: monthEnd(p.anchor) };
  const from = weekStart(p.anchor);
  return { from, to: addDays(from, 6) };
}

export function shiftOf(p, dir) {
  if (p.mode === 'mes') return { mode: 'mes', anchor: addMonths(p.anchor, dir) };
  return { mode: 'semana', anchor: addDays(p.anchor, 7 * dir) };
}

export const curRange = () => rangeOf(curPeriod());
export const prevRange = () => rangeOf(shiftOf(curPeriod(), -1));
export const curMes = () => curPeriod().anchor.slice(0, 7);

export function shiftPeriod(dir) {
  // En Recurrentes se avanza por mes pero se conserva el modo elegido por el usuario.
  state.period = { mode: state.period.mode, anchor: shiftOf(curPeriod(), dir).anchor };
}

// ---------- Consultas ----------
export const sum = (arr, f = (x) => x.monto) => arr.reduce((a, x) => a + (f(x) || 0), 0);
export const categoria = (id) => state.data.categorias.find((c) => c.id === id);
export const centroNombre = (id) => state.data.centros.find((c) => c.id === id)?.nombre || id;
export const cuentaById = (id) => state.data.cuentas.find((c) => c.id === id);

const centroOk = (c) => state.centro === 'todos' || c === state.centro;
const carroOk = (m) => state.data.config.incluirCuotaCarro || m.categoria !== 'carro';

export function visibleMovs(range) {
  return state.data.movimientos.filter((m) => m.fecha >= range.from && m.fecha <= range.to && centroOk(m.centro) && carroOk(m));
}
export function visibleIngresos(range) {
  return state.data.ingresos.filter((i) => i.fecha >= range.from && i.fecha <= range.to && centroOk(i.centro));
}

export function byTipo(movs) {
  const out = { recurrente: 0, variable: 0, hormiga: 0 };
  for (const m of movs) out[m.tipo] = (out[m.tipo] || 0) + m.monto;
  return out;
}

// ---------- Ingreso mínimo: lo que hay que cubrir sí o sí (recurrentes + mercado) ----------
const mesDe = (m) => m.mes || m.fecha.slice(0, 7);

// Una compra puede traer cosas de un compromiso (un parche, un regalo…): esa parte se "atribuye" al compromiso. NO vuelve a descontar de
// ninguna cuenta (la compra ya salió completa); solo cambia a qué se le cuenta: sube lo gastado del compromiso y baja lo del mercado.
export const atribuido = (m) => sum(m.atribuciones || [], (a) => a.monto);
export const netoCompra = (m) => m.monto - atribuido(m);

// Mercado de un mes: lo registrado en Gastos o, si no hay, el historial dictado por Diego.
export function mercadoMes(ym, ignorarCentro = false) {
  const D = state.data;
  const reg = D.movimientos.filter((x) => x.categoria === 'mercado' && x.fecha.slice(0, 7) === ym && (ignorarCentro || centroOk(x.centro)));
  if (reg.length) return { total: sum(reg, netoCompra), n: reg.length, origen: 'registrado' };
  if (ignorarCentro || state.centro !== 'brisas') {
    const h = D.mercadoHistorial.find((x) => x.mes === ym);
    if (h && h.compras.length) return { total: sum(h.compras, (c) => c), n: h.compras.length, origen: 'historial' };
  }
  return { total: 0, n: 0, origen: null };
}

export function mercadoLista() {
  const D = state.data;
  const meses = new Set(D.mercadoHistorial.map((x) => x.mes));
  for (const x of D.movimientos) if (x.categoria === 'mercado') meses.add(x.fecha.slice(0, 7));
  return [...meses].sort().reverse().map((ym) => ({ mes: ym, ...mercadoMes(ym, true) })).filter((x) => x.total > 0);
}

export function saveMercadoMes(ym, compras) {
  const list = state.data.mercadoHistorial;
  const i = list.findIndex((x) => x.mes === ym);
  if (i >= 0) list[i].compras = compras; else list.push({ id: 'mh-' + ym, mes: ym, compras });
  save();
}
export function delMercadoMes(ym) {
  state.data.mercadoHistorial = state.data.mercadoHistorial.filter((x) => x.mes !== ym);
  save();
}

export function ingresoMinimo(mes) {
  const D = state.data;
  const plantillaDe = (m) => (m.plantillaId ? D.plantillas.find((p) => p.id === m.plantillaId) : null);
  const tarjetaDe = (p) => (p && p.tarjeta ? D.tarjetas.find((x) => x.id === p.tarjeta) : null);
  const recDe = (ym) => D.movimientos.filter((x) => x.tipo === 'recurrente' && mesDe(x) === ym && centroOk(x.centro));
  const prevYm = addMonths(mes + '-01', -1).slice(0, 7);

  // Si todavía no eliges los recurrentes del mes, se estima con los del mes anterior
  // (y el pago de la tarjeta con lo que dice su propio extracto).
  const esAuto = (m) => { const p = plantillaDe(m); return !!(p && p.auto) || !!m.addiId; };
  let rec = recDe(mes);
  let origenRec = 'mes';
  if (!rec.some((m) => !esAuto(m))) {
    // Aún no eliges los recurrentes del mes (solo están los automáticos): se completan con los del último mes donde sí los elegiste.
    for (let i = 1; i <= 6; i++) {
      const p = recDe(addMonths(mes + '-01', -i).slice(0, 7)).filter((m) => !esAuto(m));
      if (p.length) { rec = [...rec, ...p]; origenRec = 'anterior'; break; }
    }
  }
  const items = rec.map((m) => {
    const tj = tarjetaDe(plantillaDe(m));
    return { concepto: m.concepto, monto: m.monto, categoria: m.categoria, centro: m.centro, tarjeta: tj || null, estado: m.estado };
  });
  // Meses lejanos aún sin instancias: los automáticos (carro fijo, tarjeta según sus cuotas) se proyectan desde el catálogo.
  if (mes > todayISO().slice(0, 7)) {
    const excl = new Set(D.config.autoExcluidos);
    for (const p of D.plantillas) {
      if (!p.auto || !centroOk(p.centro) || excl.has(`p:${p.id}|${mes}`) || rec.some((m) => m.plantillaId === p.id)) continue;
      const tj = tarjetaDe(p);
      const est = tj ? extractoPagadoEn(tj, mes).total : 0;
      for (let k = 0; k < nPagosDe(p); k++) items.push({ concepto: nombrePago(p, k), monto: est > 0 ? est : (tj ? 0 : montoPago(p, k)), categoria: p.categoria, centro: p.centro, tarjeta: tj || null, estado: 'pendiente', proyectado: true });
    }
    // Cuotas de ADDI de ese mes que todavía no tienen su pago creado.
    for (const a of D.addi || []) {
      for (const c of cuotasAddi(a)) {
        if (c.fecha.slice(0, 7) !== mes || rec.some((m) => m.addiId === a.id && m.addiN === c.n) || !centroOk('creditos')) continue;
        items.push({ concepto: `ADDI · ${a.concepto} (cuota ${c.n} de ${a.cuotas})`, monto: a.cuota, categoria: 'deudas', centro: 'creditos', tarjeta: null, estado: 'pendiente', proyectado: true });
      }
    }
  }

  const incluyeCarro = D.config.incluirCuotaCarro;
  const cuenta = (it) => incluyeCarro || it.categoria !== 'carro';
  const grupos = D.centros.filter((c) => centroOk(c.id))
    .map((c) => {
      const its = items.filter((i) => i.centro === c.id);
      return { id: c.id, nombre: c.nombre, items: its, total: sum(its.filter(cuenta), (i) => i.monto) };
    })
    .filter((g) => g.items.length);
  const recTotal = sum(grupos, (g) => g.total);
  const carro = sum(items.filter((i) => i.categoria === 'carro'), (i) => i.monto);

  // Mercado: presupuesto = estimado manual o promedio de los últimos 3 meses con datos; si se gasta más, cuenta lo gastado.
  const real = mercadoMes(mes).total;
  // Solo cuentan meses completos (antes del mes en curso): uno a medias bajaría el promedio.
  const mesHoy = todayISO().slice(0, 7);
  const hist = [1, 2, 3].map((i) => addMonths(mes + '-01', -i).slice(0, 7)).filter((ym) => ym < mesHoy).map((ym) => mercadoMes(ym).total).filter((v) => v > 0);
  const promedio = hist.length ? sum(hist, (x) => x) / hist.length : 0;
  const estimado = D.config.mercadoEstimado || 0;
  const base = estimado > 0 ? estimado : promedio;
  const mercadoBruto = Math.max(base, real);
  // Lo que del mercado ya viaja dentro del pago de la tarjeta de este mes no se cuenta dos veces.
  const tarjetasEnMin = [...new Set(items.filter((i) => i.tarjeta && cuenta(i)).map((i) => i.tarjeta))];
  const mercadoTarjeta = Math.min(mercadoBruto, sum(tarjetasEnMin, (tj) => extractoPagadoEn(tj, mes).comprasMercado));
  const mercado = mercadoBruto - mercadoTarjeta;
  let origenMercado = estimado > 0 ? 'tu estimado' : promedio > 0 ? `promedio de ${hist.length} ${hist.length === 1 ? 'mes' : 'meses'}` : 'lo gastado este mes';
  if (real > base && base > 0) origenMercado = 'lo gastado (superó el presupuesto)';
  const origenBase = estimado > 0 ? 'tu estimado' : promedio > 0 ? `promedio de ${hist.length} ${hist.length === 1 ? 'mes' : 'meses'}` : '';

  const total = recTotal + mercado;
  return {
    items, grupos, nRec: items.length, origenRec, carro, incluyeCarro, recTotal,
    mercado, mercadoBruto, mercadoTarjeta, mercadoBase: base, mercadoReal: real, origenMercado, origenBase,
    total, totalSinCarro: total - (incluyeCarro ? carro : 0),
  };
}

// ---------- Ingresos: esperado vs recibido por fuente ----------
const llave = (s) => String(s || '').trim().toLowerCase();

// Cobros esperados (con fecha) que todavía no cubre lo recibido: el dinero recibido se aplica a los cobros más antiguos.
function cobrosPendientes(r, finMes) {
  let cobros = (r.cobros || []).map((c) => ({ ...c })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!cobros.length && r.esperado > 0) cobros = [{ fecha: r.fechaEsperada || finMes, monto: r.esperado, aprox: !r.fechaEsperada }];
  let resto = r.recibido || sum(r.pagos || []);
  const pend = [];
  for (const c of cobros) {
    if (resto >= c.monto) { resto -= c.monto; continue; }
    pend.push({ fecha: c.fecha, monto: c.monto - resto, aprox: c.aprox });
    resto = 0;
  }
  return pend;
}

export function ingresosDelMes(mes) {
  const D = state.data;
  const tipoDe = (nombre) => D.fuentesIngreso.find((x) => llave(x.nombre) === llave(nombre))?.tipo || 'variable';
  const recibidos = D.ingresos.filter((i) => (i.mesPlan || i.fecha.slice(0, 7)) === mes && centroOk(i.centro));
  const rows = D.planIngresos.filter((r) => r.mes === mes && centroOk(r.centro))
    .map((r) => ({ ...r, plan: true, pagos: recibidos.filter((i) => llave(i.fuente) === llave(r.nombre)) }));
  const usados = new Set(rows.flatMap((r) => r.pagos.map((p) => p.id)));
  const sueltos = new Map();
  for (const i of recibidos.filter((x) => !usados.has(x.id))) {
    const k = llave(i.fuente);
    if (!sueltos.has(k)) {
      const fu = D.fuentesIngreso.find((x) => llave(x.nombre) === k);
      sueltos.set(k, { id: 'x:' + k, mes, nombre: i.fuente, centro: i.centro, tipo: tipoDe(i.fuente), fuenteId: fu?.id, esperado: 0, plan: false, pagos: [] });
    }
    sueltos.get(k).pagos.push(i);
  }
  rows.push(...sueltos.values());
  const finMes = monthEnd(mes + '-01');
  for (const r of rows) {
    r.recibido = sum(r.pagos);
    r.falta = Math.max(0, r.esperado - r.recibido);
    r.cobrosPend = cobrosPendientes(r, finMes);
    r.estado = r.recibido <= 0 ? 'pendiente' : r.recibido >= r.esperado ? 'recibido' : 'parcial';
  }
  return rows.sort((a, b) => (b.esperado || b.recibido) - (a.esperado || a.recibido));
}

export function setCobros(mes, row, cobros) {
  const D = state.data;
  const limpios = cobros.filter((c) => c.fecha && c.monto > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const esperado = sum(limpios, (c) => c.monto);
  if (row.plan) {
    const r = D.planIngresos.find((x) => x.id === row.id);
    if (r) { r.cobros = limpios; r.esperado = esperado; }
  } else {
    D.planIngresos.push({ id: uid(), mes, fuenteId: row.fuenteId, nombre: row.nombre, tipo: row.tipo, centro: row.centro, esperado, cobros: limpios });
  }
  save();
}

export function setEsperado(mes, row, valor) {
  const D = state.data;
  if (row.plan) {
    const r = D.planIngresos.find((x) => x.id === row.id);
    if (r) { r.esperado = valor; delete r.cobros; }
  } else {
    D.planIngresos.push({ id: uid(), mes, fuenteId: row.fuenteId, nombre: row.nombre, tipo: row.tipo, centro: row.centro, esperado: valor });
  }
  save();
}
export function addEsperado(mes, { nombre, tipo, centro, esperado, fuenteId }) {
  const D = state.data;
  const ya = D.planIngresos.find((r) => r.mes === mes && llave(r.nombre) === llave(nombre));
  if (ya) ya.esperado = esperado;
  else D.planIngresos.push({ id: uid(), mes, fuenteId, nombre, tipo, centro, esperado });
  if (fuenteId) D.config.autoExcluidos = D.config.autoExcluidos.filter((k) => k !== `f:${fuenteId}|${mes}`);
  save();
}
export function delEsperado(mes, row) {
  const D = state.data;
  D.planIngresos = D.planIngresos.filter((r) => r.id !== row.id);
  if (row.fuenteId && row.tipo === 'recurrente') D.config.autoExcluidos.push(`f:${row.fuenteId}|${mes}`);
  save();
}

// Cuánto hay para gastar sin tocar los fijos: ingresos del mes − fijos (recurrentes, créditos y mercado) − lo reservado para compromisos.
// Lo que ya gastaste en hormiga y variables NO se resta (sale de esta misma bolsa): se devuelve aparte en `otros` solo para mostrarlo.
export function planGasto(mes) {
  const mn = ingresoMinimo(mes);
  const rows = ingresosDelMes(mes);
  const esperado = sum(rows, (r) => r.esperado);
  const recibido = sum(rows, (r) => r.recibido);
  const range = { from: mes + '-01', to: monthEnd(mes + '-01') };
  const otros = sum(visibleMovs(range).filter((m) => m.tipo !== 'recurrente' && m.categoria !== 'mercado' && !m.compromisoId));
  const reservado = reservadoMes(mes);
  const base = sum(rows, (r) => Math.max(r.esperado, r.recibido)); // por fuente: si entró más de lo esperado, manda lo recibido
  return {
    mn, rows, esperado, recibido, base, falta: Math.max(0, esperado - recibido), fijos: mn.total, otros, reservado,
    dispEsperado: base - mn.total - reservado, dispRecibido: recibido - mn.total - reservado,
  };
}

export const hayDatos = () => state.data.movimientos.length > 0 || state.data.ingresos.length > 0;
export const hayDemo = () => state.data.movimientos.some((m) => m.demo) || state.data.ingresos.some((i) => i.demo);

// ---------- Movimientos e ingresos ----------
// Conexión con "Tengo hoy" (Plan del mes): un ingreso con cuenta SUMA a esa cuenta y un pago hecho con cuenta RESTA.
// Se deshace solo al editar, borrar o volver un pago a pendiente. Lo que no tiene cuenta no mueve ningún saldo.
const redondear = (n) => Math.round(n * 100) / 100;
const efectoIngreso = (i) => (i && i.cuentaId ? { id: i.cuentaId, d: Number(i.monto) || 0 } : null);
// 4x1000 (GMF): algunas cuentas cobran 0,4 % de lo que sale. Los pagos NUEVOS que salen de una cuenta que lo cobra llevan la marca `gmf` y se descuentan
// con ese cobro (monto + 4x1000); lo que ya estaba pagado antes no cambia. El monto del gasto sigue siendo el valor de la compra.
export const GMF = 0.004;
export const gmfDe = (m) => (m && m.gmf ? Math.round((Number(m.monto) || 0) * GMF) : 0);
const efectoMov = (m) => (m && m.cuentaId && m.estado === 'pagado' ? { id: m.cuentaId, d: -((Number(m.monto) || 0) + gmfDe(m)) } : null);
// Se llama cuando un pago empieza a salir de una cuenta: lo marca si esa cuenta cobra el 4x1000.
function marcarGmf(m) {
  const c = m.cuentaId && m.estado === 'pagado' ? state.data.cuentasDinero.find((x) => x.id === m.cuentaId) : null;
  if (c && c.gmf) m.gmf = true; else delete m.gmf;
}
function moverSaldo(e, signo) {
  if (!e) return;
  const c = state.data.cuentasDinero.find((x) => x.id === e.id);
  if (!c) return;
  c.saldo = redondear((Number(c.saldo) || 0) + signo * e.d);
  c.fecha = todayISO();
}
export const cuentaDinero = (id) => state.data.cuentasDinero.find((c) => c.id === id);
// Efectivo y tarjeta de crédito no salen de una cuenta del banco en el momento de comprar.
export const esMedioSinCuenta = (medio) => /efectivo|tarjeta de cr|cr[eé]dito|\btc\b|rappi card/i.test(medio || '');

// Orden de pago: lo más reciente primero, con la hora para desempatar los pagos del mismo día (sin hora = al comienzo del día;
// si tampoco la hora sirve, manda el orden en que se registraron).
export const marcaPago = (x) => `${x.fecha || ''} ${x.hora || '00:00'}`;
export function ordenPago(a, b) {
  const lista = state.data.movimientos;
  return marcaPago(b).localeCompare(marcaPago(a)) || lista.indexOf(b) - lista.indexOf(a);
}

// Pagos hechos (desde `conciliarDesde`) que no salieron de ninguna cuenta: el plan no los descontó. No cuentan efectivo ni tarjeta de
// crédito, ni lo que ya se dijo que "ya estaba en mi saldo" (`yaEnSaldo`).
export function pagosSinCuenta() {
  const D = state.data;
  if (!D.cuentasDinero.length) return [];
  const desde = D.config.conciliarDesde || '';
  const hoy = todayISO();
  return D.movimientos.filter((m) => m.estado === 'pagado' && !m.cuentaId && !m.yaEnSaldo && m.fecha >= desde && m.fecha <= hoy && !esMedioSinCuenta(m.medio) && !m.demo)
    .sort(ordenPago);
}
// `asignaciones`: [{ id, cuentaId }]. Con cuenta, el pago se descuenta de ella; sin cuenta ('' ) queda marcado como "ya estaba en mi saldo".
export function asignarCuentas(asignaciones) {
  for (const a of asignaciones) {
    const m = state.data.movimientos.find((x) => x.id === a.id);
    if (!m) continue;
    if (a.cuentaId && cuentaDinero(a.cuentaId)) { const antes = efectoMov(m); m.cuentaId = a.cuentaId; delete m.yaEnSaldo; marcarGmf(m); moverSaldo(antes, -1); moverSaldo(efectoMov(m), +1); }
    else { moverSaldo(efectoMov(m), -1); delete m.cuentaId; delete m.gmf; m.yaEnSaldo = true; }
  }
  save();
}

// Cuenta que se propone al registrar algo: la última usada con esa fuente o concepto, o la última del tipo, o la primera.
export function cuentaSugerida(tipo, clave) {
  const cfg = state.data.config.cuentaPorDefecto || {};
  const ids = state.data.cuentasDinero.map((c) => c.id);
  const buscada = [clave ? cfg[`${tipo}:${String(clave).trim().toLowerCase()}`] : null, cfg[tipo]].find((x) => x && ids.includes(x));
  return buscada || ids[0] || '';
}
export function recordarCuenta(tipo, clave, id) {
  if (!id) return;
  const cfg = (state.data.config.cuentaPorDefecto ||= {});
  cfg[tipo] = id;
  if (clave) cfg[`${tipo}:${String(clave).trim().toLowerCase()}`] = id;
}

export function addMov(m) {
  const mov = { id: uid(), estado: 'pagado', medio: '', nota: '', ...m };
  // Un pago hecho hoy lleva la hora en que se registró (si no se indicó otra); uno de otro día queda sin hora.
  if (mov.estado === 'pagado' && mov.hora == null) mov.hora = mov.fecha === todayISO() ? nowHHMM() : '';
  // Un gasto pagado SIEMPRE se descuenta de una cuenta (salvo efectivo o tarjeta de crédito): si no se eligió, la sugerida.
  if (mov.estado === 'pagado' && !mov.cuentaId && !mov.yaEnSaldo && state.data.cuentasDinero.length && !esMedioSinCuenta(mov.medio)) mov.cuentaId = cuentaSugerida('gasto', mov.concepto) || undefined;
  marcarGmf(mov);
  state.data.movimientos.push(mov);
  moverSaldo(efectoMov(mov), +1);
  save();
  return mov;
}
export function updateMov(id, patch) {
  const m = state.data.movimientos.find((x) => x.id === id);
  if (m) {
    const antes = efectoMov(m);
    const cuentaAntes = m.cuentaId;
    Object.assign(m, patch);
    if (m.estado !== 'pagado') quitarCompraTarjetaDe(m);
    if (m.estado === 'pagado' && m.cuentaId) { if (!antes || m.cuentaId !== cuentaAntes) marcarGmf(m); } else delete m.gmf;
    moverSaldo(antes, -1); // se deshace lo anterior…
    moverSaldo(efectoMov(m), +1); // …y se aplica lo nuevo
  }
  save();
}
// Al pagar, la fecha pasa a ser la real (hoy) si el pago corresponde al mes en curso. `cuentaId` = de qué cuenta salió ('' = de ninguna).
export function marcarPagado(id, pagado, cuentaId) {
  const m = state.data.movimientos.find((x) => x.id === id);
  if (!m) return;
  if (pagado) {
    const hoy = todayISO();
    const mismoMes = hoy.slice(0, 7) === (m.mes || m.fecha.slice(0, 7));
    const fecha = mismoMes ? hoy : m.fecha;
    updateMov(id, {
      estado: 'pagado', fecha, hora: fecha === hoy ? nowHHMM() : '',
      ...(cuentaId !== undefined ? { cuentaId: cuentaId || undefined, yaEnSaldo: cuentaId ? undefined : true } : {}),
    });
  } else {
    updateMov(id, { estado: 'pendiente', hora: '' });
  }
}
// Una compra de la tarjeta de crédito que nació de pagar este gasto con ella: se quita si el pago se deshace o se borra.
function quitarCompraTarjetaDe(m) {
  if (!m.tarjetaCompra) return;
  const t = state.data.tarjetas.find((x) => x.id === m.tarjetaCompra.tid);
  if (t) t.compras = t.compras.filter((c) => c.id !== m.tarjetaCompra.id);
  delete m.tarjetaCompra;
}
export function delMov(id) {
  const m = state.data.movimientos.find((x) => x.id === id);
  if (m) quitarCompraTarjetaDe(m);
  if (m) moverSaldo(efectoMov(m), -1);
  state.data.movimientos = state.data.movimientos.filter((x) => x.id !== id);
  save();
}
export function addIngreso(i) {
  const ing = { id: uid(), nota: '', ...i };
  if (ing.hora == null) ing.hora = ing.fecha === todayISO() ? nowHHMM() : '';
  state.data.ingresos.push(ing);
  moverSaldo(efectoIngreso(ing), +1);
  save();
  return ing;
}
export function updateIngreso(id, patch) {
  const i = state.data.ingresos.find((x) => x.id === id);
  if (i) {
    const antes = efectoIngreso(i);
    Object.assign(i, patch);
    moverSaldo(antes, -1);
    moverSaldo(efectoIngreso(i), +1);
  }
  save();
}
export function delIngreso(id) {
  const i = state.data.ingresos.find((x) => x.id === id);
  if (i) moverSaldo(efectoIngreso(i), -1);
  state.data.ingresos = state.data.ingresos.filter((x) => x.id !== id);
  save();
}

// ---------- Recurrentes por mes ----------
// Un recurrente se puede pagar VARIAS veces al mes (por ejemplo cada 15 días: días 1 y 16): `dias` = [1, 16]. Cada pago es un movimiento propio con su
// `nPago` (0, 1…) y su monto; `dia` guarda el primero. Los pagos de tarjeta tienen un solo día.
// `pagos` = [{ dia, monto, con }]: cada pago del mes con su día, su valor y la cuenta (id) o tarjeta ("@tc:<id>") con que se paga ('' = la elijo al pagar).
export const pagosDe = (p) => {
  if (Array.isArray(p.pagos) && p.pagos.length) return p.pagos;
  if (Array.isArray(p.dias) && p.dias.length) return p.dias.map((dia) => ({ dia, monto: p.monto })); // formato anterior
  return [{ dia: p.dia || 1, monto: p.monto }];
};
export const diasDe = (p) => pagosDe(p).map((x) => x.dia);
export const montoPago = (p, k) => { const l = pagosDe(p); return l[Math.min(k, l.length - 1)].monto || p.monto; };
export const conPago = (p, k) => { const l = pagosDe(p); return l[Math.min(k, l.length - 1)].con || ''; };
// Cuenta de la que sale solo un pago con pago automático (si la tiene).
export const cuentaAutoPago = (p, k) => {
  if (!p || !p.autoPago) return '';
  const con = conPago(p, k);
  const id = con && !con.startsWith('@') ? con : (typeof p.autoPago === 'string' ? p.autoPago : '');
  return state.data.cuentasDinero.some((c) => c.id === id) ? id : '';
};
export const nPagosDe = (p) => (p.tarjeta ? 1 : diasDe(p).length);
export const nombrePago = (p, k) => (diasDe(p).length > 1 ? `${p.concepto} (${k + 1} de ${diasDe(p).length})` : p.concepto);
export const instancias = (plantillaId, mes) => state.data.movimientos.filter((m) => m.plantillaId === plantillaId && m.mes === mes).sort((a, b) => (a.nPago || 0) - (b.nPago || 0));
export const instancia = (plantillaId, mes, k = 0) =>
  state.data.movimientos.find((m) => m.plantillaId === plantillaId && m.mes === mes && (m.nPago || 0) === k);

export function fechaPlantilla(p, mes, k = 0) {
  const dias = diasDe(p);
  const dim = daysInMonth(mes + '-01');
  return `${mes}-${pad(Math.min(Math.max(dias[Math.min(k, dias.length - 1)] || 1, 1), dim))}`;
}

function crearInstancia(p, mes, k = 0) {
  const tj = p.tarjeta && state.data.tarjetas.find((x) => x.id === p.tarjeta);
  const estimado = tj ? extractoPagadoEn(tj, mes).total : 0;
  const mov = {
    id: uid(), fecha: fechaPlantilla(p, mes, k), concepto: nombrePago(p, k), monto: estimado > 0 ? estimado : montoPago(p, k), tipo: 'recurrente',
    categoria: p.categoria, centro: p.centro, medio: '', nota: '', estado: 'pendiente', plantillaId: p.id, mes,
    ...(diasDe(p).length > 1 ? { nPago: k } : {}),
  };
  state.data.movimientos.push(mov);
  return mov;
}

export function incluirPlantilla(p, mes) {
  let creado = false;
  for (let k = 0; k < nPagosDe(p); k++) if (!instancia(p.id, mes, k)) { crearInstancia(p, mes, k); creado = true; }
  if (!creado) return;
  state.data.config.autoExcluidos = state.data.config.autoExcluidos.filter((k) => k !== `p:${p.id}|${mes}`);
  save();
}
// Quita solo los pagos pendientes del mes (los ya pagados se conservan).
export function quitarPendientes(p, mes) {
  state.data.movimientos = state.data.movimientos.filter((m) => !(m.plantillaId === p.id && m.mes === mes && m.estado === 'pendiente'));
  // En los automáticos se anota que ese mes se quitaron, para que no vuelvan a aparecer solos (los ya pagados se conservan).
  if (p.auto && !state.data.config.autoExcluidos.includes(`p:${p.id}|${mes}`)) state.data.config.autoExcluidos.push(`p:${p.id}|${mes}`);
  save();
}

export function quitarPlantilla(p, mes) {
  state.data.movimientos = state.data.movimientos.filter((m) => !(m.plantillaId === p.id && m.mes === mes));
  if (p.auto) state.data.config.autoExcluidos.push(`p:${p.id}|${mes}`);
  save();
}

// Lo que debe estar puesto solo, sin que tengas que hacerlo: créditos del mes (y del siguiente), ingresos recurrentes esperados
// y el pago de la tarjeta, que sigue a las compras mientras esté pendiente y no lo fijes a mano.
// Día en que llega el pago de una fuente recurrente; si se recibe por adelantado cae en el mes anterior.
function fechaCobro(fu, mes) {
  const ym = fu.adelanto ? addMonths(mes + '-01', -1).slice(0, 7) : mes;
  return `${ym}-${pad(Math.min(fu.dia, daysInMonth(ym + '-01')))}`;
}

export function sincronizarAutomaticos() {
  const D = state.data;
  let cambio = false;
  const hoy = todayISO();
  const excl = new Set(D.config.autoExcluidos);
  for (const mes of [hoy.slice(0, 7), addMonths(hoy, 1).slice(0, 7)]) {
    for (const p of D.plantillas) {
      if (!p.auto || excl.has(`p:${p.id}|${mes}`)) continue;
      for (let k = 0; k < nPagosDe(p); k++) {
        if (instancia(p.id, mes, k)) continue;
        crearInstancia(p, mes, k);
        cambio = true;
      }
    }
    for (const fu of D.fuentesIngreso) {
      if (fu.tipo !== 'recurrente' || (fu.hasta && mes > fu.hasta) || excl.has(`f:${fu.id}|${mes}`) || D.planIngresos.some((r) => r.mes === mes && r.fuenteId === fu.id)) continue;
      const fila = {
        id: uid(), mes, fuenteId: fu.id, nombre: fu.nombre, tipo: 'recurrente', centro: fu.centro, esperado: fu.monto,
        fechaEsperada: fu.dia ? fechaCobro(fu, mes) : undefined,
      };
      if (fu.quincenal) {
        // Pago en dos partes: el 15 y el día indicado (30 por defecto), la mitad cada vez.
        const mitad = Math.round(fu.monto / 2);
        fila.cobros = [{ fecha: `${mes}-15`, monto: mitad }, { fecha: `${mes}-${pad(Math.min(fu.dia || 30, daysInMonth(mes + '-01')))}`, monto: fu.monto - mitad }];
        delete fila.fechaEsperada;
      }
      D.planIngresos.push(fila);
      cambio = true;
    }
  }
  // Pagos recurrentes con pago automático (p. ej. cuotas de manejo): llegado el día, quedan pagados y salen de su cuenta. Una sola vez: si los
  // devuelves a pendiente, no se vuelven a pagar solos.
  const pagadosSolos = [];
  for (const m of D.movimientos) {
    if (m.estado !== 'pendiente' || !m.plantillaId || m.autoPagoHecho || m.fecha > hoy) continue;
    const p = D.plantillas.find((x) => x.id === m.plantillaId);
    const cuentaAuto = cuentaAutoPago(p, m.nPago || 0);
    if (!cuentaAuto) continue;
    updateMov(m.id, { estado: 'pagado', hora: '', cuentaId: cuentaAuto, yaEnSaldo: undefined, autoPagoHecho: true });
    pagadosSolos.push({ concepto: m.concepto, monto: m.monto, gmf: gmfDe(m), cuenta: cuentaDinero(cuentaAuto).nombre });
    cambio = true;
  }
  if (pagadosSolos.length) state.avisoPagoAuto = pagadosSolos;
  if (sincronizarGastosReales()) cambio = true;
  if (crearCuotasAddi()) cambio = true;
  // Pagos hechos (desde `conciliarDesde`) que quedaron sin cuenta: se descuentan solos de la cuenta sugerida. Nada que pulsar.
  const sinCuenta = pagosSinCuenta();
  if (sinCuenta.length) {
    const por = {};
    for (const m of sinCuenta) {
      m.cuentaId = cuentaSugerida('gasto', m.concepto);
      if (!m.cuentaId) continue;
      marcarGmf(m);
      moverSaldo(efectoMov(m), +1);
      por[m.cuentaId] = (por[m.cuentaId] || 0) + m.monto + gmfDe(m);
    }
    state.avisoAuto = { n: sinCuenta.length, por };
    cambio = true;
  }
  for (const m of D.movimientos) {
    if (!m.plantillaId || m.estado !== 'pendiente' || m.montoManual) continue;
    const p = D.plantillas.find((x) => x.id === m.plantillaId);
    const tj = p && p.tarjeta && D.tarjetas.find((x) => x.id === p.tarjeta);
    if (!tj) continue;
    const est = extractoPagadoEn(tj, m.mes).total;
    if (est > 0 && Math.round(est) !== Math.round(m.monto)) { m.monto = est; cambio = true; }
  }
  return cambio;
}

// ---------- Compromisos importantes (paseos, cumpleaños, grados…) ----------
// Una compra (un gasto ya pagado o una compra de la tarjeta de crédito) puede traer cosas de un compromiso: esa parte se "atribuye" al compromiso.
// NO vuelve a descontar de ninguna cuenta (la compra ya salió completa); solo cambia a qué se le cuenta. Cada compra se identifica con una
// referencia: "m:<id del gasto>" o "t:<id de la tarjeta>:<id de la compra>".
export function todasLasCompras() {
  const D = state.data;
  return [
    ...D.movimientos.map((obj) => ({ ref: 'm:' + obj.id, obj, tarjeta: null })),
    ...D.tarjetas.flatMap((t) => (t.compras || []).map((obj) => ({ ref: `t:${t.id}:${obj.id}`, obj, tarjeta: t }))),
  ];
}
export const buscarCompra = (ref) => todasLasCompras().find((x) => x.ref === ref) || null;

// Lo atribuido a un compromiso desde otras compras (gastos pagados o compras de la tarjeta).
export const atribuidoACompromiso = (id) => sum(todasLasCompras(), ({ obj }) => sum((obj.atribuciones || []).filter((a) => a.compromisoId === id), (a) => a.monto));
// Lo gastado de un compromiso. Si ya tiene su gasto real puesto, ESE es el gasto (atribuir algo a una compra NO lo cambia: solo dice que esa
// parte ya estaba pagada y no sale de una cuenta). Si no, es la suma de sus gastos y de lo atribuido.
export const compromisoGastado = (id) => {
  const c = state.data.compromisos.find((x) => x.id === id);
  if (c && c.gastoReal != null) return Math.max(Math.round(c.gastoReal), gastoPropio(id) + atribuidoACompromiso(id));
  return sum(todasLasCompras(), ({ ref, obj }) => (ref[0] === 'm' && obj.compromisoId === id ? obj.monto : sum((obj.atribuciones || []).filter((a) => a.compromisoId === id), (a) => a.monto)));
};
// Todo lo que se contó a un compromiso, con su compra de origen: [{ m, ref, tarjeta, monto, parcial }]
export function gastosDeCompromiso(id) {
  const out = [];
  for (const { ref, obj, tarjeta } of todasLasCompras()) {
    if (ref[0] === 'm' && obj.compromisoId === id) out.push({ m: obj, ref, tarjeta, monto: obj.monto, parcial: false });
    else for (const a of obj.atribuciones || []) if (a.compromisoId === id) out.push({ m: obj, ref, tarjeta, monto: a.monto, parcial: true });
  }
  return out.sort((a, b) => marcaPago(b.m).localeCompare(marcaPago(a.m)));
}
// Una vez puesto el gasto real, el compromiso aparta lo real (no el presupuesto); antes, el presupuesto o lo gastado si ya se pasó.
export const tieneGastoReal = (c) => c.gastoReal != null || !!c.cerrado;
export const reservadoDe = (c) => (tieneGastoReal(c) ? compromisoGastado(c.id) : Math.max(c.presupuesto, compromisoGastado(c.id)));
// Compromisos que ya pasaron y todavía no tienen su gasto real (los de los últimos 45 días).
export function compromisosPorAjustar() {
  const hoy = todayISO();
  const desde = addDays(hoy, -45);
  return state.data.compromisos.filter((c) => !tieneGastoReal(c) && !c.fechaAprox && (c.fechaFin || c.fecha) < hoy && c.fecha >= desde).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
// El gasto "de relleno" que crea "Gasto real" (o el que creó la primera versión, que terminaba en "(gasto real)"): al guardar de nuevo se
// reemplaza por el nuevo cálculo, devolviendo su plata a la cuenta de donde salió.
export const esAjusteReal = (m) => !!m.compromisoId && (m.ajuste || / \(gasto real\)$/.test(m.concepto));
export const ajustesDeCompromiso = (id) => state.data.movimientos.filter((m) => m.compromisoId === id && esAjusteReal(m));
// Lo registrado directamente al compromiso (con "+ Gasto"), sin el ajuste que se reemplaza.
export const gastoPropio = (id) => sum(state.data.movimientos.filter((m) => m.compromisoId === id && !esAjusteReal(m)));

// Con el gasto real puesto, el gasto de "relleno" (lo que ni está registrado ni atribuido) se mantiene en: real − gastos propios − atribuido. Así atribuir
// parte del gasto a una compra, desde donde sea, solo baja lo que se descuenta de la cuenta (devolviéndole esa plata) y el gasto real no cambia.
function sincronizarGastosReales() {
  let cambio = false;
  for (const c of state.data.compromisos) {
    if (c.gastoReal == null) continue;
    const [plug, ...sobran] = ajustesDeCompromiso(c.id);
    for (const x of sobran) { delMov(x.id); cambio = true; }
    const deseado = Math.max(0, Math.round(c.gastoReal - gastoPropio(c.id) - atribuidoACompromiso(c.id)));
    if (deseado === 0) {
      if (plug) { delMov(plug.id); cambio = true; }
    } else if (plug) {
      if (Math.round(plug.monto) !== deseado) { updateMov(plug.id, { monto: deseado }); cambio = true; }
    } else {
      const hoy = todayISO();
      addMov({
        fecha: (c.fechaFin || c.fecha) <= hoy ? (c.fechaFin || c.fecha) : hoy, hora: '', concepto: c.nombre + ' (gasto real)', monto: deseado, tipo: 'variable', categoria: 'otros-var',
        centro: 'hogar', medio: '', compromisoId: c.id, ajuste: true, yaEnSaldo: true, // si hace falta de nuevo, se registra SIN descontar de ninguna cuenta: tú eliges la cuenta en "Gasto real"
      });
      cambio = true;
    }
  }
  return cambio;
}

function quitarAtribuciones(compromisoId) {
  for (const { obj } of todasLasCompras()) {
    if (!obj.atribuciones) continue;
    obj.atribuciones = obj.atribuciones.filter((a) => a.compromisoId !== compromisoId);
    if (!obj.atribuciones.length) delete obj.atribuciones;
  }
}

// Gasto real de un compromiso, editable cuando quieras. `real` es el total; `partes` = [{ ref, monto }] lo que de ese total ya estaba pagado dentro
// de compras o de la tarjeta (se atribuye: NO se descuenta de ninguna cuenta). Lo que sobra (real − gastos propios − partes) sale de `cuentaId`
// (mueve su saldo) o, sin cuenta, se registra sin descontar. Lo anterior se reemplaza: ajuste viejo (con su plata devuelta) y atribuciones viejas.
export function guardarGastoReal(id, { real, partes = [], cuentaId = '', categoria = 'otros-var' }) {
  const c = state.data.compromisos.find((x) => x.id === id);
  if (!c) return null;
  for (const m of ajustesDeCompromiso(id)) delMov(m.id);
  quitarAtribuciones(id);
  const por = new Map();
  for (const p of partes) por.set(p.ref, (por.get(p.ref) || 0) + (Math.round(p.monto) || 0));
  let atribuidoTotal = 0;
  for (const [ref, monto] of por) {
    const compra = buscarCompra(ref);
    if (!compra) continue;
    const valor = Math.min(monto, Math.max(0, compra.obj.monto - atribuido(compra.obj)));
    if (valor <= 0) continue;
    compra.obj.atribuciones = [...(compra.obj.atribuciones || []), { compromisoId: id, monto: valor }];
    atribuidoTotal += valor;
  }
  const resto = Math.round(real - gastoPropio(id) - atribuidoTotal);
  let mov = null;
  if (resto > 0) {
    const hoy = todayISO();
    mov = addMov({
      fecha: (c.fechaFin || c.fecha) <= hoy ? (c.fechaFin || c.fecha) : hoy, hora: '', concepto: c.nombre + ' (gasto real)', monto: resto, tipo: 'variable', categoria,
      centro: 'hogar', medio: '', compromisoId: id, ajuste: true, cuentaId: cuentaId || undefined, yaEnSaldo: cuentaId ? undefined : true,
    });
  }
  c.gastoReal = Math.round(real);
  delete c.cerrado;
  save();
  return { mov, resto, atribuido: atribuidoTotal };
}
export function saveCompromiso(c) {
  const list = state.data.compromisos;
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  save();
}
export function delCompromiso(id) {
  state.data.compromisos = state.data.compromisos.filter((c) => c.id !== id);
  for (const m of state.data.movimientos) if (m.compromisoId === id) delete m.compromisoId;
  quitarAtribuciones(id);
  save();
}
// Lo que se aparta en el mes del evento: el presupuesto, o lo gastado si ya se pasó.
export function reservadoMes(mes) {
  if (!centroOk('hogar')) return 0;
  return sum(state.data.compromisos.filter((c) => c.fecha.slice(0, 7) === mes), reservadoDe);
}

// Margen de un mes (real o proyectado) para saber si caben los compromisos: ingresos − fijos (recurrentes, créditos y mercado).
// La hormiga y los variables no se restan: salen de lo que queda libre.
export function margenMes(mes) {
  const D = state.data;
  const mn = ingresoMinimo(mes);
  const filas = ingresosDelMes(mes);
  const hayPlan = D.planIngresos.some((r) => r.mes === mes && centroOk(r.centro));
  const esperado = hayPlan ? sum(filas, (r) => r.esperado) : sum(D.fuentesIngreso.filter((f) => f.tipo === 'recurrente' && !(f.hasta && mes > f.hasta) && centroOk(f.centro)), (f) => f.monto);
  const recibido = sum(filas, (r) => r.recibido);
  const base = hayPlan ? sum(filas, (r) => Math.max(r.esperado, r.recibido)) : Math.max(esperado, recibido);
  const reservado = reservadoMes(mes);
  const libre = base - mn.total;
  return { mes, esperado, recibido, base, fijos: mn.total, reservado, libre, queda: libre - reservado };
}

// ---------- Rutinas de gasto (hormiga y otras que se repiten cada semana) ----------
export function saveRutina(r) {
  const list = state.data.rutinas;
  const i = list.findIndex((x) => x.id === r.id);
  if (i >= 0) list[i] = r; else list.push(r);
  save();
}
export function delRutina(id) {
  state.data.rutinas = state.data.rutinas.filter((r) => r.id !== id);
  save();
}
export function setPlanMaximo(valor) {
  state.data.config.planMaximo = !!valor;
  save();
}

// ---------- Cuentas de dinero (saldos) ----------
export function saveCuentaDinero(c) {
  const list = state.data.cuentasDinero;
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  save();
}
export function delCuentaDinero(id) {
  state.data.cuentasDinero = state.data.cuentasDinero.filter((c) => c.id !== id);
  save();
}
export function setPlanConfig(patch) {
  const cfg = state.data.config;
  if ('colchonPct' in patch) cfg.colchonPct = patch.colchonPct;
  if ('diaCorte' in patch) cfg.diaCorte = patch.diaCorte;
  save();
}

// Plan de caja del mes en curso: saldo de hoy + lo que falta por recibir ANTES del día de corte (el 30) − lo que falta por pagar
// antes de ese día (pagos recurrentes y mercado) = lo que puedes gastar. Lo que entra desde el día de corte ya es del mes siguiente. De ahí salen la hormiga y las rutinas (domicilios,
// parqueadero…), los compromisos (cada uno con el presupuesto que tú le pongas) y tus gustos: la hormiga NO es un pago obligatorio.
export function planCaja() {
  const previo = state.centro;
  state.centro = 'todos'; // el plan de caja siempre mira todo el dinero, sin filtrar por centro
  try { return planCajaInterno(); } finally { state.centro = previo; }
}

function planCajaInterno() {
  const D = state.data;
  const hoy = todayISO();
  // El dinero que entra desde el día de corte (por defecto el 30) ya es del mes siguiente: el plan de un mes solo cuenta lo que
  // entra y se paga antes de ese día. Si hoy ya es el día de corte, el plan pasa al mes siguiente.
  const diaCorte = D.config.diaCorte || 30;
  const corteDe = (ym) => `${ym}-${pad(Math.min(diaCorte, daysInMonth(ym + '-01')))}`;
  let mes = hoy.slice(0, 7);
  const rodado = hoy >= corteDe(mes);
  if (rodado) mes = addMonths(hoy, 1).slice(0, 7);
  const corte = corteDe(mes);
  const finGasto = addDays(corte, -1); // último día que cubre el plan (el 29)
  const fin = monthEnd(mes + '-01');
  const prevMes = addMonths(mes + '-01', -1).slice(0, 7);
  const sigMes = addMonths(mes + '-01', 1).slice(0, 7);
  const sigNombre = monthName(sigMes + '-01').split(' ')[0].toLowerCase();
  const limite = addDays(fin, 5);
  const desde = (f) => (f < hoy ? hoy : f);
  const saldo = sum(D.cuentasDinero, (c) => c.saldo);
  const ev = [];
  const evProx = []; // lo que entra y se paga desde el día de corte: es del mes siguiente, no se usa para gastar este mes

  // Ingresos por recibir antes del día de corte (los que llegan desde ese día quedan para el mes siguiente).
  for (const m of rodado ? [prevMes, mes, sigMes] : [mes, sigMes]) {
    for (const r of ingresosDelMes(m)) {
      for (const p of r.cobrosPend) {
        if (p.fecha > limite) continue; // lo que entra del 1 al 5 del mes siguiente también se muestra (con los pagos de esos días)
        const e = { fecha: desde(p.fecha), concepto: r.nombre, clase: 'ingreso', monto: p.monto, aprox: !!p.aprox, fuente: r.nombre, mesPlan: m, centro: r.centro };
        if (p.fecha < corte) ev.push(e); else evProx.push(e);
      }
    }
  }
  const ingresosPend = sum(ev, (e) => e.monto);

  const pendTodos = D.movimientos.filter((m) => m.estado === 'pendiente' && m.fecha <= limite && centroOk(m.centro) && (D.config.incluirCuotaCarro || m.categoria !== 'carro') && !m.compromisoId);
  const pend = pendTodos.filter((m) => m.fecha < corte);
  for (const m of pend) ev.push({ fecha: desde(m.fecha), concepto: m.concepto, clase: 'fijo', monto: -m.monto, movId: m.id });
  for (const m of pendTodos.filter((x) => x.fecha >= corte)) evProx.push({ fecha: desde(m.fecha), concepto: m.concepto, clase: 'fijo', monto: -m.monto, movId: m.id });
  const fijosPend = sum(pend);

  // Mercado que falta: se reparte en los sábados que quedan del mes.
  const dias = [];
  for (let d = hoy; d <= finGasto; d = addDays(d, 1)) dias.push(d);
  const semanales = (dow) => { const l = dias.filter((d) => (parse(d).getDay() + 6) % 7 === dow); return l.length ? l : [finGasto]; };
  const repartir = (total, concepto, clase, fechas) => {
    if (total <= 0) return;
    const parte = Math.round(total / fechas.length);
    fechas.forEach((fecha, i) => ev.push({ fecha, concepto, clase, monto: -(i === fechas.length - 1 ? total - parte * (fechas.length - 1) : parte) }));
  };
  const mn = ingresoMinimo(mes);
  const mercadoRest = Math.max(0, mn.mercado - mn.mercadoReal);
  repartir(mercadoRest, 'Mercado (lo que falta del mes)', 'mercado', semanales(5));

  // Hormiga y rutinas (domicilios, parqueadero, maduros, huevos…): no son pagos obligatorios, salen de lo que puedes gastar.
  // Lo "ocasional" solo cuenta si se planea con el máximo.
  const conMaximo = D.config.planMaximo !== false;
  // Lo de hoy que ya se gastó (un domicilio, el parqueadero…) cumple la rutina de hoy: esa vez ya no se espera, porque su gasto
  // real ya salió de la cuenta. Cada gasto de hoy cumple una sola vez, primero las rutinas fijas y luego las ocasionales.
  const libresHoy = D.movimientos.filter((m) => m.estado === 'pagado' && m.fecha === hoy && m.tipo !== 'recurrente' && !m.compromisoId);
  const rutinas = D.rutinas.filter((r) => r.activo !== false).map((r) => {
    const fechas = r.cadaDias > 0 ? fechasCada(r, hoy, finGasto) : dias.filter((d) => (parse(d).getDay() + 6) % 7 === r.dia);
    return { r, fechas, veces: fechas.length, total: fechas.length * r.monto, cuenta: !r.ocasional || conMaximo };
  });
  const deHoy = rutinas.filter((x) => x.fechas.includes(hoy)).sort((a, b) => (a.r.ocasional ? 1 : 0) - (b.r.ocasional ? 1 : 0));
  const cumplir = (x, coincide) => {
    const i = libresHoy.findIndex(coincide);
    if (x.cumplidaHoy || i < 0) return;
    libresHoy.splice(i, 1);
    x.fechas = x.fechas.filter((f) => f !== hoy);
    x.veces = x.fechas.length;
    x.total = x.fechas.length * x.r.monto;
    x.cumplidaHoy = true;
  };
  for (const x of deHoy) cumplir(x, (m) => m.categoria === x.r.categoria); // misma categoría (un domicilio cumple el domicilio de hoy)
  for (const x of deHoy.filter((y) => y.r.tipo === 'hormiga')) cumplir(x, (m) => m.tipo === 'hormiga'); // o cualquier otra hormiga de hoy
  const evRut = rutinas.filter((x) => x.cuenta).flatMap((x) => x.fechas.map((fecha) => ({ fecha, clase: 'rutina', monto: -x.r.monto })));
  const rutinaEsperada = sum(rutinas.filter((x) => x.cuenta), (x) => x.total);
  const hormigaNormal = sum(rutinas.filter((x) => x.r.tipo === 'hormiga' && !x.r.ocasional), (x) => x.total);
  const hormigaOcasional = sum(rutinas.filter((x) => x.r.tipo === 'hormiga' && x.r.ocasional), (x) => x.total);

  const orden = { ingreso: 0, fijo: 1, mercado: 2, rutina: 2, compromiso: 3 };
  const cmp = (a, b) => a.fecha.localeCompare(b.fecha) || orden[a.clase] - orden[b.clase];
  const base = [...ev].sort(cmp); // solo lo obligatorio: ingresos, pagos y mercado
  const libre = base.reduce((a, e) => a + e.monto, saldo);
  const colchonPct = D.config.colchonPct ?? 10;
  const colchon = Math.max(0, libre) * (colchonPct / 100);

  // Cuánto se puede haber gastado hasta cada fecha sin quedar por debajo del colchón en ningún momento:
  // lo que hay en cuentas ese día, y lo que habrá después (ingresos y pagos que vienen).
  const crearTope = (lista) => {
    const l = [...lista].sort(cmp);
    const saldos = []; let corr = saldo;
    for (const e of l) { corr += e.monto; saldos.push(corr); }
    // `comprometido(t)` = presupuestos de compromisos que ya habría gastado hasta la fecha t (se restan de cada saldo).
    return (d, comprometido = () => 0) => {
      let minimo = l.reduce((a, e) => (e.fecha <= d ? a + e.monto : a), saldo) - comprometido(d);
      l.forEach((e, k) => { if (e.fecha > d) minimo = Math.min(minimo, saldos[k] - comprometido(e.fecha)); });
      return Math.max(0, minimo - colchon);
    };
  };
  const topeGastar = crearTope(base); // lo que puedes gastar: solo descuenta lo obligatorio
  const capEn = crearTope([...base, ...evRut]); // lo que queda para compromisos y gustos después de tu hormiga y rutinas
  const paraGastar = topeGastar(finGasto);

  // Compromisos que todavía no pasan. El presupuesto de cada uno lo fija Diego (se puede variar cuando quiera); el plan solo
  // calcula el MÁXIMO que se puede gastar en cada uno sin dañar los pagos, el colchón ni los presupuestos de los demás.
  const comps = D.compromisos.filter((c) => c.fecha.slice(0, 7) === mes && c.fecha >= hoy && c.fecha < corte).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const conPres = (c) => c.presupuesto > 0;
  const rest = (c) => (conPres(c) ? Math.max(0, c.presupuesto - compromisoGastado(c.id)) : 0); // lo que falta por gastar de su presupuesto
  const asignado = sum(comps, rest);
  const hasta = (t, excluir) => sum(comps.filter((x) => x.id !== excluir && x.fecha <= t), rest);
  const maximoDe = (c) => Math.floor(capEn(c.fecha, (t) => hasta(t, c.id)) / 1000) * 1000;
  for (const c of comps) ev.push({ fecha: c.fecha, concepto: c.nombre, clase: 'compromiso', monto: -rest(c), cid: c.id, sinPresupuesto: !conPres(c) });

  ev.sort(cmp);
  let run = saldo;
  let minimo = { valor: saldo, fecha: hoy };
  const antes = {};
  for (const e of ev) {
    if (e.cid) antes[e.cid] = run;
    run += e.monto;
    e.saldo = run;
    if (run < minimo.valor) minimo = { valor: run, fecha: e.fecha };
  }
  const finMes = run; // con lo que terminas el plan (antes del día de corte), sin descontar tu hormiga ni tus gustos
  const gustos = paraGastar - rutinaEsperada - asignado; // lo que queda libre para gustos, después de tu hormiga y tus compromisos

  // Lo que entra y se paga desde el día de corte: ya es del mes siguiente. Se muestra, pero no entra en lo que puedes gastar.
  const proxOrd = evProx.sort(cmp);
  for (const e of proxOrd) { run += e.monto; e.saldo = run; e.proximo = true; }
  const proximo = {
    corte, eventos: proxOrd, ingresos: proxOrd.filter((e) => e.clase === 'ingreso'), pagos: proxOrd.filter((e) => e.clase === 'fijo'),
    entra: sum(proxOrd.filter((e) => e.clase === 'ingreso')), sale: -sum(proxOrd.filter((e) => e.clase === 'fijo')), inicio: run,
  };

  // Quincenas: del día de hoy al 15 y del 16 al último día antes del corte.
  const medio = `${mes}-15`;
  const mesCorto = MESES_C[parse(mes + '-01').getMonth()];
  const diaHoy = hoy.slice(0, 7) === mes ? Number(hoy.slice(8)) : 1;
  const cortes = [
    { id: 'q1', nombre: `${diaHoy <= 15 ? diaHoy : 15}–15 ${mesCorto}`, desde: hoy, hasta: medio },
    { id: 'q2', nombre: `16–${Number(finGasto.slice(8))} ${mesCorto}`, desde: `${mes}-16`, hasta: finGasto },
  ].filter((q) => q.hasta >= hoy && (q.id !== 'q1' || hoy <= medio));
  const quincenas = cortes.map((q) => {
    const dentro = ev.filter((e) => e.fecha >= q.desde && e.fecha <= q.hasta);
    const inicio = ev.filter((e) => e.fecha < q.desde).reduce((a, e) => a + e.monto, saldo);
    const por = (clase) => -sum(dentro.filter((e) => e.clase === clase), (e) => e.monto);
    const ingresos = sum(dentro.filter((e) => e.clase === 'ingreso'), (e) => e.monto);
    const final = inicio + dentro.reduce((a, e) => a + e.monto, 0);
    return {
      ...q, inicio, ingresos, fijos: por('fijo'), mercado: por('mercado'), compromisos: por('compromiso'),
      rutina: -sum(evRut.filter((e) => e.fecha >= q.desde && e.fecha <= q.hasta)), final, minimo: Math.min(inicio, ...dentro.map((e) => e.saldo)),
    };
  });

  return {
    quincenas, rutinas, rutinaEsperada, hormigaNormal, hormigaOcasional, conMaximo,
    mes, hoy, fin, finGasto, corte, diaCorte, saldo, cuentas: D.cuentasDinero, eventos: ev, ingresosPend, fijosPend, mercadoRest, libre, colchonPct, colchon,
    // Mercado del mes: presupuesto − lo ya comprado = lo que falta por gastar (lo ya gastado nunca se cuenta en lo que falta).
    mercado: {
      presupuesto: mn.mercadoBruto, base: mn.mercadoBase, gastado: mn.mercadoReal, enTarjeta: mn.mercadoTarjeta, falta: mercadoRest, origen: mn.origenMercado,
      compras: D.movimientos.filter((m) => m.categoria === 'mercado' && m.fecha.slice(0, 7) === mes).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      veces: ev.filter((e) => e.clase === 'mercado').length,
    },
    paraGastar, gustos, asignado, proximo,
    // Lo que sobra después de tu hormiga y de TODOS los presupuestos: es lo que tienes de más por si algún compromiso necesita más dinero.
    // (es lo mismo que "te queda para gustos"; si el cálculo por fechas da menos, se usa ese para no prometer de más)
    deMas: (() => {
      const sobras = comps.filter(conPres).map((c) => maximoDe(c) - rest(c));
      return sobras.length ? Math.min(gustos, Math.min(...sobras) + 999) : gustos;
    })(),
    compromisos: comps.map((c) => ({ c, presupuesto: conPres(c) ? c.presupuesto : 0, restante: conPres(c) ? rest(c) : null, maximo: maximoDe(c), saldoAntes: antes[c.id] })),
    minimo, finMes, sigNombre,
  };
}

// ---------- Tarjeta de crédito y créditos ----------
export const tarjetaById = (id) => state.data.tarjetas.find((x) => x.id === id);
export function saveTarjetaConfig(id, patch) {
  Object.assign(tarjetaById(id), patch);
  save();
}
// Compra compartida: el banco cobra TODO en el extracto, pero las otras personas devuelven su parte. Se crea sola una plata esperada
// ("Reembolso: <concepto>") por lo que te deben, con la fecha del pago de la tarjeta (se puede mover en Ingresos → Fechas).
function sincronizarReembolso(tj, c) {
  const D = state.data;
  const previa = D.planIngresos.find((r) => r.compraId === c.id);
  if (!(c.partes > 1)) {
    if (previa) D.planIngresos = D.planIngresos.filter((r) => r !== previa);
    return;
  }
  const pago = pagoDeCorte(c.corte || corteDeFecha(c.fecha, tj), tj);
  const monto = Math.round((c.monto * (c.partes - 1)) / c.partes);
  const fecha = previa?.cobros?.[0]?.fecha || pago; // si ya moviste la fecha, se respeta
  const fila = { mes: previa?.mes || pago.slice(0, 7), nombre: 'Reembolso: ' + c.concepto, tipo: 'variable', centro: 'hogar', esperado: monto, cobros: [{ fecha, monto }], compraId: c.id };
  if (previa) Object.assign(previa, fila); else D.planIngresos.push({ id: uid(), ...fila });
}
export function saveCompraTarjeta(tid, compra) {
  const tj = tarjetaById(tid);
  const i = tj.compras.findIndex((x) => x.id === compra.id);
  if (i >= 0) tj.compras[i] = compra; else tj.compras.push(compra);
  sincronizarReembolso(tj, compra);
  save();
}
export function delCompraTarjeta(tid, id) {
  const tj = tarjetaById(tid);
  tj.compras = tj.compras.filter((x) => x.id !== id);
  state.data.planIngresos = state.data.planIngresos.filter((r) => r.compraId !== id);
  save();
}
export function savePlanTarjeta(tid, plan) {
  const tj = tarjetaById(tid);
  const i = tj.planes.findIndex((x) => x.id === plan.id);
  if (i >= 0) tj.planes[i] = plan; else tj.planes.push(plan);
  save();
}
export function delPlanTarjeta(tid, id) {
  const tj = tarjetaById(tid);
  tj.planes = tj.planes.filter((x) => x.id !== id);
  save();
}
// ---------- Compras con la tarjeta de crédito (desde el formulario de Gastos o desde Créditos) ----------
// Una sola cuota: entra en el extracto del corte que le toca. Varias cuotas: queda como compra a cuotas (con su tasa) desde ese extracto.
export function registrarCompraTarjeta(tid, { fecha, concepto, monto, cuotas = 1, tasaMV = 0, cuota = 0, categoria = 'otros-var', partes = 1 }) {
  const t = tarjetaById(tid);
  const corte = corteDeFecha(fecha, t);
  const compraId = uid();
  if (cuotas > 1) {
    savePlanTarjeta(tid, { id: uid(), concepto, cuota, cuotas, pagadas: 0, corteRef: corteMasN(corte, t, -1), tasaMV, valor: monto, categoria });
  } else {
    saveCompraTarjeta(tid, { id: compraId, fecha, concepto, monto, categoria, partes: partes > 1 ? partes : undefined });
  }
  return { corte, pago: pagoDeCorte(corte, t), compraId };
}
// Pagar un gasto pendiente CON la tarjeta de crédito: se agrega como compra de la tarjeta (entra en su extracto) y el gasto queda pagado sin descontar
// de ninguna cuenta.
export function pagarConTarjeta(id, tid) {
  const m = state.data.movimientos.find((x) => x.id === id);
  const t = tarjetaById(tid);
  if (!m || !t) return null;
  const r = registrarCompraTarjeta(tid, { fecha: todayISO(), concepto: m.concepto, monto: m.monto, categoria: m.categoria });
  marcarPagado(id, true, '');
  m.tarjetaCompra = { tid, id: r.compraId };
  m.medio = 'Tarjeta ' + t.nombre;
  save();
  return { ...r, tarjeta: t };
}

// ---------- ADDI: compras en cuotas con interés que se pagan en fechas fijas ----------
// Cada compra: { id, concepto, fecha, valor, cuotas, cuota, tasaMV, primera (fecha de pago de la primera cuota), categoria }. Se paga una cuota por mes,
// el mismo día de la primera. Sus cuotas pendientes aparecen solas como pagos por hacer (Plan del mes y Gastos).
export function fechaCuotaAddi(a, k) {
  const ym = addMonths(a.primera.slice(0, 7) + '-01', k - 1).slice(0, 7);
  return `${ym}-${pad(Math.min(Number(a.primera.slice(8)), daysInMonth(ym + '-01')))}`;
}
export const cuotasAddi = (a) => Array.from({ length: a.cuotas }, (_, i) => ({ n: i + 1, fecha: fechaCuotaAddi(a, i + 1), monto: a.cuota }));
const movCuotaAddi = (a, n) => state.data.movimientos.find((m) => m.addiId === a.id && m.addiN === n);
const datosCuotaAddi = (a, c) => ({ fecha: c.fecha, mes: c.fecha.slice(0, 7), concepto: `ADDI · ${a.concepto} (cuota ${c.n} de ${a.cuotas})`, monto: a.cuota });
// Cuántas cuotas van, cuántas faltan y cuál sigue. Una cuota sin pago creado y de un mes que ya pasó se da por pagada.
export function estadoAddi(a) {
  const mesHoy = todayISO().slice(0, 7);
  const cuotas = cuotasAddi(a).map((c) => {
    const mov = movCuotaAddi(a, c.n) || null;
    return { ...c, mov, pagada: mov ? mov.estado === 'pagado' : c.fecha.slice(0, 7) < mesHoy };
  });
  const faltan = cuotas.filter((c) => !c.pagada);
  return { cuotas, pagadas: cuotas.length - faltan.length, restantes: faltan.length, porPagar: faltan.length * a.cuota, proxima: faltan[0] || null, terminada: faltan.length === 0 };
}
function crearCuotasAddi() {
  const D = state.data;
  const hoy = todayISO();
  const meses = [hoy.slice(0, 7), addMonths(hoy, 1).slice(0, 7)];
  let cambio = false;
  for (const a of D.addi || []) {
    for (const c of cuotasAddi(a)) {
      if (!meses.includes(c.fecha.slice(0, 7)) || movCuotaAddi(a, c.n)) continue;
      D.movimientos.push({
        id: uid(), ...datosCuotaAddi(a, c), tipo: 'recurrente', categoria: 'deudas', centro: 'creditos', medio: '', nota: '', estado: 'pendiente', addiId: a.id, addiN: c.n,
      });
      cambio = true;
    }
  }
  return cambio;
}
export function saveAddi(a) {
  const D = state.data;
  const i = D.addi.findIndex((x) => x.id === a.id);
  if (i >= 0) D.addi[i] = a; else D.addi.push(a);
  // Los pagos pendientes de esa compra siguen sus datos; los ya pagados no se tocan.
  for (const m of [...D.movimientos]) {
    if (m.addiId !== a.id || m.estado !== 'pendiente') continue;
    if (m.addiN > a.cuotas) { D.movimientos = D.movimientos.filter((x) => x !== m); continue; }
    Object.assign(m, datosCuotaAddi(a, { n: m.addiN, fecha: fechaCuotaAddi(a, m.addiN) }));
  }
  crearCuotasAddi();
  save();
}
export function delAddi(id) {
  const D = state.data;
  D.addi = D.addi.filter((a) => a.id !== id);
  D.movimientos = D.movimientos.filter((m) => !(m.addiId === id && m.estado === 'pendiente'));
  save();
}
export function registrarCompraAddi({ concepto, fecha, valor, cuotas, cuota, tasaMV = 0, primera, categoria = 'otros-var' }) {
  const a = { id: uid(), concepto, fecha, valor, cuotas, cuota, tasaMV, primera, categoria };
  saveAddi(a);
  return a;
}

export function saveCredito(c) {
  const list = state.data.creditos;
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  save();
}
export function delCredito(id) {
  state.data.creditos = state.data.creditos.filter((c) => c.id !== id);
  save();
}

// ---------- Catálogo ----------
export function savePlantilla(p) {
  const list = state.data.plantillas;
  const i = list.findIndex((x) => x.id === p.id);
  const diasAntes = i >= 0 ? diasDe(list[i]) : null;
  if (i >= 0) list[i] = p; else list.push(p);
  if (diasAntes && JSON.stringify(diasAntes) !== JSON.stringify(diasDe(p))) {
    // Cambiaron los días de pago: los pagos pendientes siguen la nueva configuración (cada uno toma el pago cuyo día coincide con el suyo, o el
    // siguiente libre; los que sobran se quitan). Los ya pagados no se tocan.
    const n = nPagosDe(p);
    const dias = diasDe(p);
    const quitar = new Set();
    const meses = [...new Set(state.data.movimientos.filter((m) => m.plantillaId === p.id).map((m) => m.mes))];
    for (const mes of meses) {
      const delMes = state.data.movimientos.filter((m) => m.plantillaId === p.id && m.mes === mes);
      const ocupados = new Set(delMes.filter((m) => m.estado !== 'pendiente').map((m) => m.nPago || 0));
      for (const m of delMes.filter((x) => x.estado === 'pendiente')) {
        const dia = Number(m.fecha.slice(8));
        let k = dias.findIndex((d, j) => j < n && d === dia && !ocupados.has(j));
        if (k < 0) k = dias.findIndex((_, j) => j < n && !ocupados.has(j));
        if (k < 0) { quitar.add(m); continue; }
        ocupados.add(k);
        m.fecha = fechaPlantilla(p, mes, k);
        m.concepto = nombrePago(p, k);
        if (dias.length > 1) m.nPago = k; else delete m.nPago;
      }
    }
    state.data.movimientos = state.data.movimientos.filter((m) => !quitar.has(m));
  }
  save();
}
export function delPlantilla(id) {
  state.data.plantillas = state.data.plantillas.filter((p) => p.id !== id);
  save();
}
export function saveCuenta(c) {
  const list = state.data.cuentas;
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  save();
}
export function delCuenta(id) {
  state.data.cuentas = state.data.cuentas.filter((c) => c.id !== id);
  for (const p of state.data.plantillas) if (p.cuenta === id) p.cuenta = '';
  save();
}
export function saveFuente(f) {
  const list = state.data.fuentesIngreso;
  const i = list.findIndex((x) => x.id === f.id);
  if (i >= 0) list[i] = f; else list.push(f);
  save();
}
export function delFuente(id) {
  state.data.fuentesIngreso = state.data.fuentesIngreso.filter((f) => f.id !== id);
  save();
}
export function saveCategoria(c) {
  const list = state.data.categorias;
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  save();
}
export function delCategoria(id) {
  state.data.categorias = state.data.categorias.filter((c) => c.id !== id);
  save();
}
export const categoriaEnUso = (id) =>
  state.data.movimientos.some((m) => m.categoria === id) || state.data.plantillas.some((p) => p.categoria === id);

// ---------- Datos de ejemplo (para ver el dashboard con vida) ----------
export function cargarDemo() {
  const rnd = mulberry32(2026);
  const r = (a, b) => Math.round((a + rnd() * (b - a)) / 1000) * 1000;
  const hoy = todayISO();
  const mesActual = hoy.slice(0, 7);
  const D = state.data;
  const nuevo = [];
  const nuevoIng = [];

  for (let k = -3; k <= 0; k++) {
    const m0 = addMonths(hoy, k);
    const mes = m0.slice(0, 7);
    const dim = daysInMonth(m0);
    const ultimo = mes === mesActual ? Number(hoy.slice(8)) : dim;

    // Recurrentes del mes (Brisas: solo algunos, como si se eligieran).
    D.plantillas.forEach((p, i) => {
      if (p.centro === 'brisas' && p.id === 'p-movistar-brisas' && k % 2 === 0) return;
      const dia = Math.min(dim, p.dia || 3 + ((i * 7) % 24));
      const fecha = `${mes}-${pad(dia)}`;
      const pagado = mes < mesActual || fecha <= hoy;
      nuevo.push({
        id: uid(), fecha, concepto: p.concepto, monto: Math.round(p.monto * (0.97 + rnd() * 0.08) / 100) * 100,
        tipo: 'recurrente', categoria: p.categoria, centro: p.centro, medio: '', nota: '',
        estado: pagado ? 'pagado' : 'pendiente', plantillaId: p.id, mes, demo: true,
      });
    });

    const dia = (n) => `${mes}-${pad(Math.max(1, Math.min(n, ultimo)))}`;
    // Mercado semanal
    for (let w = 0; w < 4; w++) {
      const d = 2 + w * 7 + Math.floor(rnd() * 3);
      if (d <= ultimo) nuevo.push(mov(dia(d), 'Mercado Cañaveral', r(130000, 260000), 'variable', 'mercado', 'Débito'));
    }
    // Gasolina
    for (const d of [5, 14, 24]) if (d <= ultimo) nuevo.push(mov(dia(d), 'Gasolina', r(90000, 140000), 'variable', 'transporte', 'TC Rappi'));
    if (ultimo >= 12) nuevo.push(mov(dia(12), 'Baño Draco + vacuna', r(90000, 150000), 'variable', 'mascota', 'Débito'));
    if (ultimo >= 18) nuevo.push(mov(dia(18), 'Peluquería', r(40000, 55000), 'variable', 'cuidado', 'Efectivo'));
    if (ultimo >= 20) nuevo.push(mov(dia(20), 'Lavado de carro', r(40000, 55000), 'variable', 'vehiculo', 'Efectivo'));
    // Hormiga: más fuerte en fines de semana
    for (let d = 1; d <= ultimo; d++) {
      const f = dia(d);
      const dow = (new Date(f + 'T00:00:00').getDay() + 6) % 7;
      if (dow >= 4 && rnd() < 0.75) nuevo.push(mov(f, ['Rappi', 'Salida con amigos', 'Pizza', 'Hamburguesa'][Math.floor(rnd() * 4)], r(28000, 95000), 'hormiga',
        ['domicilios', 'salidas', 'comida-rapida', 'comida-rapida'][Math.floor(rnd() * 4)], 'TC Rappi'));
      else if (rnd() < 0.22) nuevo.push(mov(f, 'Café', r(6000, 15000), 'hormiga', 'cafe', 'Efectivo'));
    }
    // Ingresos
    for (const f of D.fuentesIngreso) {
      nuevoIng.push({ id: uid(), fecha: `${mes}-${pad(Math.min(dim, 5 + (f.nombre.length % 15)))}`, fuente: f.nombre, monto: f.monto, centro: f.centro, nota: '', demo: true });
    }
  }
  D.movimientos.push(...nuevo);
  D.ingresos.push(...nuevoIng.filter((i) => i.fecha <= addDays(hoy, 31)));
  save();

  function mov(fecha, concepto, monto, tipo, cat, medio) {
    return { id: uid(), fecha, concepto, monto, tipo, categoria: cat, centro: 'hogar', medio, nota: '', estado: 'pagado', demo: true };
  }
}

export function quitarDemo() {
  state.data.movimientos = state.data.movimientos.filter((m) => !m.demo);
  state.data.ingresos = state.data.ingresos.filter((i) => !i.demo);
  save();
}
