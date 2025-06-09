<?php
// gpt_payment_api/lib/auth_partner.php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/../../logger.php';

class AuthPartner {
    public static function isTokenValid(string $token): bool {
        if (empty($token)) {
            return false;
        }
        $db = new DB();
        $partners = $db->read('partners');
        foreach ($partners as $partner) {
            if (isset($partner['token']) && $partner['token'] === $token) {
                // logMessage("[GPT_AUTH_PARTNER] Token validated for partner: {$partner['name']}");
                return true;
            }
        }
        logMessage("[GPT_AUTH_PARTNER] Invalid token received: {$token}");
        return false;
    }

    public static function getPartnerByToken(string $token): ?array {
        if (empty($token)) {
            return null;
        }
        $db = new DB();
        $partners = $db->read('partners');
        foreach ($partners as $partner) {
            if (isset($partner['token']) && $partner['token'] === $token) {
                return $partner;
            }
        }
        return null;
    }
}
?>
