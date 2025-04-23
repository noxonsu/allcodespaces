<?php
/**
 * Plugin Name: CSV Product Updater (for Details CPT) - Background Processing
 * Description: Обновляет цену и наличие для постов типа "Запчасти" (details) из CSV файла по артикулу или наименованию. Использует ACF поля. Обработка в фоновом режиме.
 * Version: 1.3
 * Author: Noxon
 * Text Domain: csv-product-updater
 * Domain Path: /languages
 */

defined('ABSPATH') or die('No script kiddies please!');

// --- НАСТРОЙКИ ---
// Путь к файлу CSV по умолчанию относительно папки uploads. Пример: 'product-updates.csv'
define('CPU_DEFAULT_CSV_FILENAME', 'product-updates.csv');

// --- НАСТРОЙКИ ДЛЯ CPT 'details' И ACF ---
// Тип поста для поиска (из вашего functions.php)
define('CPU_POST_TYPES', 'details');
// Ключ поля ACF для артикула (проверьте точное имя поля в ACF). ИЛИ 'model', если используется оно.
define('CPU_SKU_ACF_KEY', 'artikul');
// !!! ВАЖНО: Укажите ТОЧНЫЙ ключ поля ACF для ЦЕНЫ !!!
define('CPU_PRICE_ACF_KEY', 'price'); // <--- ЗАМЕНИТЕ 'price', ЕСЛИ КЛЮЧ ДРУГОЙ
// !!! ВАЖНО: Укажите ТОЧНЫЙ ключ поля ACF для ОСТАТКА !!!
define('CPU_STOCK_ACF_KEY', 'stock'); // <--- ЗАМЕНИТЕ 'stock', ЕСЛИ КЛЮЧ ДРУГОЙ

// --- НАСТРОЙКИ ФОНОВОЙ ОБРАБОТКИ ---
// Ключи для хранения состояния в опциях WordPress
define('CPU_OPTION_STATUS', 'cpu_import_status'); // 'idle', 'pending', 'running', 'complete', 'error'
define('CPU_OPTION_FILEPATH', 'cpu_import_filepath');
define('CPU_OPTION_TOTAL_ROWS', 'cpu_import_total_rows');
define('CPU_OPTION_PROCESSED_ROWS', 'cpu_import_processed_rows');
define('CPU_OPTION_RESULTS', 'cpu_import_results');
define('CPU_BATCH_SIZE', 1000); // Сколько строк обрабатывать за один запуск WP-Cron
define('CPU_CRON_HOOK', 'cpu_run_csv_batch_hook'); // Имя хука для WP-Cron
// --- КОНЕЦ НАСТРОЕК ---


/**
 * Получить полный путь к файлу CSV по умолчанию.
 * @return string|false
 */
function cpu_get_default_csv_path() {
    $upload_dir = wp_upload_dir();
    if (empty($upload_dir['basedir'])) {
        return false;
    }
    return $upload_dir['basedir'] . '/' . CPU_DEFAULT_CSV_FILENAME;
}

/**
 * Регистрация страницы настроек.
 */
function cpu_register_admin_page() {
    add_options_page(
        __('CSV Details Update', 'csv-product-updater'),
        __('CSV Details Update', 'csv-product-updater'),
        'manage_options',
        'csv-product-updater',
        'cpu_render_admin_page'
    );
}
add_action('admin_menu', 'cpu_register_admin_page');

/**
 * Обработка отправки формы - ЗАПУСК ФОНОВОГО ПРОЦЕССА.
 */
function cpu_handle_form_submission() {
    if (!isset($_POST['cpu_nonce']) || !wp_verify_nonce($_POST['cpu_nonce'], 'cpu_update_action')) {
       return;
    }
    if (!current_user_can('manage_options')) {
       wp_die(__('У вас нет прав для выполнения этой операции.', 'csv-product-updater'));
    }

    $redirect_url = admin_url('options-general.php?page=csv-product-updater');

    // Проверяем, не идет ли уже обработка
    $current_status = get_option(CPU_OPTION_STATUS, 'idle');
    if ($current_status === 'running' || $current_status === 'pending') {
        add_settings_error('cpu_messages', 'cpu_already_running', __('Ошибка: Предыдущая обработка еще не завершена. Дождитесь ее окончания.', 'csv-product-updater'), 'error');
        wp_redirect($redirect_url);
        exit;
    }

    // Обработка ЗАГРУЗКИ
    if (isset($_POST['cpu_upload_and_process']) && isset($_FILES['csv_file_upload'])) {
        if ($_FILES['csv_file_upload']['error'] === UPLOAD_ERR_OK) {
            $uploaded_file = $_FILES['csv_file_upload'];
            $file_type = wp_check_filetype($uploaded_file['name']);

            if (strtolower($file_type['ext']) === 'csv') {
                // Перемещаем файл в безопасное место
                $upload_dir = wp_upload_dir();
                $imports_dir = $upload_dir['basedir'] . '/csv-imports';
                wp_mkdir_p($imports_dir); // Создаем папку, если ее нет
                $new_filename = uniqid('cpu_import_', true) . '.csv';
                $persistent_filepath = $imports_dir . '/' . $new_filename;

                if (move_uploaded_file($uploaded_file['tmp_name'], $persistent_filepath)) {
                    // Файл успешно перемещен, готовимся к фоновой обработке
                    $total_rows = cpu_count_csv_rows($persistent_filepath); // Функция для подсчета строк

                    if ($total_rows === false) {
                         add_settings_error('cpu_messages', 'cpu_file_error', __('Ошибка: Не удалось прочитать файл для подсчета строк.', 'csv-product-updater'), 'error');
                         wp_delete_file($persistent_filepath); // Удаляем файл
                    } elseif ($total_rows === 0) {
                         add_settings_error('cpu_messages', 'cpu_file_empty', __('Ошибка: Загруженный CSV файл пуст или не содержит данных после заголовка.', 'csv-product-updater'), 'error');
                         wp_delete_file($persistent_filepath); // Удаляем файл
                    } else {
                        // Очищаем предыдущие запланированные задачи (на всякий случай)
                        wp_clear_scheduled_hook(CPU_CRON_HOOK);

                        // Сохраняем состояние для фоновой задачи
                        update_option(CPU_OPTION_STATUS, 'pending'); // Статус "ожидает запуска"
                        update_option(CPU_OPTION_FILEPATH, $persistent_filepath);
                        update_option(CPU_OPTION_TOTAL_ROWS, $total_rows);
                        update_option(CPU_OPTION_PROCESSED_ROWS, 0);
                        update_option(CPU_OPTION_RESULTS, [
                            'total_rows' => $total_rows, // Общее количество строк данных
                            'processed_in_run' => 0, // Сколько обработано в текущем запуске (для лога)
                            'updated' => 0,
                            'skipped_not_found' => 0,
                            'skipped_invalid_data' => 0,
                            'errors' => []
                        ]); // Сбрасываем результаты

                        // Планируем первый запуск WP-Cron немедленно
                        wp_schedule_single_event(time(), CPU_CRON_HOOK);

                        add_settings_error('cpu_messages', 'cpu_process_scheduled', sprintf(__('Файл загружен (%d строк данных). Обработка запущена в фоновом режиме.', 'csv-product-updater'), $total_rows), 'info');
                    }

                } else {
                    add_settings_error('cpu_messages', 'cpu_move_error', __('Ошибка: Не удалось переместить загруженный файл.', 'csv-product-updater'), 'error');
                }

            } else {
                add_settings_error('cpu_messages', 'cpu_file_error', __('Ошибка: Пожалуйста, загрузите файл в формате CSV.', 'csv-product-updater'), 'error');
            }
        } elseif ($_FILES['csv_file_upload']['error'] !== UPLOAD_ERR_NO_FILE) {
            add_settings_error('cpu_messages', 'cpu_upload_error', __('Ошибка загрузки файла: ', 'csv-product-updater') . $_FILES['csv_file_upload']['error'], 'error');
        } else {
             add_settings_error('cpu_messages', 'cpu_no_file_to_process', __('Не выбран файл для загрузки.', 'csv-product-updater'), 'warning');
        }
        wp_redirect($redirect_url);
        exit;
    }
    // Если не было загрузки, просто возвращаемся (или обрабатываем другие возможные действия)
}
add_action('admin_init', 'cpu_handle_form_submission');

/**
 * Хук для WP-Cron.
 */
add_action(CPU_CRON_HOOK, 'cpu_run_csv_batch');

/**
 * Функция, выполняющая один шаг фоновой обработки.
 */
function cpu_run_csv_batch() {
    $filepath = get_option(CPU_OPTION_FILEPATH);
    $total_rows = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    $processed_rows = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $results = get_option(CPU_OPTION_RESULTS, []);

    // Проверяем базовые условия для продолжения
    if (empty($filepath) || !file_exists($filepath) || $processed_rows >= $total_rows) {
        // Нечего обрабатывать или уже завершено
        update_option(CPU_OPTION_STATUS, 'idle'); // Сбрасываем статус
        wp_clear_scheduled_hook(CPU_CRON_HOOK); // Убираем крон задачу
        // Опционально: удалить файл, если он еще существует
        // if (!empty($filepath) && file_exists($filepath)) { wp_delete_file($filepath); }
        // update_option(CPU_OPTION_FILEPATH, '');
        return;
    }

    // Устанавливаем статус "в процессе"
    update_option(CPU_OPTION_STATUS, 'running');

    @set_time_limit(300); // Увеличиваем лимит времени для этого скрипта
    wp_defer_term_counting(true);
    wp_defer_comment_counting(true);
    wp_suspend_cache_invalidation(true); // Приостанавливаем инвалидацию кеша

    $post_types = explode(',', CPU_POST_TYPES);
    $post_types = array_map('trim', $post_types);

    $rows_in_this_batch = 0;
    $handle = fopen($filepath, "r");

    if ($handle === FALSE) {
        $results['errors'][] = __('Критическая ошибка: Не удалось открыть файл для обработки в фоновом режиме.', 'csv-product-updater');
        update_option(CPU_OPTION_RESULTS, $results);
        update_option(CPU_OPTION_STATUS, 'error');
        wp_clear_scheduled_hook(CPU_CRON_HOOK); // Убираем крон задачу
        wp_defer_term_counting(false);
        wp_defer_comment_counting(false);
        wp_suspend_cache_invalidation(false);
        // Не удаляем файл, чтобы можно было посмотреть
        return;
    }

    // Пропускаем заголовок и уже обработанные строки
    // fseek может быть неточным с CSV, особенно с разными окончаниями строк, используем fgets
    for ($i = 0; $i <= $processed_rows; $i++) { // <= потому что processed_rows - это количество УЖЕ обработанных, нам нужно пропустить их + заголовок
        if (feof($handle)) break;
        fgets($handle); // Читаем строку, чтобы сдвинуть указатель (включая заголовок на первой итерации)
    }

    // Обрабатываем пакет строк
    while (($row = fgetcsv($handle, 0, ",")) !== FALSE && $rows_in_this_batch < CPU_BATCH_SIZE) {
        $current_row_index = $processed_rows + $rows_in_this_batch; // Индекс текущей строки данных (0-based)
        $rows_in_this_batch++;
        $results['processed_in_run'] = $rows_in_this_batch; // Обновляем счетчик для лога

        // --- Логика обработки ОДНОЙ строки (из старой функции cpu_process_csv_file) ---
        if (count($row) < 4) {
            $results['skipped_invalid_data']++;
            $results['errors'][] = sprintf(__('Строка %d: Недостаточно колонок (%d).', 'csv-product-updater'), $current_row_index + 2, count($row)); // +1 за 0-based, +1 за заголовок
            continue;
        }

        // Извлекаем данные из строки
        $sku = isset($row[0]) ? trim($row[0]) : '';
        $name = isset($row[1]) ? trim($row[1]) : '';
        $stock_raw = isset($row[2]) ? trim($row[2]) : '';
        $price_raw = isset($row[3]) ? trim($row[3]) : '';

        // Проверяем наличие идентификатора
        if (empty($sku) && empty($name)) {
            $results['skipped_invalid_data']++;
            $results['errors'][] = sprintf(__('Строка %d: Отсутствует Артикул и Наименование.', 'csv-product-updater'), $current_row_index + 2);
            continue;
        }

        // --- Поиск поста ---
        $post_id = null;
        $found_by = '';
        $existing_sku = null; // Сбрасываем для каждой строки
        $csv_sku_provided = !empty($sku);

        // 1. Поиск по артикулу (ACF поле) - приоритетный, используем LIKE
        if ($csv_sku_provided) {
            $args_sku = [
                'post_type' => $post_types,
                'post_status' => 'any',
                'posts_per_page' => 1,
                'meta_query' => [
                    [
                        'key' => CPU_SKU_ACF_KEY,
                        'value' => $sku,
                        'compare' => 'LIKE',
                    ],
                ],
                'fields' => 'ids',
                'suppress_filters' => true,
                'cache_results' => false, // Не кешируем запросы в цикле
                'update_post_meta_cache' => false,
                'update_post_term_cache' => false,
            ];
            $found_posts_sku = get_posts($args_sku);
            if (!empty($found_posts_sku)) {
                $post_id = $found_posts_sku[0];
                $found_by = 'ACF Key LIKE (' . CPU_SKU_ACF_KEY . ')';
            }
        }

        // 2. Поиск по наименованию (заголовку), если не найден по артикулу
        if (!$post_id && !empty($name)) {
             $clean_name = preg_replace('/^[\d\.\s]*(.*)/', '$1', $name); // Убираем цифры/точки/пробелы в начале
             $clean_name = trim($clean_name);

             if(!empty($clean_name)) {
                 // Сначала ищем по точному совпадению заголовка
                 $args_name = [
                     'post_type' => $post_types,
                     'post_status' => 'any',
                     'posts_per_page' => 1,
                     'title' => $clean_name,
                     'fields' => 'ids',
                     'suppress_filters' => true,
                     'cache_results' => false,
                     'update_post_meta_cache' => false,
                     'update_post_term_cache' => false,
                 ];
                 $found_posts_name = get_posts($args_name);

                 // Если точное совпадение не найдено, пробуем поиск по 's' (менее точный)
                 if (empty($found_posts_name)) {
                     $args_name_s = [
                        'post_type' => $post_types,
                        'post_status' => 'any',
                        'posts_per_page' => 1,
                        's' => $clean_name,
                        'fields' => 'ids',
                        'suppress_filters' => false, // 's' требует включенных фильтров
                        'cache_results' => false,
                        'update_post_meta_cache' => false,
                        'update_post_term_cache' => false,
                     ];
                     $found_posts_name = get_posts($args_name_s);
                 }

                 if (!empty($found_posts_name)) {
                     $potential_post_id = $found_posts_name[0];
                     // Дополнительная проверка: если нашли по имени, убедимся, что у поста нет ДРУГОГО артикула
                     $existing_sku = get_post_meta($potential_post_id, CPU_SKU_ACF_KEY, true);

                     if (empty($existing_sku)) {
                         // У найденного поста нет артикула - обновляем
                         $post_id = $potential_post_id;
                         $found_by = 'Title (Post had no SKU)';
                     } elseif ($csv_sku_provided && $existing_sku == $sku) {
                         // Артикул в CSV есть и он совпадает с артикулом поста - обновляем
                         $post_id = $potential_post_id;
                         $found_by = 'Title (SKUs matched)';
                     } elseif ($csv_sku_provided && $existing_sku != $sku) {
                         // Нашли пост по имени, но у него ДРУГОЙ артикул, чем в CSV. Пропускаем.
                         $results['errors'][] = sprintf(__('Строка %d: Найден пост "%s" (ID: %d) по имени, но его артикул (%s) не совпадает с CSV (%s). Пропущено.', 'csv-product-updater'),
                             $current_row_index + 2,
                             get_the_title($potential_post_id),
                             $potential_post_id,
                             esc_html($existing_sku),
                             esc_html($sku)
                         );
                         // $post_id остается null
                     } elseif (!$csv_sku_provided && !empty($existing_sku)) {
                          // Нашли по имени, в CSV артикула не было, у поста артикул есть - считаем это нужным постом и обновляем
                          $post_id = $potential_post_id;
                          $found_by = 'Title (CSV had no SKU, Post has one)';
                     } elseif (!$csv_sku_provided && empty($existing_sku)) {
                         // Нашли по имени, артикула нет ни в CSV, ни у поста - обновляем
                         $post_id = $potential_post_id;
                         $found_by = 'Title (No SKU anywhere)';
                     }
                 }
             }
        }

        // --- Обновление метаданных ACF, если пост найден ---
        if ($post_id) {
            try {
                // Очистка и подготовка цены
                $price = preg_replace('/[^\d,\.]/', '', $price_raw); // Удаляем все кроме цифр, запятых, точек
                $price = str_replace(',', '.', $price); // Заменяем запятую на точку для floatval
                $price = floatval($price);

                // Очистка и подготовка остатка
                $stock = !empty($stock_raw) ? intval(preg_replace('/[^\d]/', '', $stock_raw)) : 0; // Удаляем все нецифровое перед intval

                // Обновляем мета-поля ACF
                $price_updated = update_field(CPU_PRICE_ACF_KEY, $price, $post_id);
                $stock_updated = update_field(CPU_STOCK_ACF_KEY, $stock, $post_id);

                // Проверяем результат обновления (update_field возвращает true при успехе)
                if ($price_updated !== false && $stock_updated !== false) {
                    $results['updated']++;
                    // Добавляем лог только при успешном обновлении
                    // $edit_link = admin_url('post.php?post=' . $post_id . '&action=edit');
                    // $results['errors'][] = sprintf(
                    //     __('Строка %d: Обновлен пост "%s" (ID: %d). Найден по: %s. Цена: %s, Остаток: %d. <a href="%s" target="_blank">Ред.</a>', 'csv-product-updater'),
                    //     $current_row_index + 2, esc_html(get_the_title($post_id)), $post_id, esc_html($found_by), wc_price($price), $stock, esc_url($edit_link)
                    // );
                } else {
                    // Если update_field вернул false, считаем это ошибкой
                    $results['skipped_invalid_data']++;
                    $results['errors'][] = sprintf(__('Строка %d (Пост ID: %d): Ошибка при обновлении ACF полей (update_field вернул false).', 'csv-product-updater'), $current_row_index + 2, $post_id);
                }

            } catch (Exception $e) {
                 $results['skipped_invalid_data']++;
                 $results['errors'][] = sprintf(__('Строка %d (Пост ID: %d, Найден по: %s): Исключение при обновлении ACF полей - %s', 'csv-product-updater'), $current_row_index + 2, $post_id, $found_by, $e->getMessage());
            }
        } else {
            // Логируем пропуск только если пост не был найден И не было ошибки несовпадения артикула
            $log_skip = true;
            if ($csv_sku_provided && !empty($name) && !empty($potential_post_id) && !empty($existing_sku) && $existing_sku != $sku) {
                // Ошибка несовпадения артикула уже залогирована выше
                $log_skip = false;
            }

            if ($log_skip) {
                $results['skipped_not_found']++;
                // Детальный лог "не найдено" можно раскомментировать при необходимости
                // $results['errors'][] = sprintf(__('Строка %d: Пост не найден по Артикулу (LIKE) "%s" или Заголовку "%s".', 'csv-product-updater'), $current_row_index + 2, esc_html($sku), esc_html($name));
            }
        }
        // --- Конец логики обработки ОДНОЙ строки ---

    } // end while batch

    fclose($handle);

    // Обновляем общее количество обработанных строк
    $new_processed_count = $processed_rows + $rows_in_this_batch;
    update_option(CPU_OPTION_PROCESSED_ROWS, $new_processed_count);
    update_option(CPU_OPTION_RESULTS, $results); // Сохраняем обновленные результаты

    // Проверяем, завершена ли обработка
    if ($new_processed_count >= $total_rows) {
        // Завершено
        update_option(CPU_OPTION_STATUS, 'complete');
        $results['errors'][] = __('Обработка файла успешно завершена.', 'csv-product-updater');
        update_option(CPU_OPTION_RESULTS, $results);
        wp_clear_scheduled_hook(CPU_CRON_HOOK); // Убираем крон задачу
        // Опционально: удалить файл
        // if (file_exists($filepath)) { wp_delete_file($filepath); }
        // update_option(CPU_OPTION_FILEPATH, '');
    } else {
        // Еще есть строки, планируем следующий запуск
        wp_schedule_single_event(time() + 1, CPU_CRON_HOOK); // Небольшая задержка
        update_option(CPU_OPTION_STATUS, 'running'); // Убедимся, что статус все еще running
    }

    wp_defer_term_counting(false);
    wp_defer_comment_counting(false);
    wp_suspend_cache_invalidation(false); // Возобновляем инвалидацию кеша
    wp_cache_flush(); // Очищаем кеш WordPress
}


/**
 * Вспомогательная функция для подсчета строк данных в CSV (пропускает заголовок).
 * @param string $filepath
 * @return int|false
 */
function cpu_count_csv_rows($filepath) {
    if (!file_exists($filepath) || !is_readable($filepath)) {
        return false;
    }
    $count = 0;
    $handle = fopen($filepath, "r");
    if ($handle === FALSE) {
        return false;
    }
    // Пропускаем заголовок
    fgetcsv($handle, 0, ",");
    while (($row = fgetcsv($handle, 0, ",")) !== FALSE) {
        // Проверяем, что строка не пустая (состоит не только из разделителей или пустых значений)
        if (count(array_filter($row, function($value) { return $value !== ''; })) > 0) {
             $count++;
        }
    }
    fclose($handle);
    return $count;
}


/**
 * Отображение страницы настроек - ДОБАВЛЕНО AJAX И ОТОБРАЖЕНИЕ СТАТУСА.
 */
function cpu_render_admin_page() {
    $status = get_option(CPU_OPTION_STATUS, 'idle');
    $processed = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $total = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    $results = get_option(CPU_OPTION_RESULTS, []);
    $is_processing = ($status === 'running' || $status === 'pending');

    ?>
    <div class="wrap">
        <h1><?php _e('Обновление Запчастей (details) из CSV', 'csv-product-updater'); ?></h1>

        <?php settings_errors('cpu_messages'); // Показываем ошибки/сообщения от add_settings_error ?>

        <?php // Отображение статуса и прогресса ?>
        <div id="cpu-status-area" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ccc; background: #f9f9f9;">
            <h3><?php _e('Статус обработки', 'csv-product-updater'); ?></h3>
            <div id="cpu-status-message">
                <?php
                if ($is_processing) {
                    _e('Идет обработка...', 'csv-product-updater');
                    if ($total > 0) {
                        printf(' (%d / %d)', $processed, $total);
                    }
                } elseif ($status === 'complete') {
                    _e('Обработка завершена.', 'csv-product-updater');
                } elseif ($status === 'error') {
                    _e('Произошла ошибка во время обработки. См. лог ниже.', 'csv-product-updater');
                } else {
                    _e('Нет активных задач. Вы можете загрузить новый файл.', 'csv-product-updater');
                }
                ?>
            </div>
            <?php if ($is_processing): ?>
                <div id="cpu-progress-bar-container" style="margin-top: 10px; height: 20px; background: #eee; border-radius: 5px; overflow: hidden; border: 1px solid #ddd;">
                    <div id="cpu-progress-bar" style="width: <?php echo ($total > 0) ? round(($processed / $total) * 100) : 0; ?>%; height: 100%; background: #4caf50; transition: width 0.5s ease; text-align: center; color: white; font-weight: bold; line-height: 20px;">
                         <?php echo ($total > 0) ? round(($processed / $total) * 100) : 0; ?>%
                    </div>
                </div>
            <?php endif; ?>
        </div>

        <?php // Отображение результатов ПОСЛЕ завершения или при ошибке ?>
        <?php if ($status === 'complete' || $status === 'error'): ?>
             <?php if (!empty($results)): ?>
                <div id="message" class="notice notice-<?php echo ($status === 'error' ? 'error' : 'info'); ?> is-dismissible" style="margin-top: 20px;">
                    <p><strong><?php _e('Результаты последней обработки:', 'csv-product-updater'); ?></strong></p>
                    <ul>
                        <li><?php printf(__('Всего строк данных в CSV: %d', 'csv-product-updater'), $results['total_rows']); ?></li>
                        <li><?php printf(__('Обработано строк: %d', 'csv-product-updater'), $processed); ?></li>
                        <li><?php printf(__('Найдено и обновлено постов: %d', 'csv-product-updater'), $results['updated']); ?></li>
                        <li><?php printf(__('Постов не найдено (пропущено): %d', 'csv-product-updater'), $results['skipped_not_found']); ?></li>
                        <li><?php printf(__('Строк с некорректными данными/ошибками обновления (пропущено): %d', 'csv-product-updater'), $results['skipped_invalid_data']); ?></li>
                        <?php if (!empty($results['errors'])) : ?>
                             <li style="margin-top: 10px;"><strong><?php _e('Лог обработки / Ошибки / Предупреждения:', 'csv-product-updater'); ?></strong>
                                 <ul style="list-style: disc; margin-left: 20px; max-height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; background: #f0f0f0; font-size: 0.9em; line-height: 1.4;">
                                     <?php foreach ($results['errors'] as $error) : ?>
                                         <li><?php echo wp_kses_post($error); // Используем wp_kses_post для безопасности ?></li>
                                     <?php endforeach; ?>
                                 </ul>
                             </li>
                        <?php endif; ?>
                    </ul>
                </div>
                <?php
                // Сбрасываем статус и результаты после отображения, чтобы можно было начать заново
                // Делаем это только если статус не 'running' или 'pending'
                if (!$is_processing) {
                    // update_option(CPU_OPTION_STATUS, 'idle'); // Сброс статуса
                    // update_option(CPU_OPTION_RESULTS, []); // Очистка результатов
                    // update_option(CPU_OPTION_PROCESSED_ROWS, 0);
                    // update_option(CPU_OPTION_TOTAL_ROWS, 0);
                    // Файл можно оставить для анализа или удалить
                    // $filepath = get_option(CPU_OPTION_FILEPATH);
                    // if (!empty($filepath) && file_exists($filepath)) { wp_delete_file($filepath); }
                    // update_option(CPU_OPTION_FILEPATH, '');
                }
                ?>
             <?php endif; ?>
        <?php endif; ?>


        <hr>

        <h2><?php _e('Загрузить и обработать новый CSV файл', 'csv-product-updater'); ?></h2>
        <p><?php _e('Выберите CSV файл для загрузки. Формат: Артикул, Наименование, Остаток, Цена. Первая строка должна быть заголовком.', 'csv-product-updater'); ?></p>
        <?php // Блокируем форму, если идет обработка ?>
        <form method="post" action="options-general.php?page=csv-product-updater" enctype="multipart/form-data" <?php if ($is_processing) echo ' style="opacity: 0.5; pointer-events: none;"'; ?>>
            <?php wp_nonce_field('cpu_update_action', 'cpu_nonce'); ?>
             <input type="hidden" name="action" value="upload_and_process">
            <p>
                <label for="csv_file_upload"><?php _e('Выберите CSV файл:', 'csv-product-updater'); ?></label>
                <input type="file" id="csv_file_upload" name="csv_file_upload" accept=".csv" required <?php if ($is_processing) echo ' disabled'; ?>>
            </p>
            <?php submit_button(__('Загрузить и запустить обработку', 'csv-product-updater'), 'primary', 'cpu_upload_and_process', false, ($is_processing) ? ['disabled' => true] : null); ?>
             <?php if ($is_processing): ?>
                 <p style="color: orange; font-weight: bold;"><em><?php _e('Пожалуйста, подождите завершения текущей обработки перед загрузкой нового файла.', 'csv-product-updater'); ?></em></p>
             <?php endif; ?>
        </form>

         <hr>
         <h2><?php _e('Информация о настройках', 'csv-product-updater'); ?></h2>
         <p><strong><?php _e('Важно:', 'csv-product-updater'); ?></strong> <?php _e('Убедитесь, что указанные ниже ключи полей ACF соответствуют вашей настройке!', 'csv-product-updater'); ?></p>
         <ul>
              <li><?php printf(__('Поиск будет производиться по типу поста: %s', 'csv-product-updater'), '<code>' . esc_html(CPU_POST_TYPES) . '</code>'); ?></li>
              <li><?php printf(__('Поле ACF для поиска артикула (SKU): %s (используется поиск LIKE)', 'csv-product-updater'), '<code>' . esc_html(CPU_SKU_ACF_KEY) . '</code>'); ?></li>
              <li><?php printf(__('Поле ACF для обновления цены: %s', 'csv-product-updater'), '<code>' . esc_html(CPU_PRICE_ACF_KEY) . '</code>'); ?> <strong style="color:red;"> &lt;-- <?php _e('ПРОВЕРЬТЕ ЭТОТ КЛЮЧ!', 'csv-product-updater'); ?></strong></li>
               <li><?php printf(__('Поле ACF для обновления остатка: %s', 'csv-product-updater'), '<code>' . esc_html(CPU_STOCK_ACF_KEY) . '</code>'); ?> <strong style="color:red;"> &lt;-- <?php _e('ПРОВЕРЬТЕ ЭТОТ КЛЮЧ!', 'csv-product-updater'); ?></strong></li>
               <li><?php _e('Поиск также будет выполнен по Заголовку поста, если не найден по Артикулу.', 'csv-product-updater'); ?></li>
               <li><?php printf(__('Размер пакета обработки (строк за раз): %d', 'csv-product-updater'), CPU_BATCH_SIZE); ?></li>
         </ul>
          <p><em><?php _e('Эти настройки заданы в коде плагина (константы в начале файла).', 'csv-product-updater'); ?></em></p>

    </div>
    <?php
    // Добавляем JavaScript для AJAX-опроса, только если обработка активна
    if ($is_processing) {
        cpu_add_ajax_script(); 
    }
}

/**
 * Добавляет JavaScript для опроса статуса.
 */
function cpu_add_ajax_script() {
    $ajax_nonce = wp_create_nonce("cpu_ajax_nonce");
    ?>
    <script type="text/javascript">
        jQuery(document).ready(function($) {
            var cpu_interval_id;
            var cpu_status_area = $('#cpu-status-area');
            var cpu_status_message = $('#cpu-status-message');
            var cpu_progress_bar_container = $('#cpu-progress-bar-container');
            var cpu_progress_bar = $('#cpu-progress-bar');
            var cpu_form = $('form[method="post"][enctype="multipart/form-data"]'); // Находим форму загрузки
            var initial_check_done = false; // Флаг для первой проверки

            function cpu_check_status() {
                $.ajax({
                    url: ajaxurl, // Глобальная переменная WordPress
                    type: 'POST',
                    data: {
                        action: 'cpu_ajax_get_progress', // Наш AJAX action
                        _ajax_nonce: '<?php echo $ajax_nonce; ?>'
                    },
                    dataType: 'json',
                    success: function(response) {
                        if (response.success) {
                            var data = response.data;
                            var message = '';
                            var progress_percent = 0;
                            var is_still_processing = (data.status === 'running' || data.status === 'pending');

                            if (is_still_processing) {
                                message = '<?php echo esc_js(__('Идет обработка...', 'csv-product-updater')); ?>';
                                if (data.total > 0) {
                                    message += ' (' + data.processed + ' / ' + data.total + ')';
                                    progress_percent = Math.round((data.processed / data.total) * 100);
                                }
                                // Обновляем прогресс бар
                                if (cpu_progress_bar.length) {
                                    cpu_progress_bar.css('width', progress_percent + '%').text(progress_percent + '%');
                                }
                                // Убедимся, что форма заблокирована
                                cpu_form.css({ 'opacity': '0.5', 'pointer-events': 'none' });
                                cpu_form.find('input, button').prop('disabled', true);

                            } else {
                                // Обработка завершена (complete или error) или стала idle
                                clearInterval(cpu_interval_id); // Останавливаем опрос
                                // Перезагружаем страницу через небольшую задержку, чтобы пользователь увидел финальный статус
                                setTimeout(function() {
                                     location.reload();
                                }, 1500); // Задержка 1.5 секунды

                                // Обновляем сообщение на финальное перед перезагрузкой
                                if (data.status === 'complete') {
                                    message = '<?php echo esc_js(__('Обработка завершена. Перезагрузка страницы...', 'csv-product-updater')); ?>';
                                    progress_percent = 100;
                                } else if (data.status === 'error') {
                                    message = '<?php echo esc_js(__('Произошла ошибка. Перезагрузка страницы...', 'csv-product-updater')); ?>';
                                    // Оставляем прогресс как есть или сбрасываем
                                } else {
                                     message = '<?php echo esc_js(__('Статус изменился. Перезагрузка страницы...', 'csv-product-updater')); ?>';
                                }
                                if (cpu_progress_bar.length) {
                                     cpu_progress_bar.css('width', progress_percent + '%').text(progress_percent + '%');
                                }
                            }

                            cpu_status_message.html(message); // Используем html() если сообщение может содержать теги

                        } else {
                            // Ошибка AJAX запроса (например, nonce не прошел)
                            console.error('AJAX Error:', response.data);
                            cpu_status_message.text('<?php echo esc_js(__('Ошибка обновления статуса (AJAX).', 'csv-product-updater')); ?>');
                            // Можно остановить опрос при ошибке AJAX
                            // clearInterval(cpu_interval_id);
                        }
                        initial_check_done = true; // Отмечаем, что первая проверка прошла
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        console.error('AJAX Request Failed:', textStatus, errorThrown);
                        cpu_status_message.text('<?php echo esc_js(__('Ошибка сети при обновлении статуса.', 'csv-product-updater')); ?>');
                        // Можно остановить опрос при ошибке сети
                        // clearInterval(cpu_interval_id);
                        initial_check_done = true; // Отмечаем, что первая проверка прошла (с ошибкой)
                    }
                });
            }

            // Запускаем опрос каждые 5 секунд
            cpu_interval_id = setInterval(cpu_check_status, 5000);
            // Выполняем первый запрос сразу же для актуализации UI
            cpu_check_status();
        });
    </script>
    <?php
}


/**
 * Обработчик AJAX запроса для получения прогресса.
 */
function cpu_ajax_get_progress() {
    check_ajax_referer('cpu_ajax_nonce', '_ajax_nonce');

    if (!current_user_can('manage_options')) {
        wp_send_json_error(__('У вас нет прав.', 'csv-product-updater'), 403);
    }

    $status = get_option(CPU_OPTION_STATUS, 'idle');
    $processed = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $total = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    // Не передаем весь лог по AJAX, это может быть много данных
    // $results = get_option(CPU_OPTION_RESULTS, []);

    wp_send_json_success([
        'status' => $status,
        'processed' => $processed,
        'total' => $total,
        // 'results' => [] // Не передаем результаты по AJAX
    ]);
}
add_action('wp_ajax_cpu_ajax_get_progress', 'cpu_ajax_get_progress'); // Хук для авторизованных пользователей


// Удаляем старую функцию обработки, так как она больше не используется напрямую
// function cpu_process_csv_file($filepath) { ... }

?>