// Íconos de línea (24×24), dibujados a mano. Solo textos fijos del proyecto: no entra contenido del usuario.
const P = {
  resumen: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  plan: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8.5 15.5l2.3 2.3 4.7-4.8"/>',
  recurrentes: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
  creditos: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  movimientos: '<path d="M7 7l10 10"/><path d="M17 8v9H8"/>',
  ingresos: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
  compromisos: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  cuentas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  guia: '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v15H6.5A2.5 2.5 0 004 19.5z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/><path d="M9 7h7M9 11h5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path d="M15.5 9.5L13 12l2.5 2.5"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
};

export function icon(nombre, size = 20) {
  const caja = document.createElement('span');
  caja.className = 'ico';
  caja.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nombre] || ''}</svg>`;
  return caja;
}
