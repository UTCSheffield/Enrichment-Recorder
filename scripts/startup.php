<?php
// Wait for MySQL before accepting web requests, then initialise only an empty database.
require __DIR__ . '/../src/Env.php';
App\Env::load(__DIR__ . '/../.env', false);
$deadline = time() + 120;
do {
    try {
        $connection = new PDO('mysql:host=' . getenv('DB_HOST') . ';dbname=' . getenv('DB_NAME'),
            getenv('DB_USER'), getenv('DB_PASS'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]);
        unset($connection);
        break;
    } catch (PDOException $error) {
        if (time() >= $deadline) {
            fwrite(STDERR, "Database startup failed: " . $error->getMessage() . "\n");
            exit(1);
        }
        sleep(2);
    }
} while (true);
$argv = [__DIR__ . '/migrate.php', '--initialize-if-empty'];
require __DIR__ . '/migrate.php';
