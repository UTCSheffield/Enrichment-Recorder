<?php

namespace App;

// Minimal .env loader (no composer dependency)
class Env {
    /**
     * Loads key=value pairs from a dotenv-style file.
     *
     * - Skips blank lines and comments (#)
     * - Supports quoted values: KEY="value" or KEY='value'
     * - By default does NOT override existing environment variables.
     */
    public static function load(string $filePath, bool $override = false): void {
        if (!is_file($filePath) || !is_readable($filePath)) {
            return;
        }

        $lines = file($filePath, FILE_IGNORE_NEW_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            $eqPos = strpos($line, '=');
            if ($eqPos === false) {
                continue;
            }

            $key = trim(substr($line, 0, $eqPos));
            $value = trim(substr($line, $eqPos + 1));

            if ($key === '') {
                continue;
            }

            // Strip optional surrounding quotes
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }

            $existing = getenv($key);
            if ($existing !== false && $existing !== '' && !$override) {
                continue;
            }

            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}
