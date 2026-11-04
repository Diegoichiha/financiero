// Pantallas de configuración: Cuentas para pagar y Ajustes.
import { h, uid, money, download, monthName, todayISO } from './util.js';
import {
  state, TIPOS, hooks, save, saveCuenta, delCuenta, saveCategoria, delCategoria, categoriaEnUso, centroNombre,
  cargarDemo, quitarDemo, hayDemo, mercadoLista, saveMercadoMes, delMercadoMes,
} from './store.js';
import { modal, confirmar, field, moneyInput, select, toast, copiar } from './ui.js';

const centroOpts = () => state.data.centros.map((c) => ({ value: c.id, label: c.nombre }));

// =====================================================================
// CUENTAS PARA PAGAR
// =====================================================================
function editarCuenta(c) {
  const nuevo = !c;
  c = c || { id: uid(), proveedor: '', referencia: '', centro: state.centro === 'todos' ? 'hogar' : state.centro, nota: '' };
  const fProv = h('input', { type: 'text', value: c.proveedor, placeholder: 'Ej. EMCALI' });
  const fRef = h('input', { type: 'text', value: c.referencia, placeholder: 'Número de cuenta o referencia de pago' });
  const fCentro = select(centroOpts(), c.centro);
  const fNota = h('input', { type: 'text', value: c.nota || '', placeholder: 'Ej. pagar en PSE, día de corte…' });
  modal(nuevo ? 'Nueva cuenta para pagar' : 'Editar cuenta', [
    field('Proveedor', fProv, 'full'), field('Número de cuenta / referencia', fRef, 'full'), field('Centro', fCentro), field('Nota', fNota),
  ], {
    onSave: () => {
      if (!fProv.value.trim()) return 'Escribe el proveedor.';
      if (!fRef.value.trim()) return 'Escribe la referencia.';
      saveCuenta({ ...c, proveedor: fProv.value.trim(), referencia: fRef.value.trim(), centro: fCentro.value, nota: fNota.value.trim() });
      hooks.rerender();
    },
    peligro: nuevo ? null : { label: 'Eliminar', fn: () => { delCuenta(c.id); hooks.rerender(); } },
  });
}

export function renderCuentas(root) {
  const cuentas = state.data.cuentas;
  root.replaceChildren(h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', {}, h('div', { class: 'card-title' }, 'Cuentas para pagar'),
        h('div', { class: 'card-sub' }, 'Números de cuenta y referencias de pago. Aparecen junto a cada recurrente para copiarlos en un clic.')),
      h('button', { class: 'btn primary', onclick: () => editarCuenta() }, '+ Nueva cuenta')),
    cuentas.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Proveedor', 'Referencia', 'Centro', 'Nota', 'Recurrentes'].map((t) => h('th', {}, t)), h('th'))),
        h('tbody', {}, cuentas.map((c) => {
          const asoc = state.data.plantillas.filter((p) => p.cuenta === c.id).map((p) => p.concepto);
          return h('tr', {},
            h('td', {}, h('b', {}, c.proveedor)),
            h('td', {}, h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, h('span', { class: 'num' }, c.referencia),
              h('button', { class: 'btn sm', onclick: () => copiar(c.referencia), 'aria-label': 'Copiar ' + c.referencia }, 'Copiar'))),
            h('td', {}, centroNombre(c.centro)),
            h('td', { class: 'muted' }, c.nota),
            h('td', { class: 'muted' }, asoc.join(', ') || '—'),
            h('td', {}, h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + c.proveedor, onclick: () => editarCuenta(c) }, '✎')));
        }))))
      : h('div', { class: 'empty' }, 'Todavía no hay cuentas guardadas.')));
}

// =====================================================================
// AJUSTES
// =====================================================================
export function renderAjustes(root) {
  const cfg = state.data.config;

  // Presupuestos
  const campos = TIPOS.map((t) => {
    const inp = moneyInput(cfg.presupuestos[t.id] || 0, { 'aria-label': 'Presupuesto ' + t.nombre });
    inp.addEventListener('change', () => { cfg.presupuestos[t.id] = inp.getValue(); save(); toast('Presupuesto guardado'); });
    return field(t.nombre, inp);
  });
  const tope = moneyInput(cfg.tope || 0, { 'aria-label': 'Tope mensual total' });
  tope.addEventListener('change', () => { cfg.tope = tope.getValue(); save(); toast('Tope guardado'); });

  const mercado = moneyInput(cfg.mercadoEstimado || 0, { 'aria-label': 'Mercado mensual estimado' });
  mercado.addEventListener('change', () => { cfg.mercadoEstimado = mercado.getValue(); save(); toast('Mercado estimado guardado'); });

  const presCard = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Presupuesto mensual'),
    h('div', { class: 'card-sub' }, 'Con un tope por tipo, el Resumen muestra cuánto llevas y avisa cuando te acercas. Déjalo en 0 si no quieres tope.'),
    h('div', { class: 'form-grid' }, ...campos),
    h('div', { class: 'form-grid' }, field('Tope mensual total (para el ritmo ideal de la gráfica de acumulado)', tope, 'wide')),
    h('div', { class: 'card-sub' }, 'Si el tope total está en 0, el ritmo ideal se calcula con tus ingresos del mes.'),
    h('div', { class: 'form-grid', style: { marginTop: '8px' } }, field('Mercado mensual estimado (para el ingreso mínimo)', mercado, 'wide')),
    h('div', { class: 'card-sub' }, 'En 0 se usa el promedio de tus últimos 3 meses con mercado; si no hay historial, lo gastado este mes. Si gastas más que el estimado, cuenta lo gastado.'));


  // Historial de mercado: de aquí sale el promedio mensual y el presupuesto de mercado.
  const parseCompras = (txt) => txt.split(/[s;,]+/).map((x) => Number(x.replace(/./g, '').replace(/[^d]/g, ''))).filter((n) => n > 0);
  const editarMercado = (ym) => {
    const actual = state.data.mercadoHistorial.find((x) => x.mes === ym);
    const fMes = h('input', { type: 'month', value: ym || todayISO().slice(0, 7), disabled: !!ym });
    const fCompras = h('textarea', { placeholder: '118607, 38400, 237280…' });
    fCompras.value = actual ? actual.compras.join(', ') : '';
    const info = h('div', { class: 'card-sub full' });
    const calc = () => {
      const c = parseCompras(fCompras.value);
      const total = c.reduce((a, b) => a + b, 0);
      info.textContent = c.length ? `${c.length} compras · total ${money(total)} · promedio por compra ${money(total / c.length)}` : 'Pega o escribe los montos de las compras del mes.';
    };
    fCompras.addEventListener('input', calc);
    calc();
    modal(ym ? 'Editar compras de ' + monthName(ym + '-01') : 'Agregar mes de mercado', [
      field('Mes', fMes, 'full'),
      field('Compras del supermercado (separadas por coma, espacio o salto de línea)', fCompras, 'full'),
      info,
    ], {
      onSave: () => {
        const c = parseCompras(fCompras.value);
        if (!fMes.value) return 'Elige el mes.';
        if (!c.length) return 'Escribe al menos una compra.';
        saveMercadoMes(fMes.value, c);
        hooks.rerender();
      },
      peligro: actual ? { label: 'Eliminar mes', fn: () => { delMercadoMes(ym); hooks.rerender(); } } : null,
    });
  };
  const meses = mercadoLista();
  // El promedio usa solo meses completos: el mes en curso todavía está a medias y bajaría la cifra.
  const mesHoy = todayISO().slice(0, 7);
  const ultimos = meses.filter((m) => m.mes < mesHoy).slice(0, 3);
  const promedioMes = ultimos.length ? ultimos.reduce((a, m) => a + m.total, 0) / ultimos.length : 0;
  const mercadoCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', {}, h('div', { class: 'card-title' }, 'Historial de mercado (Cañaveral)'),
        h('div', { class: 'card-sub' }, 'Con las compras de cada mes se calcula el promedio y el presupuesto de mercado.')),
      h('button', { class: 'btn primary', onclick: () => editarMercado() }, '+ Agregar mes')),
    meses.length
      ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl compact' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Mes'), h('th', { class: 'r' }, 'Compras'), h('th', { class: 'r' }, 'Total del mes'), h('th', { class: 'r' }, 'Promedio por compra'), h('th', {}, 'Origen'), h('th'))),
        h('tbody', {}, meses.map((m) => h('tr', {},
          h('td', {}, monthName(m.mes + '-01')), h('td', { class: 'r' }, String(m.n)), h('td', { class: 'r' }, money(m.total)), h('td', { class: 'r' }, money(m.total / m.n)),
          h('td', { class: 'muted' }, m.origen === 'historial' ? 'Historial' : 'Gastos registrados' + (m.mes >= mesHoy ? ' (mes en curso)' : '')),
          h('td', {}, m.origen === 'historial' ? h('button', { class: 'btn ghost icon', 'aria-label': 'Editar ' + m.mes, onclick: () => editarMercado(m.mes) }, '✎') : null))))))
      : h('div', { class: 'muted' }, 'Aún no hay meses con compras de mercado.'),
    ultimos.length
      ? h('div', { class: 'callout' }, (ultimos.length === 1 ? 'Promedio mensual del último mes completo: ' : `Promedio mensual de los últimos ${ultimos.length} meses completos: `), h('b', {}, money(promedioMes)),
        cfg.mercadoEstimado > 0 ? ` · hoy se usa tu estimado manual de ${money(cfg.mercadoEstimado)} (déjalo en 0 para usar el promedio).` : ' · es el presupuesto de mercado de cada mes.')
      : null,
    h('div', { class: 'card-sub' }, 'Los meses que registres en Gastos con categoría Mercado suman automáticamente al historial.'));

  // Categorías
  const filasCat = [];
  for (const t of TIPOS) {
    filasCat.push(h('div', { class: 'card-sub', style: { marginTop: '8px', fontWeight: 600 } }, t.nombre));
    for (const c of state.data.categorias.filter((x) => x.tipo === t.id)) {
      const nm = h('input', { type: 'text', value: c.nombre, 'aria-label': 'Nombre de la categoría' });
      nm.addEventListener('change', () => { if (nm.value.trim()) { c.nombre = nm.value.trim(); save(); } else nm.value = c.nombre; });
      const tp = select(TIPOS.map((x) => ({ value: x.id, label: x.corto })), c.tipo, { 'aria-label': 'Tipo' });
      tp.addEventListener('change', () => { c.tipo = tp.value; save(); hooks.rerender(); });
      const uso = categoriaEnUso(c.id) || c.id === 'carro';
      filasCat.push(h('div', { class: 'cat-row' }, nm, tp,
        h('button', { class: 'btn ghost icon danger', disabled: uso, title: uso ? 'En uso: no se puede eliminar' : 'Eliminar categoría', 'aria-label': 'Eliminar ' + c.nombre,
          onclick: () => { delCategoria(c.id); hooks.rerender(); } }, '✕')));
    }
  }
  const nuevoNombre = h('input', { type: 'text', placeholder: 'Nueva categoría…' });
  const nuevoTipo = select(TIPOS.map((x) => ({ value: x.id, label: x.corto })), 'variable');
  const catCard = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Categorías'),
    h('div', { class: 'card-sub' }, 'Cada categoría pertenece a un tipo. "Cuota carro" es especial: el interruptor del filtro la incluye o excluye de los totales.'),
    h('div', {}, ...filasCat),
    h('form', { class: 'row', style: { marginTop: '8px' }, onsubmit: (e) => {
      e.preventDefault();
      const nombre = nuevoNombre.value.trim();
      if (!nombre) return;
      let id = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
      if (state.data.categorias.some((c) => c.id === id)) id += '-' + uid().slice(-3);
      saveCategoria({ id, nombre, tipo: nuevoTipo.value });
      hooks.rerender();
    } }, nuevoNombre, nuevoTipo, h('button', { type: 'submit', class: 'btn' }, 'Agregar categoría')));

  // Medios de pago
  const medios = h('input', { type: 'text', value: state.data.medios.join(', '), 'aria-label': 'Medios de pago', style: { width: '100%' } });
  medios.addEventListener('change', () => {
    state.data.medios = medios.value.split(',').map((x) => x.trim()).filter(Boolean);
    save();
    toast('Medios de pago guardados');
  });
  const medCard = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Medios de pago'),
    h('div', { class: 'card-sub' }, 'Separados por coma. Aparecen al registrar un gasto.'),
    medios);

  // Datos
  const archivo = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.movimientos) || !Array.isArray(d.categorias)) throw new Error('Formato no reconocido');
      if (!(await confirmar('Esto reemplaza TODOS los datos actuales por los del archivo. Se guarda una copia automática antes. ¿Continuar?', 'Importar'))) return;
      state.data = d;
      save();
      toast('Datos importados');
      location.reload();
    } catch (e) {
      toast('No se pudo importar: ' + e.message);
    }
  });
  const datosCard = h('section', { class: 'card' },
    h('div', { class: 'card-title' }, 'Tus datos'),
    h('div', { class: 'card-sub' }, 'Todo se guarda en el archivo data/finanzas.json de esta carpeta, con copias automáticas en data/backups. Nada sale de tu computador.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => download(`finanzas-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.data, null, 2)) }, 'Exportar copia (JSON)'),
      h('button', { class: 'btn', onclick: () => archivo.click() }, 'Importar copia…'), archivo,
      hayDemo()
        ? h('button', { class: 'btn danger', onclick: () => { quitarDemo(); hooks.rerender(); toast('Datos de ejemplo eliminados'); } }, 'Quitar datos de ejemplo')
        : h('button', { class: 'btn', onclick: () => { cargarDemo(); toast('Datos de ejemplo cargados'); hooks.goTab('resumen'); } }, 'Cargar datos de ejemplo')));

  root.replaceChildren(h('div', { class: 'stack' }, presCard, mercadoCard, catCard, medCard, datosCard));
}
