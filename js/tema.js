// Composición clara u oscura: la misma para la app y para la pantalla de ingreso.
import { h } from './util.js';
import { icon } from './icons.js';

export const esOscuro = () => document.documentElement.getAttribute('data-theme') === 'dark'
  || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);

export function alternarTema() {
  const siguiente = esOscuro() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', siguiente);
  localStorage.setItem('finanzas-theme', siguiente);
}

// Interruptor día / noche (píldora con perilla). `alCambiar` repinta lo que dependa del tema (por ejemplo, los gráficos).
export function switchTema(alCambiar) {
  const b = h('button', {
    class: 'theme-switch', role: 'switch', type: 'button', 'aria-label': 'Composición oscura', title: 'Cambiar entre composición clara y oscura',
    onclick: () => { alternarTema(); b.setAttribute('aria-checked', String(esOscuro())); if (alCambiar) alCambiar(); },
  }, h('i', { class: 'ts-knob' }), h('span', { class: 'ts-ico sun' }, icon('sol', 15)), h('span', { class: 'ts-ico moon' }, icon('luna', 15)));
  b.setAttribute('aria-checked', String(esOscuro()));
  return b;
}
