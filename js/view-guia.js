// Guía de uso: qué hacer cada día, qué significa cada número y cómo funciona la cuenta. Es corta a propósito.
import { h } from './util.js';
import { icon } from './icons.js';
import { state, hooks } from './store.js';

const PASOS = [
  { t: 'Pon lo que tienes hoy', d: 'La primera vez, escribe en "Tengo hoy" (Plan del mes) el saldo de cada cuenta. Después se mueve solo con tus ingresos y pagos; si no coincide con el banco, corrígelo ahí.', ir: 'plan', b: 'Ir al Plan del mes' },
  { t: 'Anota lo que recibes', d: 'En Ingresos pulsa "+ Recibí" cuando te paguen. Lo que todavía no llega queda como "Espero recibir", con su fecha. Eliges en qué cuenta entró y se suma sola a "Tengo hoy".', ir: 'ingresos', b: 'Ir a Ingresos' },
  { t: 'Marca lo que pagas', d: 'En Recurrentes elige los pagos del mes y pulsa "Marcar pagado" al pagar cada uno. Lo que sigue pendiente es "Falta por pagar". Eliges de qué cuenta pagaste y se descuenta sola de "Tengo hoy".', ir: 'recurrentes', b: 'Ir a Recurrentes' },
  { t: 'Registra lo que gastas', d: 'En Gastos anota el mercado, domicilios, salidas… Lo que ya compraste en mercado se descuenta del presupuesto de mercado. Eliges la cuenta de la que salió (o ninguna, si fue en efectivo o con tarjeta). Cada gasto guarda su hora y la lista va en el orden en que pagaste (lo último arriba); lo pendiente queda aparte, abajo.', ir: 'movimientos', b: 'Ir a Gastos' },
  { t: 'Presupuesta tus compromisos', d: 'En el Plan del mes, escribe cuánto quieres gastar en cada compromiso (paseos, cumpleaños…). El plan te dice el máximo posible y cuánto te queda para gustos.', ir: 'plan', b: 'Ir a los compromisos' },
];

const GLOSARIO = [
  ['Tengo hoy', 'La suma de lo que hay hoy en tus cuentas.'],
  ['Espero recibir', 'Los ingresos que faltan por llegar este mes, con su fecha. Solo cuentan los que llegan antes del día de corte.'],
  ['Falta por pagar', 'Lo que sí o sí hay que pagar: los pagos recurrentes pendientes y el mercado que falta por comprar.'],
  ['Colchón', 'Un pedacito (10 % por defecto) que el plan no te deja gastar, por si algo sale distinto. Lo cambias en "Ajustes del plan".'],
  ['Puedes gastar', 'Tengo + espero recibir − falta por pagar − colchón. Es la plata libre del mes para todo lo que no es obligación.'],
  ['Hormiga y rutinas', 'Lo que sueles gastar sin pensarlo mucho: domicilios, parqueadero, antojos. No es un pago obligatorio: sale de "Puedes gastar".'],
  ['Compromisos', 'Eventos con fecha (paseos, cumpleaños, grados). Tú pones el presupuesto de cada uno y el plan te muestra el máximo que cabe.'],
  ['Te queda para gustos', 'Lo que sobra de "Puedes gastar" después de tu hormiga y tus compromisos. Si algo cuesta menos que esto, puedes comprarlo.'],
  ['Día de corte', 'Lo que entra el 30 ya es del mes siguiente: el plan de noviembre solo cuenta lo que entra hasta el 29.'],
];

const PESTAÑAS = [
  ['resumen', 'Resumen', 'Balance del mes o de la semana, gráficas y el presupuesto de fijos.'],
  ['plan', 'Plan del mes', 'Lo más importante: cuánto tienes, cuánto esperas, cuánto debes pagar y cuánto puedes gastar.'],
  ['recurrentes', 'Recurrentes', 'Los pagos que se repiten cada mes y su estado (pendiente o pagado).'],
  ['creditos', 'Créditos', 'La tarjeta (compras y cuotas) y el crédito del carro.'],
  ['movimientos', 'Gastos', 'Todo lo que gastas: mercado, domicilios, salidas, compras.'],
  ['ingresos', 'Ingresos', 'Lo que esperas recibir y lo que ya recibiste, con fechas.'],
  ['compromisos', 'Compromisos', 'Paseos, cumpleaños y grados con su presupuesto y lo que has apartado.'],
  ['cuentas', 'Cuentas para pagar', 'Números de cuenta y referencias de pago, con botón para copiarlos.'],
  ['ajustes', 'Ajustes', 'Presupuestos, categorías, copias de seguridad y datos de ejemplo.'],
];

export function renderGuia(root) {
  const nombre = (state.usuario?.nombre || '').split(' ')[0];
  const ir = (id) => () => hooks.goTab(id);

  const cBienvenida = h('section', { class: 'card w6 flow-card' },
    h('div', { class: 'card-title' }, nombre ? `Hola, ${nombre}` : 'Bienvenido'),
    h('div', {}, 'Esta app te dice, en cada momento, cuánto puedes gastar sin dañar tus pagos. La idea es simple: primero lo que sí o sí hay que pagar, y lo que queda es para tu hormiga, tus compromisos y tus gustos.'),
    h('div', { class: 'eq', 'aria-label': 'Tengo, más espero recibir, menos falta por pagar, igual a puedes gastar' },
      h('span', {}, 'Tengo hoy'), h('i', {}, '+'), h('span', {}, 'Espero recibir'), h('i', {}, '−'), h('span', {}, 'Falta por pagar'), h('i', {}, '='), h('span', { class: 'res' }, 'Puedes gastar')),
    h('div', { class: 'card-sub' }, 'Todo se llena a mano: nada se conecta a tu banco. Con 5 minutos de cuidado al día, el plan se mantiene fiel.'));

  const cPasos = h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Tu rutina en 5 pasos'), h('div', { class: 'card-sub' }, 'Haz esto cuando pase algo y el plan siempre estará al día.'))),
    h('ol', { class: 'steps' }, PASOS.map((p, i) => h('li', {},
      h('span', { class: 'n' }, String(i + 1)),
      h('div', {}, h('b', {}, p.t), h('div', { class: 'card-sub' }, p.d)),
      h('button', { class: 'btn sm', onclick: ir(p.ir) }, p.b)))));

  const cGlosario = h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Qué significa cada número'), h('div', { class: 'card-sub' }, 'Los mismos nombres que ves en el Plan del mes.'))),
    h('dl', { class: 'glos' }, GLOSARIO.map(([t, d]) => h('div', {}, h('dt', {}, t), h('dd', {}, d)))));

  const cPestanas = h('section', { class: 'card w6' },
    h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title' }, 'Para qué sirve cada pestaña'), h('div', { class: 'card-sub' }, 'Toca una para abrirla.'))),
    h('div', { class: 'tabs-guia' }, PESTAÑAS.map(([id, n, d]) => h('button', { class: 'tg', onclick: ir(id) },
      icon(id, 22), h('span', {}, h('b', {}, n), h('small', {}, d))))));

  const cTips = h('section', { class: 'card w3' },
    h('div', { class: 'card-title' }, 'Tips rápidos'),
    h('ul', { class: 'guia-list' },
      h('li', {}, 'El interruptor de arriba a la derecha cambia entre composición clara y oscura.'),
      h('li', {}, 'Cada gráfica tiene "Ver tabla" para ver los números exactos.'),
      h('li', {}, 'Los números de cuenta de "Cuentas para pagar" se copian con un clic.'),
      h('li', {}, 'Todo se guarda solo. Cada 30 minutos la app hace una copia en la carpeta data/backups.'),
      h('li', {}, 'En Ajustes puedes exportar una copia de tus datos cuando quieras.'),
      h('li', {}, 'Si compras con la tarjeta algo que pagan entre varias personas, en Créditos → "Agregar compra" indica entre cuántas se divide: la app deja tu parte y crea sola el reembolso que esperas.'),
      h('li', {}, 'Lo que pagas con una cuenta baja el saldo de esa cuenta y, con él, lo que puedes gastar. Si hoy ya pagaste el domicilio o el parqueadero de tu rutina, esa vez de hoy deja de esperarse: no se cuenta dos veces.'),
      h('li', {}, 'Si arriba aparece el aviso "pagos sin cuenta", pulsa "Descontar de mi cuenta" y elige de cuál salió cada uno: así el plan queda al día.')));

  const cCuenta = h('section', { class: 'card w3' },
    h('div', { class: 'card-title' }, 'Tu cuenta y seguridad'),
    h('ul', { class: 'guia-list' },
      h('li', {}, 'Cada persona entra con su usuario y su contraseña, y tiene sus propios datos: lo que una anota no lo ve la otra.'),
      h('li', {}, 'La contraseña se cambia desde tu nombre, arriba a la derecha → "Cambiar contraseña". Usa una que no uses en otro sitio.'),
      h('li', {}, 'Si olvidas tu contraseña, avísale a Diego: puede restablecerla y te da una temporal para crear otra.'),
      h('li', {}, 'Puedes entrar desde el computador o el celular en https://financiero.diegotdesigner.com. Úsenla siempre ahí: la copia que corre en el computador de Diego tiene datos aparte.'),
      h('li', {}, 'Después de 5 intentos fallidos el ingreso se bloquea 10 minutos.')));

  root.replaceChildren(h('div', { class: 'grid' }, cBienvenida, cPasos, cGlosario, cPestanas, cTips, cCuenta));
}
