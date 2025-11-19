<?php
// gpt_payment_api/admin/rates.php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
if (!is_logged_in()) {
    header('Location: index.php?page=login');
    exit;
}

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../logger.php';

$db = new DB();
$ratesData = $db->read('exchange_rates');
$feedback_message = '';
$feedback_type = ''; // 'success' или 'error'

// Валюта по умолчанию для баланса (например, RUB)
// Это должно быть определено в конфигурации, но для примера здесь
define('BALANCE_CURRENCY', 'RUB'); // Предположим, что баланс ведется в рублях

// Обработка добавления/обновления курса
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['set_rate'])) {
    $currency_from = strtoupper(trim(filter_input(INPUT_POST, 'currency_from', FILTER_SANITIZE_STRING)));
    $rate_value = filter_input(INPUT_POST, 'rate_value', FILTER_VALIDATE_FLOAT);

    if (empty($currency_from) || strlen($currency_from) !== 3) {
        $feedback_message = "Код валюты должен состоять из 3 букв (например, USD).";
        $feedback_type = 'error';
    } elseif ($rate_value === false || $rate_value <= 0) {
        $feedback_message = "Курс должен быть положительным числом.";
        $feedback_type = 'error';
    } elseif ($currency_from === BALANCE_CURRENCY) {
        $feedback_message = "Нельзя установить курс для базовой валюты баланса (" . BALANCE_CURRENCY . ").";
        $feedback_type = 'error';
    }
    else {
        $currency_pair = $currency_from . '_' . BALANCE_CURRENCY;
        $ratesData[$currency_pair] = [
            'rate' => (float)$rate_value,
            'last_updated' => date('Y-m-d H:i:s')
        ];
        if ($db->write('exchange_rates', $ratesData)) {
            $feedback_message = "Курс для {$currency_from} к " . BALANCE_CURRENCY . " успешно установлен: {$rate_value}.";
            $feedback_type = 'success';
            logMessage("[GPT_ADMIN_RATES] Rate set for {$currency_pair}: {$rate_value}");
        } else {
            $feedback_message = "Ошибка при сохранении курса.";
            $feedback_type = 'error';
            logMessage("[GPT_ADMIN_RATES] Error saving rate for {$currency_pair}");
        }
    }
}

// Обработка удаления курса
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_rate'])) {
    $currency_pair_to_delete = $_POST['currency_pair_to_delete'];
    if (isset($ratesData[$currency_pair_to_delete])) {
        unset($ratesData[$currency_pair_to_delete]);
        if ($db->write('exchange_rates', $ratesData)) {
            $feedback_message = "Курс для {$currency_pair_to_delete} успешно удален.";
            $feedback_type = 'success';
            logMessage("[GPT_ADMIN_RATES] Rate deleted: {$currency_pair_to_delete}");
        } else {
            $feedback_message = "Ошибка при удалении курса.";
            $feedback_type = 'error';
        }
    } else {
        $feedback_message = "Курс для удаления не найден.";
        $feedback_type = 'error';
    }
}


// Загружаем шаблон для управления курсами
include __DIR__ . '/templates/manage_rates.php';
?>
