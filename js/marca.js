// La marca: el logo (barras que suben con una moneda) más el nombre. Es un botón que lleva al inicio.
import { h } from './util.js';

export function botonMarca(alClick, titulo = 'Volver al inicio') {
  return h('button', { type: 'button', class: 'brand', title: titulo, 'aria-label': 'Hogy Financiero: ' + titulo.toLowerCase(), onclick: alClick },
    h('img', { class: 'brand-logo', src: 'icons/favicon.svg', alt: '', width: 36, height: 36 }),
    h('span', { class: 'brand-word' }, 'Hogy Financiero'));
}
