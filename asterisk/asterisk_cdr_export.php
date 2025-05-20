<?php
// Включаем отображение ошибок для отладки (удалить на продакшене)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Установка временной зоны ПО УМОЛЧАНИЮ - КРИТИЧЕСКИ ВАЖНО!
// Замените 'Europe/Moscow' на вашу актуальную временную зону.
// Список: https://www.php.net/manual/en/timezones.php
if (!date_default_timezone_set('Europe/Moscow')) { // Пример, замените на свою зону, например 'Asia/Almaty'
    // custom_log("Failed to set default timezone."); // Assuming custom_log might not be available here yet
    error_log("Failed to set default timezone in asterisk_cdr_export.php");
}

// Конфигурация для извлечения CDR
@include("config.php"); // @ подавляет warning, если файла нет
// $amp_conf should be populated by config.php

// Папка для временного копирования файлов записей
$temp_files_dir = __DIR__ . '/files_temp_download';
$monitor_base_dir = '/var/spool/asterisk/monitor/'; // Путь к КОРНЕВОЙ папке записей

// Создаем временную папку, если не существует
if (!is_dir($temp_files_dir)) {
    if (!mkdir($temp_files_dir, 0755, true)) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
        echo json_encode(['_error' => 'Failed to create temporary directory: ' . $temp_files_dir, 'details' => error_get_last()], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}

// === КОНФИГУРАЦИЯ для обработки сессий ===
$operator_extension_patterns = ['/^1\d{2}$/'];
$queue_numbers = ['001'];
$orphan_link_time_delta = 30;

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ для обработки сессий ===
function extractMasterUniqueIdFromRecording($recordingFile) {
    if (empty($recordingFile)) return null;
    if (preg_match('/-(\d{10}\.\d{1,10})\.(wav|mp3|gsm|WAV|MP3|GSM)$/i', basename($recordingFile), $matches)) {
        return $matches[1];
    }
    return null;
}

function isOperatorDestination($dst, $patterns) {
    if (empty($dst) || empty($patterns)) return false;
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $dst)) return true;
    }
    return false;
}

function isQueueDestination($dst, $queue_numbers_array) {
    if (empty($dst) || empty($queue_numbers_array)) return false;
    return in_array($dst, $queue_numbers_array);
}


$action = 'get_cdr_stats';
if (isset($_GET['action'])) {
    $action = $_GET['action'];
}

// === ИСПРАВЛЕННАЯ ЛОГИКА ЗАГРУЗКИ ФАЙЛА ===
if ($action === 'download') {
    // checkSecretKey($expectedSecretKey); // Removed secret key check

    if (!isset($_GET['file']) || empty(trim($_GET['file'])) || !isset($_GET['cdate']) || empty(trim($_GET['cdate']))) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(400);
        echo json_encode(['_error' => "Параметры 'file' и 'cdate' обязательны для скачивания."], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    $filename_param = $_GET['file'];
    $recordingfile_basename = basename($filename_param);

    // Проверка, что basename не вернул пустое значение или "."/".."
    if (empty($recordingfile_basename) || $recordingfile_basename === '.' || $recordingfile_basename === '..') {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(400);
        echo json_encode(['_error' => "Недопустимое имя файла: " . htmlspecialchars($filename_param)], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
    
    $call_date_str_for_path = $_GET['cdate'];

    // Validate date format
    if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', $call_date_str_for_path)) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(400);
        echo json_encode([
            '_error' => "Неверный формат даты. Ожидается YYYY-MM-DD или YYYY-MM-DD HH:MM:SS", 
            'received_date' => htmlspecialchars($call_date_str_for_path)
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    try {
        $date_obj = new DateTime($call_date_str_for_path);
        // Проверка на валидность даты (например, 2023-02-31 не валидна)
        if ($date_obj->format('Y-m-d H:i:s') === false) {
            throw new Exception("Invalid date value");
        }
        $year = $date_obj->format('Y');
        $month = $date_obj->format('m');
        $day = $date_obj->format('d');
        
        // Используем $recordingfile_basename НАПРЯМУЮ. Он уже содержит '+' если он был в URL.
        // Строка с preg_replace, удалявшая '+', убрана.
        $source_file_full_path = rtrim($monitor_base_dir, '/') . '/' . $year . '/' . $month . '/' . $day . '/' . $recordingfile_basename;

    } catch (Exception $e) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(400);
        echo json_encode(['_error' => "Ошибка обработки даты для пути файла: " . $e->getMessage(), 'received_cdate' => htmlspecialchars($call_date_str_for_path)], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    // Для временного файла также используем $recordingfile_basename
    $dest_file = rtrim($temp_files_dir, '/') . '/' . $recordingfile_basename;

    if (file_exists($source_file_full_path)) {
        $real_source_path = realpath($source_file_full_path);
        $real_monitor_base_dir = realpath(rtrim($monitor_base_dir, '/'));

        // Дополнительная проверка безопасности: убедиться, что файл находится в разрешенной директории
        if (!$real_source_path || !$real_monitor_base_dir || strpos($real_source_path, $real_monitor_base_dir) !== 0) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(403); // Forbidden
            echo json_encode(['_error' => "Попытка доступа за пределы разрешенной папки записей."], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            exit;
        }

        if (copy($source_file_full_path, $dest_file)) {
            header('Content-Description: File Transfer');
            $fileExtension = strtolower(pathinfo($recordingfile_basename, PATHINFO_EXTENSION));
            $contentType = 'application/octet-stream';
            switch ($fileExtension) {
                case 'wav': $contentType = 'audio/wav'; break;
                case 'mp3': $contentType = 'audio/mpeg'; break;
                case 'ogg': $contentType = 'audio/ogg'; break;
            }
            header('Content-Type: ' . $contentType);
            header('Content-Disposition: attachment; filename="' . $recordingfile_basename . '"'); // Имя файла для сохранения у клиента будет с '+'
            header('Expires: 0');
            header('Cache-Control: must-revalidate');
            header('Pragma: public');
            
            clearstatcache(true, $dest_file); // Очищаем кэш состояния файла перед filesize

            if (file_exists($dest_file)) {
                 header('Content-Length: ' . filesize($dest_file));
            } else {
                header('Content-Type: application/json; charset=utf-8');
                http_response_code(500);
                echo json_encode(['_error' => "Временный файл создан, но затем исчез: " . htmlspecialchars($dest_file)], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
                exit;
            }
            
            ob_clean();
            flush();
            $readfile_success = readfile($dest_file);
            
            if ($readfile_success === false) {
                custom_log("Ошибка чтения файла для отправки: " . $dest_file);
                // Заголовки уже могли быть отправлены, так что просто логируем
            }
            
            // @unlink($dest_file); // Раскомментировать для удаления после скачивания
            exit;
        } else {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
            $last_error = error_get_last();
            $error_message = "Ошибка копирования файла: '" . htmlspecialchars($recordingfile_basename) . "' из '" . htmlspecialchars($source_file_full_path) . "' в '" . htmlspecialchars($dest_file) . "'.";
            if ($last_error) $error_message .= " Details: " . $last_error['message'];
            echo json_encode(['_error' => $error_message], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            exit;
        }
    } else {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(404);
        echo json_encode([
            '_error' => "Файл записи не найден: " . htmlspecialchars($source_file_full_path),
            'debug_info' => [
                'param_file_received' => isset($_GET['file']) ? htmlspecialchars($_GET['file']) : 'not_set',
                'basename_extracted' => htmlspecialchars($recordingfile_basename),
                'constructed_full_path' => htmlspecialchars($source_file_full_path)
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}
// === КОНЕЦ ЛОГИКИ ЗАГРУЗКИ ФАЙЛА ===


// === ЛОГИКА ИЗВЛЕЧЕНИЯ И ОБРАБОТКИ CDR (если action=get_cdr_stats или не указан) ===
if ($action === 'get_cdr_stats') {
    // checkSecretKey($expectedSecretKey); // Removed secret key check

    $pdo = null;
    try {
        if (!isset($amp_conf['AMPDBHOST']) || !isset($amp_conf['AMPDBNAME']) || !isset($amp_conf['AMPDBUSER']) || !isset($amp_conf['AMPDBPASS'])) {
            throw new Exception("Одна или несколько переменных конфигурации БД не определены в config.php.");
        }
        $dsn = "mysql:host={$amp_conf['AMPDBHOST']};dbname={$amp_conf['AMPDBNAME']};charset=utf8";
        $pdo = new PDO($dsn, $amp_conf['AMPDBUSER'], $amp_conf['AMPDBPASS']);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    } catch (Exception $e) { 
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
        echo json_encode(['_error_db_connection' => "Ошибка подключения к БД или конфигурации: " . $e->getMessage()], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    $calls_raw = [];
    $grouped_calls_by_original_uid = [];

    try {
        $params = [];
        $where_clauses = [];

        if (isset($_GET['date_from']) && !empty($_GET['date_from'])) {
            try {
                $date_from_obj = new DateTime($_GET['date_from']);
                $where_clauses[] = "calldate >= :date_from";
                $params[':date_from'] = $date_from_obj->format('Y-m-d 00:00:00');
            } catch (Exception $e) { /* Игнорируем неверный формат даты или логируем */ }
        }
        if (isset($_GET['date_to']) && !empty($_GET['date_to'])) {
             try {
                $date_to_obj = new DateTime($_GET['date_to']);
                $date_to_format = (strpos($_GET['date_to'], ':') === false) ? 'Y-m-d 23:59:59' : 'Y-m-d H:i:s';
                $where_clauses[] = "calldate <= :date_to";
                $params[':date_to'] = $date_to_obj->format($date_to_format);
             } catch (Exception $e) { /* Игнорируем или логируем */ }
        }
        if (isset($_GET['uniqueid']) && !empty($_GET['uniqueid'])) {
             $where_clauses[] = "uniqueid = :uniqueid";
             $params[':uniqueid'] = $_GET['uniqueid'];
        }
        if (isset($_GET['disposition']) && !empty($_GET['disposition'])) {
            $allowed_dispositions_list = explode(',', $_GET['disposition']);
            $disposition_placeholders = [];
            foreach ($allowed_dispositions_list as $idx => $disp_val) {
                $ph = ":disp" . $idx;
                $disposition_placeholders[] = $ph;
                $params[$ph] = trim($disp_val);
            }
            if (!empty($disposition_placeholders)) {
                 $where_clauses[] = "disposition IN (" . implode(", ", $disposition_placeholders) . ")";
            }
        }
        
        $query = "SELECT uniqueid, calldate, clid, src, dst, duration, billsec, disposition, recordingfile, channel, dstchannel, accountcode, userfield 
                  FROM cdr ";

        if (!empty($where_clauses)) {
            $query .= " WHERE " . implode(" AND ", $where_clauses);
        }
        $query .= " ORDER BY calldate DESC, uniqueid DESC ";

        // Revised LIMIT logic:
        // Default limit value
        $limit_value = 200; 

        if (isset($_GET['limit_period']) && is_numeric($_GET['limit_period']) && (int)$_GET['limit_period'] > 0) {
            // If limit_period is specified and valid, use it
            $limit_value = (int)$_GET['limit_period'];
        } elseif (isset($_GET['limit']) && is_numeric($_GET['limit']) && (int)$_GET['limit'] > 0 &&
                  !(isset($_GET['date_from']) && !empty($_GET['date_from'])) && 
                  !(isset($_GET['date_to']) && !empty($_GET['date_to']))) {
            // If 'limit' is specified, valid, AND no date filters are active, use 'limit'.
            // This preserves the original behavior where 'limit' is only used without date filters
            // if 'limit_period' isn't overriding.
            $limit_value = (int)$_GET['limit'];
        }
        // Otherwise, the default $limit_value (200) will be used,
        // including cases where date filters are active but limit_period is not set.

        // Always apply the determined limit
        $query .= " LIMIT " . $limit_value;

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $calls_raw = $stmt->fetchAll();

        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
        $host = $_SERVER['HTTP_HOST'];
        $script_path_dir = dirname($_SERVER['PHP_SELF']);
        // Корректное формирование базового URL скрипта
        $path_part = ($script_path_dir === '/' || $script_path_dir === '\\' || $script_path_dir === '.') ? '' : str_replace('\\', '/', $script_path_dir);
        $script_base_url = rtrim($protocol . $host . $path_part, '/') . '/' . basename(__FILE__);


        foreach ($calls_raw as $call) {
            $uniqueid_original = $call['uniqueid'];
            $caller_name_str = '';
            $caller_num_str = '';
            $current_clid = isset($call['clid']) ? (string)$call['clid'] : '';
            if (!empty($current_clid)) {
                $temp_caller_name = preg_replace('/ <\s*\S+\s*>$/', '', $current_clid);
                $caller_name_str = ($temp_caller_name !== null) ? $temp_caller_name : $current_clid;
                $matches_num = [];
                if (preg_match('/<([^>]+)>/', $current_clid, $matches_num) === 1 && isset($matches_num[1])) {
                    $caller_num_str = $matches_num[1];
                } else {
                    $cleaned_clid_for_num = str_replace(['"', "'", ' ', '<', '>'], '', $current_clid);
                    if (is_numeric($cleaned_clid_for_num)) $caller_num_str = $cleaned_clid_for_num;
                    else $caller_num_str = isset($call['src']) ? (string)$call['src'] : '';
                    if(is_numeric(str_replace(['"', "'", ' ', '<', '>'], '', $caller_name_str)) && empty($matches_num[1])){
                         $caller_num_str = $caller_name_str;
                         $caller_name_str = '';
                    }
                }
            } else {
                $caller_num_str = isset($call['src']) ? (string)$call['src'] : '';
            }

            $download_url = null;
            $recording_filename_only = basename($call['recordingfile']);
            if (!empty($recording_filename_only) && !empty($call['calldate'])) {
                 try {
                    $date_obj_for_url = new DateTime($call['calldate']);
                    $calldate_for_url = $date_obj_for_url->format('Y-m-d H:i:s');
                    // В $recording_filename_only уже может быть '+', urlencode его правильно закодирует в %2B
                    $download_url = $script_base_url . '?action=download&file=' . urlencode($recording_filename_only) . '&cdate=' . urlencode($calldate_for_url);
                 } catch (Exception $e_date_url) { /* $download_url останется null */ }
            }

            $call_leg_data = [
                'uniqueid' => $call['uniqueid'],
                'calldate' => $call['calldate'],
                'callerid_name' => trim($caller_name_str),
                'callerid_num' => trim($caller_num_str),
                'source' => $call['src'],
                'destination' => $call['dst'],
                'duration_total_sec' => (int)$call['duration'],
                'duration_billed_sec' => (int)$call['billsec'],
                'status' => $call['disposition'],
                'recording_filename' => $recording_filename_only,
                'download_url' => $download_url,
                'channel' => isset($call['channel']) ? $call['channel'] : null,
                'dstchannel' => isset($call['dstchannel']) ? $call['dstchannel'] : null,
                'accountcode' => isset($call['accountcode']) ? $call['accountcode'] : null,
                'userfield' => isset($call['userfield']) ? $call['userfield'] : null,
            ];
            $grouped_calls_by_original_uid[$uniqueid_original][] = $call_leg_data;
        }
        
        $logical_sessions = []; 
        $orphaned_legs = [];
        $all_legs_with_session_candidates = [];

        foreach ($grouped_calls_by_original_uid as $original_uid_key => $legs_for_uid_val) {
            foreach ($legs_for_uid_val as $leg_item) {
                $leg_item['_original_uniqueid'] = $original_uid_key;
                $master_id_from_rec_val = extractMasterUniqueIdFromRecording($leg_item['recording_filename']);
                $leg_item['_master_id_from_rec'] = $master_id_from_rec_val;
                $leg_item['_is_queue_dest'] = isQueueDestination($leg_item['destination'], $queue_numbers);
                $leg_item['_is_operator_dest'] = isOperatorDestination($leg_item['destination'], $operator_extension_patterns);
                $session_key_candidate_val = null;
                if ($master_id_from_rec_val) {
                    $session_key_candidate_val = $master_id_from_rec_val;
                } elseif ($leg_item['_is_queue_dest']) {
                    $self_master_from_rec_val = extractMasterUniqueIdFromRecording($leg_item['recording_filename']);
                    if ($self_master_from_rec_val === $leg_item['uniqueid']) {
                        $session_key_candidate_val = $leg_item['uniqueid'];
                    } else if ($self_master_from_rec_val) {
                        $session_key_candidate_val = $self_master_from_rec_val;
                    } else {
                        $session_key_candidate_val = $leg_item['uniqueid'];
                    }
                }
                $leg_item['_session_key_candidate'] = $session_key_candidate_val;
                $all_legs_with_session_candidates[] = $leg_item;
            }
        }

        $pre_sessions = [];
        foreach ($all_legs_with_session_candidates as $leg_item_val) {
            if ($leg_item_val['_session_key_candidate']) {
                $pre_sessions[$leg_item_val['_session_key_candidate']][] = $leg_item_val;
            } else {
                $orphaned_legs[] = $leg_item_val;
            }
        }

        // Change this uasort from ascending to descending (newer dates first)
        uasort($pre_sessions, function ($a_val, $b_val) {
            $timeA_val = PHP_INT_MAX; $timeB_val = PHP_INT_MAX;
            if (!empty($a_val)) $timeA_val = strtotime($a_val[0]['calldate']);
            if (!empty($b_val)) $timeB_val = strtotime($b_val[0]['calldate']);
            return $timeB_val - $timeA_val; // Changed from $timeA_val - $timeB_val for descending order
        });

        // Change this usort from ascending to descending (newer dates first)
        usort($orphaned_legs, function ($a_val, $b_val) {
            return strtotime($b_val['calldate']) - strtotime($a_val['calldate']); // Changed for descending order
        });

        foreach ($orphaned_legs as $orphan_idx_val => $orphan_leg_val) {
            if (!$orphan_leg_val['_is_operator_dest']) continue;
            $orphan_time_val = strtotime($orphan_leg_val['calldate']);
            $best_match_session_key_val = null;
            $smallest_time_diff_val = PHP_INT_MAX;
            foreach ($pre_sessions as $session_key_val => $session_legs_val) {
                if (empty($session_legs_val)) continue;
                $session_anchor_leg_val = null;
                foreach ($session_legs_val as $s_leg_val) {
                    if ($s_leg_val['_is_queue_dest']) {
                        $session_anchor_leg_val = $s_leg_val; break;
                    }
                }
                if (!$session_anchor_leg_val) {
                   usort($session_legs_val, function($c_val, $d_val) { return strtotime($c_val['calldate']) - strtotime($d_val['calldate']); });
                   $pre_sessions[$session_key_val] = $session_legs_val; // Обновляем отсортированный массив
                   $session_anchor_leg_val = $session_legs_val[0];
                }
                $session_start_compare_time_val = strtotime($session_anchor_leg_val['calldate']);
                if ($orphan_leg_val['source'] == $session_anchor_leg_val['source']) {
                    $time_diff_val = $orphan_time_val - $session_start_compare_time_val;
                    if ($time_diff_val >= -5 && $time_diff_val <= $orphan_link_time_delta) {
                        if ($time_diff_val < $smallest_time_diff_val) {
                            $smallest_time_diff_val = $time_diff_val;
                            $best_match_session_key_val = $session_key_val;
                        }
                    }
                }
            }
            if ($best_match_session_key_val) {
                $pre_sessions[$best_match_session_key_val][] = $orphan_leg_val;
                unset($orphaned_legs[$orphan_idx_val]);
            }
        }

        $final_sessions_output = [];
        foreach ($pre_sessions as $session_master_id_val => $legs_in_session_val) {
            if (empty($legs_in_session_val)) continue;
            usort($legs_in_session_val, function ($a_s, $b_s) {
                $time_a_s = strtotime($a_s['calldate']); $time_b_s = strtotime($b_s['calldate']);
                return ($time_a_s < $time_b_s) ? -1 : (($time_a_s > $time_b_s) ? 1 : 0);
            });

            $session_data = [
                'session_master_id' => $session_master_id_val,
                'caller_number' => $legs_in_session_val[0]['callerid_num'],
                'caller_name' => $legs_in_session_val[0]['callerid_name'],
                'source_number' => $legs_in_session_val[0]['source'],
                'call_start_time' => $legs_in_session_val[0]['calldate'],
                'call_end_time' => $legs_in_session_val[0]['calldate'], // будет обновлено
                'overall_status' => 'UNKNOWN', // будет обновлено
                'answered_by_operator' => null, // будет обновлено
                'wait_time_sec' => null, // Added for wait time calculation
                'billed_duration_sec' => 0, // будет обновлено
                'total_duration_sec_overall' => 0, // будет обновлено
                'recording_file' => null, // будет обновлено
                'download_url' => null, // будет обновлено
                'operator_attempts' => [],
                'queue_legs_info' => [],
                'other_legs_info' => [],
                '_all_legs_in_session' => [] // для отладки
            ];
            
            $max_end_timestamp_val = 0;
            $answered_operator_leg_val = null;

            foreach ($legs_in_session_val as $leg_val_item) {
                $session_data['_all_legs_in_session'][] = $leg_val_item; // Сохраняем все плечи для анализа
                $leg_end_timestamp_val = strtotime($leg_val_item['calldate']) + (int)$leg_val_item['duration_total_sec'];
                if ($leg_end_timestamp_val > $max_end_timestamp_val) $max_end_timestamp_val = $leg_end_timestamp_val;

                if ($leg_val_item['_is_operator_dest']) {
                    $session_data['operator_attempts'][] = [
                        'operator_dst' => $leg_val_item['destination'], 'uniqueid' => $leg_val_item['uniqueid'],
                        'calldate' => $leg_val_item['calldate'], 'status' => $leg_val_item['status'],
                        'duration_sec' => (int)$leg_val_item['duration_total_sec'], 'billsec' => (int)$leg_val_item['duration_billed_sec'],
                        'recording_filename' => $leg_val_item['recording_filename'], 'download_url' => $leg_val_item['download_url']
                    ];
                    if ($leg_val_item['status'] == 'ANSWERED' && !$answered_operator_leg_val) $answered_operator_leg_val = $leg_val_item;
                } elseif ($leg_val_item['_is_queue_dest']) {
                    $session_data['queue_legs_info'][] = [
                        'queue_dst' => $leg_val_item['destination'], 'uniqueid' => $leg_val_item['uniqueid'],
                        'calldate' => $leg_val_item['calldate'], 'status' => $leg_val_item['status'],
                        'duration_sec' => (int)$leg_val_item['duration_total_sec'], 'billsec' => (int)$leg_val_item['duration_billed_sec'],
                        'recording_filename' => $leg_val_item['recording_filename'], 'download_url' => $leg_val_item['download_url']
                    ];
                } else {
                     $session_data['other_legs_info'][] = $leg_val_item; // Сохраняем другие плечи
                }
            }
            
            $session_data['call_end_time'] = date('Y-m-d H:i:s', $max_end_timestamp_val);
            $session_data['total_duration_sec_overall'] = $max_end_timestamp_val - strtotime($session_data['call_start_time']);

            if ($answered_operator_leg_val) {
                $session_data['overall_status'] = 'ANSWERED';
                $session_data['answered_by_operator'] = $answered_operator_leg_val['destination'];
                $session_data['billed_duration_sec'] = (int)$answered_operator_leg_val['duration_billed_sec'];
                $session_data['recording_file'] = $answered_operator_leg_val['recording_filename'];
                $session_data['download_url'] = $answered_operator_leg_val['download_url'];

                // Calculate wait time in seconds
                $session_start_ts = strtotime($session_data['call_start_time']);
                $answered_leg_start_ts = strtotime($answered_operator_leg_val['calldate']);
                if ($session_start_ts !== false && $answered_leg_start_ts !== false && $answered_leg_start_ts >= $session_start_ts) {
                    $session_data['wait_time_sec'] = $answered_leg_start_ts - $session_start_ts;
                }

            } else {
                $session_data['overall_status'] = 'MISSED'; // Или другой статус, если звонок не дошел до оператора но имел запись
                // Логика выбора файла записи для пропущенных звонков
                foreach ($session_data['queue_legs_info'] as $q_leg_val) {
                    if (!empty($q_leg_val['recording_filename'])) {
                         $master_in_q_rec_val = extractMasterUniqueIdFromRecording($q_leg_val['recording_filename']);
                         if ($master_in_q_rec_val === $session_master_id_val || empty($session_data['recording_file'])) { // Приоритет записи от мастер uniqueid
                             $session_data['recording_file'] = $q_leg_val['recording_filename'];
                             $session_data['download_url'] = $q_leg_val['download_url']; // Используем download_url от этого плеча
                         }
                    }
                }
                if (empty($session_data['recording_file'])) { // Если в очереди не нашли, ищем в "других" плечах
                     foreach ($session_data['other_legs_info'] as $o_leg_val) {
                         if (!empty($o_leg_val['recording_filename'])) {
                             $master_in_o_rec_val = extractMasterUniqueIdFromRecording($o_leg_val['recording_filename']);
                             if ($master_in_o_rec_val === $session_master_id_val || empty($session_data['recording_file'])) {
                                 $session_data['recording_file'] = $o_leg_val['recording_filename'];
                                 $session_data['download_url'] = $o_leg_val['download_url'];
                             }
                         }
                     }
                }
            }
            $session_id_str_val = $session_data['source_number'] . "_" . str_replace([' ', ':'], ['_', '-'], $session_data['call_start_time']) . "_" . $session_master_id_val;
            $session_data['session_id_generated'] = $session_id_str_val;
            $final_sessions_output[] = $session_data;
        }
        
        header('Content-Type: application/json; charset=utf-8');
        $json_options = JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
        echo json_encode([
            'info' => [
                'total_raw_cdr_entries' => count($calls_raw),
                'total_initial_groups' => count($grouped_calls_by_original_uid),
                'query_executed' => isset($query) ? $query : 'N/A',
                'query_params' => isset($params) ? $params : 'N/A'
            ],
            'processed_logical_sessions' => $final_sessions_output,
            'analysis_info' => [
                 'remaining_orphaned_legs_count' => count(array_values($orphaned_legs)),
                 'remaining_orphaned_legs_sample' => array_slice(array_values($orphaned_legs), 0, 10)
            ]
        ], $json_options);

    } catch (Exception $e) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode(['_error_processing' => "Ошибка обработки данных CDR: " . $e->getMessage(), 'query' => isset($query) ? $query : 'N/A', 'params' => isset($params) ? $params : 'N/A', 'trace' => $e->getTraceAsString()], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
} elseif ($action !== 'download') { // Если action не download и не get_cdr_stats
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(400);
    echo json_encode(['_error' => "Неизвестное действие: " . htmlspecialchars($action)], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}
?>