<?php
// gpt_payment_api/partner_portal/auth.php

if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../logger.php';
require_once __DIR__ . '/../lib/auth_partner.php';

function partner_attempt_login(string $token): bool {
    if (AuthPartner::isTokenValid($token)) {
        $partner = AuthPartner::getPartnerByToken($token);
        if ($partner) {
            $_SESSION['partner_logged_in'] = true;
            $_SESSION['partner_id'] = $partner['id'];
            $_SESSION['partner_name'] = $partner['name'];
            $_SESSION['partner_token'] = $token;
            logMessage("[PARTNER_PORTAL] Login successful for partner: {$partner['name']} (ID: {$partner['id']})");
            return true;
        }
    }
    logMessage("[PARTNER_PORTAL] Login failed for token: " . substr($token, 0, 8) . "...");
    return false;
}

function partner_is_logged_in(): bool {
    return isset($_SESSION['partner_logged_in']) && $_SESSION['partner_logged_in'] === true;
}

function partner_logout(): void {
    $partnerName = $_SESSION['partner_name'] ?? 'Unknown';
    logMessage("[PARTNER_PORTAL] Partner logged out: {$partnerName}");
    $_SESSION = array();
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();
}

function get_current_partner(): ?array {
    if (!partner_is_logged_in()) {
        return null;
    }
    
    $token = $_SESSION['partner_token'] ?? null;
    if ($token) {
        return AuthPartner::getPartnerByToken($token);
    }
    
    return null;
}

// Обработка POST запроса на логин
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['api_token'])) {
    $token = trim($_POST['api_token']);
    if (partner_attempt_login($token)) {
        header("Location: index.php?page=dashboard");
        exit;
    } else {
        $_SESSION['login_error'] = "Неверный API токен.";
    }
}

// Обработка logout
if ($_GET['action'] ?? '' === 'logout') {
    partner_logout();
    header("Location: index.php?page=login");
    exit;
}
?>
