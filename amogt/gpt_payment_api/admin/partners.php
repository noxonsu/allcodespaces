<?php
// gpt_payment_api/admin/partners.php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
if (!is_logged_in()) {
    header('Location: index.php?page=login');
    exit;
}

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/utils.php'; // Для generate_api_token
require_once __DIR__ . '/../../logger.php';

$db = new DB();
$partnersData = $db->read('partners');
$feedback_message = '';
$feedback_type = ''; // 'success' или 'error'

// Обработка добавления нового партнера
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_partner'])) {
    $partner_name = trim(filter_input(INPUT_POST, 'partner_name', FILTER_SANITIZE_STRING));
    $initial_balance = filter_input(INPUT_POST, 'initial_balance', FILTER_VALIDATE_FLOAT);

    if (empty($partner_name)) {
        $feedback_message = "Имя партнера не может быть пустым.";
        $feedback_type = 'error';
    } elseif ($initial_balance === false || $initial_balance < 0) {
        $feedback_message = "Начальный баланс должен быть положительным числом.";
        $feedback_type = 'error';
    } else {
        $existing_partner = array_filter($partnersData, function($p) use ($partner_name) {
            return strtolower($p['name']) === strtolower($partner_name);
        });

        if (!empty($existing_partner)) {
            $feedback_message = "Партнер с таким именем уже существует.";
            $feedback_type = 'error';
        } else {
            $new_token = Utils::generateApiToken();
            $new_partner = [
                'id' => uniqid('partner_'),
                'name' => $partner_name,
                'token' => $new_token,
                'balance' => (float)$initial_balance,
                'created_at' => date('Y-m-d H:i:s')
            ];
            $partnersData[] = $new_partner;
            if ($db->write('partners', $partnersData)) {
                $feedback_message = "Партнер '{$partner_name}' успешно добавлен. API токен: {$new_token}";
                $feedback_type = 'success';
                logMessage("[GPT_ADMIN_PARTNERS] Partner added: {$partner_name}, Token: {$new_token}");
            } else {
                $feedback_message = "Ошибка при сохранении партнера.";
                $feedback_type = 'error';
                logMessage("[GPT_ADMIN_PARTNERS] Error saving partner: {$partner_name}");
            }
        }
    }
}

// Обработка изменения баланса
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['update_balance'])) {
    $partner_id_to_update = $_POST['partner_id'];
    $new_balance = filter_input(INPUT_POST, 'new_balance', FILTER_VALIDATE_FLOAT);

    if ($new_balance === false || $new_balance < 0) {
        $feedback_message = "Новый баланс должен быть положительным числом.";
        $feedback_type = 'error';
    } else {
        $updated = false;
        foreach ($partnersData as &$partner) {
            if ($partner['id'] === $partner_id_to_update) {
                $old_balance = $partner['balance'];
                $partner['balance'] = (float)$new_balance;
                $updated = true;
                logMessage("[GPT_ADMIN_PARTNERS] Balance updated for partner ID {$partner_id_to_update}. Old: {$old_balance}, New: {$new_balance}");
                break;
            }
        }
        if ($updated && $db->write('partners', $partnersData)) {
            $feedback_message = "Баланс партнера успешно обновлен.";
            $feedback_type = 'success';
        } elseif ($updated) {
            $feedback_message = "Ошибка при сохранении обновленного баланса.";
            $feedback_type = 'error';
        } else {
            $feedback_message = "Партнер не найден.";
            $feedback_type = 'error';
        }
    }
}

// Обработка удаления партнера
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_partner'])) {
    $partner_id_to_delete = $_POST['partner_id_to_delete'];
    $partner_name_deleted = '';
    $partnersData = array_filter($partnersData, function($partner) use ($partner_id_to_delete, &$partner_name_deleted) {
        if ($partner['id'] === $partner_id_to_delete) {
            $partner_name_deleted = $partner['name'];
            return false; // Удалить элемент
        }
        return true; // Сохранить элемент
    });
    // Переиндексировать массив, чтобы избежать проблем с JSON
    $partnersData = array_values($partnersData);

    if (!empty($partner_name_deleted) && $db->write('partners', $partnersData)) {
        $feedback_message = "Партнер '{$partner_name_deleted}' успешно удален.";
        $feedback_type = 'success';
        logMessage("[GPT_ADMIN_PARTNERS] Partner deleted: {$partner_name_deleted} (ID: {$partner_id_to_delete})");
    } elseif (!empty($partner_name_deleted)) {
        $feedback_message = "Ошибка при удалении партнера.";
        $feedback_type = 'error';
    } else {
        $feedback_message = "Партнер для удаления не найден.";
        $feedback_type = 'error';
    }
}

// Загружаем шаблон для управления партнерами
include __DIR__ . '/templates/manage_partners.php';
?>
