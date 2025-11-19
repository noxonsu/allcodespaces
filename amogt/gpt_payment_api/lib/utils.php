<?php
// gpt_payment_api/lib/utils.php
require_once __DIR__ . '/../../logger.php';

class Utils {
    /**
     * Генерирует случайный API токен.
     * @param int $length Длина токена
     * @return string Сгенерированный токен
     */
    public static function generateApiToken(int $length = 32): string {
        try {
            // Генерируем достаточное количество случайных байт
            $randomBytes = random_bytes(ceil($length / 2));
            // Преобразуем байты в шестнадцатеричную строку
            $token = bin2hex($randomBytes);
            // Обрезаем до нужной длины
            return substr($token, 0, $length);
        } catch (Exception $e) {
            // В случае ошибки random_bytes (очень маловероятно на современных PHP)
            // используем менее криптографически стойкий метод
            logMessage("[GPT_UTILS] Error generating secure API token: " . $e->getMessage() . ". Falling back to less secure method.", "WARNING");
            $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            $charactersLength = strlen($characters);
            $randomString = '';
            for ($i = 0; $i < $length; $i++) {
                $randomString .= $characters[rand(0, $charactersLength - 1)];
            }
            return $randomString;
        }
    }
}
?>
