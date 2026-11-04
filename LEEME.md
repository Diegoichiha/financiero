# Hogy Financiero

Dashboard personal de gastos e ingresos. Todo corre en tu computador; nada se sube a internet.

## Cómo abrirlo

1. Doble clic en `iniciar.bat` (abre http://localhost:5210). Deja la ventana negra abierta mientras lo uses.
2. Entra con tu usuario y tu contraseña. Para cerrarlo, cierra esa ventana.

Requiere Node.js (ya lo tienes instalado).

## Ingreso y usuarios

- Hay dos usuarios con los mismos datos: **Diego Torres** (`diego`) y **Andrea Cuellar** (`andrea`).
- Las contraseñas temporales están en `data/CREDENCIALES.txt`. En el primer ingreso la app pide crear una contraseña propia y la temporal deja de servir. Cuando las dos personas ya la hayan cambiado, borra ese archivo.
- Las contraseñas no se guardan: solo su huella cifrada (`data/usuarios.json`). Tras 5 intentos fallidos, el ingreso se bloquea 10 minutos.
- Administrar usuarios (desde esta carpeta, con Node):
  - `node usuarios.js listar`
  - `node usuarios.js clave andrea` genera otra contraseña temporal (si alguien olvidó la suya)
  - `node usuarios.js agregar <usuario> "<Nombre completo>"` y `node usuarios.js quitar <usuario>`
- Esta copia local solo acepta conexiones de este computador (`localhost`). La versión para usar desde cualquier lugar está en https://financiero.diegotdesigner.com (ver "En la web").

## Cómo se usa

Dentro de la app está la pestaña **Guía de uso** con la rutina diaria y el significado de cada número. En resumen:

- **Plan del mes:** lo más importante. Tengo hoy + espero recibir − falta por pagar − colchón = puedes gastar.
- **Recurrentes:** cada mes marca los pagos que aplican y pulsa "Marcar pagado" al pagar.
- **Gastos / Ingresos:** registra lo que gastas y lo que recibes (botón "+ Recibí").
- **Compromisos:** presupuesta paseos, cumpleaños y grados.
- **Cuentas para pagar / Ajustes:** números de cuenta, presupuestos, categorías, exportar e importar copias.

## Tus datos

- Se guardan en `data/finanzas.json` (copias automáticas cada 30 minutos en `data/backups`).
- La carpeta `data/` (datos, usuarios y credenciales) está excluida de git: no la subas a ningún repositorio.
- Para ver el dashboard con vida sin tocar tus datos: Ajustes → "Cargar datos de ejemplo" (y luego "Quitar datos de ejemplo").

## En la web (Hostinger)

- https://financiero.diegotdesigner.com corre con PHP (`api.php`) y se despliega solo al hacer push a `main` (hPanel → Git). Se necesita `composer.json` para que Hostinger reconozca el proyecto.
- Los usuarios iniciales salen de `semilla-usuarios.json` (solo huellas); las contraseñas temporales están en `data/CREDENCIALES-SERVIDOR.txt` (no se sube a git). Cada persona crea la suya en el primer ingreso.
- Los datos del servidor viven en la carpeta `hogy-data` de tu cuenta de Hostinger (fuera de la carpeta web). Revisa que existe en el Administrador de archivos y haz copias con Ajustes → Exportar copia.
- Si alguien olvida su contraseña: en el Administrador de archivos borra `hogy-data/usuarios.json.php`; la app lo recrea con las contraseñas temporales originales y cada quien crea una nueva.
- La web y la copia local tienen datos separados: para pasar datos, Ajustes → Exportar copia (origen) e Importar copia (destino).
