<?php

namespace App;

class Auth {
    private const COOKIE_NAME = 'er_auth';
    private const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

    public static function role(): ?string {
        $token = $_COOKIE[self::COOKIE_NAME] ?? '';
        if (!is_string($token) || $token === '') {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }

        [$payloadB64, $sigB64] = $parts;
        $payloadJson = self::b64urlDecode($payloadB64);
        $sig = self::b64urlDecode($sigB64);
        if ($payloadJson === null || $sig === null) {
            return null;
        }

        $secret = getenv('AUTH_SECRET') ?: '';
        if ($secret === '') {
            // If no secret is set, refuse to trust the cookie
            return null;
        }

        $expectedSig = hash_hmac('sha256', $payloadJson, $secret, true);
        if (!hash_equals($expectedSig, $sig)) {
            return null;
        }

        $payload = json_decode($payloadJson, true);
        if (!is_array($payload)) {
            return null;
        }

        $role = $payload['role'] ?? null;
        $exp = $payload['exp'] ?? null;
        if (!is_string($role) || !in_array($role, ['admin', 'head', 'teacher'], true)) {
            return null;
        }
        if (!is_int($exp)) {
            return null;
        }
        if (time() > $exp) {
            return null;
        }

        return $role;
    }

    public static function login(string $password): ?string {
        $password = trim($password);
        if ($password === '') {
            return null;
        }

        $admin = getenv('ADMIN_PASSWORD') ?: '';
        $head = getenv('HEAD_OF_SUBJECT_PASSWORD') ?: '';
        $teacher = getenv('TEACHER_PASSWORD') ?: '';

        if ($admin !== '' && hash_equals($admin, $password)) {
            self::setRoleCookie('admin');
            return 'admin';
        }
        if ($head !== '' && hash_equals($head, $password)) {
            self::setRoleCookie('head');
            return 'head';
        }
        if ($teacher !== '' && hash_equals($teacher, $password)) {
            self::setRoleCookie('teacher');
            return 'teacher';
        }

        return null;
    }

    public static function logout(): void {
        self::clearCookie();
    }

    public static function requireRole(array $allowedRoles): void {
        $role = self::role();
        if ($role === null || !in_array($role, $allowedRoles, true)) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }
    }

    public static function requireLoggedIn(): void {
        if (self::role() === null) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }

    private static function setRoleCookie(string $role): void {
        $secret = getenv('AUTH_SECRET') ?: '';
        if ($secret === '') {
            // Misconfigured; do not set an unsigned cookie
            return;
        }

        $payload = json_encode([
            'role' => $role,
            'exp' => time() + self::COOKIE_TTL_SECONDS,
        ], JSON_UNESCAPED_SLASHES);

        $sig = hash_hmac('sha256', $payload, $secret, true);
        $token = self::b64urlEncode($payload) . '.' . self::b64urlEncode($sig);

        $secure = self::isHttps();
        setcookie(self::COOKIE_NAME, $token, [
            'expires' => time() + self::COOKIE_TTL_SECONDS,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private static function clearCookie(): void {
        $secure = self::isHttps();
        setcookie(self::COOKIE_NAME, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private static function isHttps(): bool {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
            return true;
        }
        return false;
    }

    private static function b64urlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64urlDecode(string $data): ?string {
        $pad = strlen($data) % 4;
        if ($pad !== 0) {
            $data .= str_repeat('=', 4 - $pad);
        }
        $decoded = base64_decode(strtr($data, '-_', '+/'), true);
        if ($decoded === false) {
            return null;
        }
        return $decoded;
    }
}
