<?php
// Hogy Financiero · servidor para hosting compartido (PHP). Mismas rutas y reglas que server.js (Node):
//   POST api/login · POST api/logout · GET api/sesion · POST api/clave · GET/PUT api/data
// .htaccess redirige api/<ruta> a este archivo. Requiere PHP 7.4 o superior.
//
// Dónde viven los datos: si el sitio está en Hostinger (/home/uXXXX/domains/...), en /home/uXXXX/hogy-data, FUERA de la carpeta web.
// Si no se puede, en ./data. Además todos los archivos de datos son ".php" con una primera línea que corta la ejecución:
// aunque alguien los pidiera por la web, no se lee nada.

ini_set('display_errors', '0');
error_reporting(0);

const MAX_BODY = 8 * 1024 * 1024;
const BACKUP_CADA = 30 * 60;
const BACKUP_GUARDAR = 40;
const MAX_FALLOS = 5;
const BLOQUEO = 600;
const SESION_CORTA = 12 * 3600;
const SESION_LARGA = 30 * 86400;
const PBKDF2_ITER = 210000;
const COOKIE = 'finanzas_sid';
const CABEZA = "<?php http_response_code(404); exit; ?>\n";

// ---------------------------------------------------------------- salida
function salir_json(int $codigo, $obj, array $cabeceras = []): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($cabeceras as $c) header($c, false);
    echo is_string($obj) ? $obj : json_encode($obj, JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------------------------------------------------------------- carpeta de datos
function carpeta_datos(): string {
    static $dir = null;
    if ($dir !== null) return $dir;
    $candidatas = [];
    if (getenv('HOGY_DATA')) $candidatas[] = getenv('HOGY_DATA');
    $pos = strpos(__DIR__, '/domains/');
    if ($pos !== false) $candidatas[] = substr(__DIR__, 0, $pos) . '/hogy-data'; // en Hostinger: la carpeta personal, fuera de la web
    $candidatas[] = __DIR__ . '/data';
    foreach ($candidatas as $c) {
        if (is_dir($c) || @mkdir($c, 0750, true)) {
            if (is_writable($c)) { $dir = $c; break; }
        }
    }
    if ($dir === null) salir_json(500, ['error' => 'No hay una carpeta de datos con permiso de escritura.']);
    if (!is_file("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    if (!is_file("$dir/index.html")) @file_put_contents("$dir/index.html", '');
    if (!is_dir("$dir/backups")) @mkdir("$dir/backups", 0750, true);
    return $dir;
}

function leer_php(string $ruta): ?string {
    if (!is_file($ruta)) return null;
    $t = file_get_contents($ruta);
    if ($t === false) return null;
    $i = strpos($t, "\n");
    return $i === false ? '' : substr($t, $i + 1);
}
function escribir_php(string $ruta, string $texto): void {
    $tmp = $ruta . '.tmp';
    if (file_put_contents($tmp, CABEZA . $texto, LOCK_EX) === false) salir_json(500, ['error' => 'No se pudo guardar.']);
    if (!@rename($tmp, $ruta)) { @copy($tmp, $ruta); @unlink($tmp); }
}

// ---------------------------------------------------------------- usuarios y sesión
function usuarios_db(): array {
    $ruta = carpeta_datos() . '/usuarios.json.php';
    if (!is_file($ruta)) {
        $semilla = getenv('HOGY_SEMILLA') ?: __DIR__ . '/semilla-usuarios.json';
        escribir_php($ruta, is_file($semilla) ? (string) file_get_contents($semilla) : '{"usuarios":[]}');
    }
    $db = json_decode((string) leer_php($ruta), true);
    return is_array($db) && isset($db['usuarios']) ? $db : ['usuarios' => []];
}
function guardar_usuarios(array $db): void { escribir_php(carpeta_datos() . '/usuarios.json.php', json_encode($db, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); }
function normal(string $u): string { return strtolower(trim($u)); }
function buscar_usuario(string $usuario): ?array {
    foreach (usuarios_db()['usuarios'] as $u) if ($u['usuario'] === normal($usuario)) return $u;
    return null;
}
function huella(string $clave, string $salt): string { return hash_pbkdf2('sha256', $clave, $salt, PBKDF2_ITER, 128, false); }
function verificar(string $usuario, string $clave): ?array {
    $u = buscar_usuario($usuario);
    $ok = false;
    if ($u && ($u['alg'] ?? '') === 'pbkdf2') $ok = hash_equals($u['hash'], huella($clave, $u['salt']));
    else huella($clave, str_repeat('0', 32)); // mismo trabajo exista o no el usuario
    return $ok ? $u : null;
}
function publico(array $u): array { return ['usuario' => $u['usuario'], 'nombre' => $u['nombre'], 'debeCambiar' => !empty($u['debeCambiar'])]; }

function secreto(): string {
    $ruta = carpeta_datos() . '/secreto.key.php';
    $s = leer_php($ruta);
    if ($s === null || strlen(trim($s)) < 32) { $s = bin2hex(random_bytes(32)); escribir_php($ruta, $s); }
    return trim($s);
}
function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/')); }
function firmar(string $carga): string { return b64u(hash_hmac('sha256', $carga, secreto(), true)); }
function es_https(): bool { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'); }
function cookie_sesion(array $u, bool $recordar): string {
    $max = $recordar ? SESION_LARGA : SESION_CORTA;
    $carga = b64u(json_encode(['u' => $u['usuario'], 'e' => time() + $max, 'v' => substr($u['hash'], 0, 12)]));
    return 'Set-Cookie: ' . COOKIE . '=' . $carga . '.' . firmar($carga) . "; Max-Age=$max; Path=/; HttpOnly; SameSite=Strict" . (es_https() ? '; Secure' : '');
}
function cookie_salida(): string { return 'Set-Cookie: ' . COOKIE . '=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict' . (es_https() ? '; Secure' : ''); }
function usuario_actual(): ?array {
    $c = $_COOKIE[COOKIE] ?? '';
    if (!is_string($c) || strpos($c, '.') === false) return null;
    [$carga, $f] = explode('.', $c, 2);
    if (!hash_equals(firmar($carga), $f)) return null;
    $d = json_decode(b64u_dec($carga), true);
    if (!is_array($d) || ($d['e'] ?? 0) < time()) return null;
    $u = buscar_usuario((string) ($d['u'] ?? ''));
    return $u && substr($u['hash'], 0, 12) === ($d['v'] ?? '') ? $u : null; // si cambió la contraseña, las sesiones viejas dejan de servir
}

// ---------------------------------------------------------------- bloqueo por intentos fallidos
function con_intentos(callable $f) {
    $lock = fopen(carpeta_datos() . '/intentos.lock', 'c');
    flock($lock, LOCK_EX);
    $ruta = carpeta_datos() . '/intentos.json.php';
    $m = json_decode((string) leer_php($ruta), true);
    $m = is_array($m) ? $m : [];
    $r = $f($m);
    escribir_php($ruta, json_encode($m));
    flock($lock, LOCK_UN);
    fclose($lock);
    return $r;
}
function minutos_bloqueado(string $llave): int {
    return con_intentos(function (&$m) use ($llave) {
        $l = array_values(array_filter($m[$llave] ?? [], function ($t) { return time() - $t < BLOQUEO; }));
        $m[$llave] = $l;
        if (count($l) < MAX_FALLOS) return 0;
        return max(1, (int) ceil((BLOQUEO - (time() - $l[0])) / 60));
    });
}
function registrar_fallo(string $llave): void { con_intentos(function (&$m) use ($llave) { $m[$llave][] = time(); }); }
function limpiar_fallos(string $llave): void { con_intentos(function (&$m) use ($llave) { unset($m[$llave]); }); }

// ---------------------------------------------------------------- datos
function ruta_datos(): string { return carpeta_datos() . '/finanzas.json.php'; }
function respaldar_si_toca(): void {
    $dir = carpeta_datos() . '/backups';
    $archivos = glob("$dir/finanzas-*.json.php") ?: [];
    sort($archivos);
    $ultimo = end($archivos);
    if ($ultimo && time() - filemtime($ultimo) < BACKUP_CADA) return;
    if (is_file(ruta_datos())) @copy(ruta_datos(), "$dir/finanzas-" . date('Ymd-His') . '.json.php');
    $archivos = glob("$dir/finanzas-*.json.php") ?: [];
    sort($archivos);
    foreach (array_slice($archivos, 0, max(0, count($archivos) - BACKUP_GUARDAR)) as $viejo) @unlink($viejo);
}

// ---------------------------------------------------------------- petición
$ruta = $_GET['ruta'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'finanzas') salir_json(403, ['error' => 'Falta cabecera']);
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origen !== '' && strcasecmp((string) parse_url($origen, PHP_URL_HOST), (string) parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) !== 0) {
    salir_json(403, ['error' => 'Origen no permitido']);
}

function cuerpo_json(int $max): array {
    $t = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($t === false || strlen($t) > $max) salir_json(400, ['error' => 'Cuerpo demasiado grande']);
    $d = json_decode($t, true);
    return is_array($d) ? $d : [];
}

try {
    // Comprobación de salud: solo dice si el servidor puede guardar y leer (sin datos ni rutas).
    if ($ruta === 'salud' && $metodo === 'GET') {
        $dir = carpeta_datos();
        $prueba = $dir . '/salud.json.php';
        escribir_php($prueba, '{"ok":true}');
        $guarda = leer_php($prueba) === '{"ok":true}';
        @unlink($prueba);
        $web = realpath(__DIR__) ?: __DIR__;
        $real = realpath($dir) ?: $dir;
        salir_json(200, [
            'ok' => $guarda,
            'datosFueraDeLaWeb' => strpos($real, $web) !== 0,
            'semilla' => is_file(__DIR__ . '/semilla-usuarios.json'),
            'catalogoBase' => is_file(__DIR__ . '/seed.json'),
            'usuarios' => count(usuarios_db()['usuarios']),
            'https' => es_https(),
        ]);
    }
    if ($ruta === 'login' && $metodo === 'POST') {
        $d = cuerpo_json(4096);
        $usuario = (string) ($d['usuario'] ?? '');
        $clave = (string) ($d['clave'] ?? '');
        $llave = ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . normal($usuario);
        $espera = minutos_bloqueado($llave);
        if ($espera) salir_json(429, ['error' => "Demasiados intentos. Espera $espera minuto" . ($espera === 1 ? '' : 's') . ' e inténtalo de nuevo.']);
        $u = verificar($usuario, $clave);
        if (!$u) { registrar_fallo($llave); salir_json(401, ['error' => 'Usuario o contraseña incorrectos.']); }
        limpiar_fallos($llave);
        salir_json(200, ['ok' => true, 'usuario' => publico($u)], [cookie_sesion($u, !empty($d['recordar']))]);
    }
    if ($ruta === 'logout' && $metodo === 'POST') salir_json(200, ['ok' => true], [cookie_salida()]);

    $u = usuario_actual();
    if ($ruta === 'sesion' && $metodo === 'GET') $u ? salir_json(200, ['usuario' => publico($u)]) : salir_json(401, ['error' => 'Sin sesión']);
    if (!$u) salir_json(401, ['error' => 'Inicia sesión para continuar.']);

    if ($ruta === 'clave' && $metodo === 'POST') {
        $d = cuerpo_json(4096);
        $actual = (string) ($d['actual'] ?? '');
        $nueva = $d['nueva'] ?? null;
        if (!verificar($u['usuario'], $actual)) salir_json(400, ['error' => 'La contraseña actual no es correcta.']);
        if (!is_string($nueva) || strlen($nueva) < 8 || strlen($nueva) > 128) salir_json(400, ['error' => 'La nueva contraseña debe tener entre 8 y 128 caracteres.']);
        if ($nueva === $actual) salir_json(400, ['error' => 'La nueva contraseña debe ser distinta de la actual.']);
        $db = usuarios_db();
        foreach ($db['usuarios'] as &$x) {
            if ($x['usuario'] === $u['usuario']) {
                $x['alg'] = 'pbkdf2';
                $x['salt'] = bin2hex(random_bytes(16));
                $x['hash'] = huella($nueva, $x['salt']);
                $x['debeCambiar'] = false;
                $u = $x;
            }
        }
        unset($x);
        guardar_usuarios($db);
        salir_json(200, ['ok' => true], [cookie_sesion($u, false)]);
    }

    if ($ruta === 'data') {
        if (!empty($u['debeCambiar'])) salir_json(403, ['error' => 'Primero cambia tu contraseña.']);
        if ($metodo === 'GET') {
            $t = leer_php(ruta_datos());
            if ($t === null) { // primera vez: se arranca con el catálogo base
                $semilla = __DIR__ . '/seed.json';
                $t = is_file($semilla) ? (string) file_get_contents($semilla) : '{"version":1,"movimientos":[]}';
                escribir_php(ruta_datos(), $t);
            }
            salir_json(200, $t);
        }
        if ($metodo === 'PUT') {
            $t = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
            if ($t === false || strlen($t) > MAX_BODY) salir_json(400, ['error' => 'Cuerpo demasiado grande']);
            $d = json_decode($t, true);
            if (!is_array($d) || !isset($d['movimientos']) || !is_array($d['movimientos'])) salir_json(400, ['error' => 'Estructura de datos inválida']);
            respaldar_si_toca();
            escribir_php(ruta_datos(), $t);
            salir_json(200, ['ok' => true]);
        }
        salir_json(405, ['error' => 'Método no permitido']);
    }
    salir_json(404, ['error' => 'No encontrado']);
} catch (Throwable $e) {
    salir_json(500, ['error' => 'Error del servidor.']);
}
