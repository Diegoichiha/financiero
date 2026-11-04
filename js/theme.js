// Aplica el tema guardado antes de pintar para evitar parpadeo.
(function () {
  try {
    var t = localStorage.getItem('finanzas-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sin almacenamiento */ }
})();
