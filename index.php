<?php
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

// Autoloader
spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/src/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }
    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';
    if (file_exists($file)) {
        require $file;
    }
});

use App\Controller\ApiController;

// Simple router by action param
$action = $_REQUEST['action'] ?? null;

if ($action) {
    $controller = new ApiController();
    $controller->handle($action);
} else {
    // Serve SPA
    require __DIR__ . '/templates/app.php';
}
