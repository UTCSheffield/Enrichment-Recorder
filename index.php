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
use App\Env;
use App\Auth;

// Load dotenv-style config for non-Docker/local usage (won't override real env vars)
Env::load(__DIR__ . '/.env', false);

// Simple router by action param
$action = $_REQUEST['action'] ?? null;

// Auth actions (handled here because they are not JSON API responses)
if ($action === 'auth_login') {
    $password = $_POST['password'] ?? '';
    $role = Auth::login((string)$password);
    if ($role === null) {
        $error = 'Incorrect password';
        require __DIR__ . '/templates/login.php';
        exit;
    }

    header('Location: /');
    exit;
}

if ($action === 'auth_logout') {
    Auth::logout();
    header('Location: /');
    exit;
}

$role = Auth::role();

if ($action) {
    // Block all API actions unless logged in
    if ($role === null) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $controller = new ApiController();
    $controller->handle($action);
} else {
    // Serve login gate / SPA
    if ($role === null) {
        $error = null;
        require __DIR__ . '/templates/login.php';
    } else {
        require __DIR__ . '/templates/app.php';
    }
}
