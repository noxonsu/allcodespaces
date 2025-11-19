<?php
/**
 * Plugin Name: CSV to Database Updater (priceandstocks) - Background Processing (mysqli - Batch DB Insert - Title)
 * Description: Загружает CSV файл (Артикул, Название, Остаток, Цена) и обновляет/добавляет данные в таблицу `priceandstocks` с использованием REPLACE INTO (mysqli). Обработка в фоновом режиме с пакетной вставкой в БД.
 * Version: 3.5-mysqli-batch-title
 * Author: Noxon
 * Text Domain: csv-to-db-updater
 * Domain Path: /languages
 */

defined('ABSPATH') or die('No script kiddies please!');

// --- НАСТРОЙКИ ---
// Имя таблицы в базе данных WordPress (без префикса)
define('CPU_DB_TABLE_NAME', 'priceandstocks'); // <--- Убедитесь, что имя таблицы верное
// Путь к файлу CSV по умолчанию относительно папки uploads (используется как fallback, но основной механизм - загрузка)
// define('CPU_DEFAULT_CSV_FILENAME', 'product-updates.csv'); // Не используется активно, но можно оставить для справки

// --- НАСТРОЙКИ ФОНОВОЙ ОБРАБОТКИ ---
// Ключи для хранения состояния в опциях WordPress
define('CPU_OPTION_STATUS', 'cpu_csv_to_db_status'); // 'idle', 'pending', 'running', 'complete', 'error'
define('CPU_OPTION_FILEPATH', 'cpu_csv_to_db_filepath'); // Путь к загруженному файлу
define('CPU_OPTION_TOTAL_ROWS', 'cpu_csv_to_db_total_rows');
define('CPU_OPTION_PROCESSED_ROWS', 'cpu_csv_to_db_processed_rows');
define('CPU_OPTION_RESULTS', 'cpu_csv_to_db_results');
define('CPU_OPTION_SKIPPED_EMPTY_SKU', 'cpu_csv_to_db_skipped_empty_sku');
define('CPU_BATCH_SIZE', 500); // Сколько строк CSV читать за один запуск WP-Cron
define('CPU_DB_BATCH_SIZE', 100); // Сколько строк вставлять в БД за один REPLACE запрос
define('CPU_CRON_HOOK', 'cpu_run_csv_to_db_batch_hook'); // Имя хука для WP-Cron
// --- КОНЕЦ НАСТРОЕК ---

/**
 * Регистрация страницы настроек.
 */
function cpu_register_admin_page() {
    add_options_page(
        __('CSV to DB Update', 'csv-to-db-updater'),
        __('CSV to DB Update', 'csv-to-db-updater'),
        'manage_options',
        'csv-to-db-updater', // Slug страницы
        'cpu_render_admin_page'
    );
}
add_action('admin_menu', 'cpu_register_admin_page');

/**
 * Обработка отправки формы - ЗАПУСК ФОНОВОГО ПРОЦЕССА ИЗ CSV В БД.
 */
function cpu_handle_form_submission() {
    // Проверяем nonce и права доступа
    if (!isset($_POST['cpu_nonce']) || !wp_verify_nonce($_POST['cpu_nonce'], 'cpu_update_action')) {
       return;
    }
    if (!current_user_can('manage_options')) {
       wp_die(__('У вас нет прав для выполнения этой операции.', 'csv-to-db-updater'));
    }

    $redirect_url = admin_url('options-general.php?page=csv-to-db-updater'); // Обновлен slug

    // Проверяем, не идет ли уже обработка
    $current_status = get_option(CPU_OPTION_STATUS, 'idle');
    if ($current_status === 'running' || $current_status === 'pending') {
        add_settings_error('cpu_messages', 'cpu_already_running', __('Ошибка: Предыдущая обработка еще не завершена. Дождитесь ее окончания.', 'csv-to-db-updater'), 'error');
        wp_redirect($redirect_url);
        exit;
    }

    // Обработка ЗАГРУЗКИ CSV и ЗАПУСКА ОБНОВЛЕНИЯ БД
    if (isset($_POST['cpu_upload_and_process']) && isset($_FILES['csv_file_upload'])) {
        if ($_FILES['csv_file_upload']['error'] === UPLOAD_ERR_OK) {
            $uploaded_file = $_FILES['csv_file_upload'];
            $file_type = wp_check_filetype($uploaded_file['name']);

            if (strtolower($file_type['ext']) === 'csv') {
                // Перемещаем файл в безопасное место
                $upload_dir = wp_upload_dir();
                // Создаем подпапку для импортов, если ее нет
                $imports_dir = trailingslashit($upload_dir['basedir']) . 'csv-imports';
                if (!wp_mkdir_p($imports_dir)) {
                     add_settings_error('cpu_messages', 'cpu_mkdir_error', __('Ошибка: Не удалось создать директорию для импорта.', 'csv-to-db-updater'), 'error');
                     wp_redirect($redirect_url);
                     exit;
                }

                $new_filename = uniqid('cpu_import_', true) . '.csv';
                $persistent_filepath = $imports_dir . '/' . $new_filename;

                if (move_uploaded_file($uploaded_file['tmp_name'], $persistent_filepath)) {
                    // Файл успешно перемещен, готовимся к фоновой обработке
                    $total_rows = cpu_count_csv_rows($persistent_filepath); // Функция для подсчета строк данных

                    if ($total_rows === false) {
                         add_settings_error('cpu_messages', 'cpu_file_error', __('Ошибка: Не удалось прочитать файл для подсчета строк.', 'csv-to-db-updater'), 'error');
                         wp_delete_file($persistent_filepath); // Удаляем файл
                    } elseif ($total_rows === 0) {
                         add_settings_error('cpu_messages', 'cpu_file_empty', __('Ошибка: Загруженный CSV файл пуст или не содержит данных с непустым артикулом после заголовка.', 'csv-to-db-updater'), 'error');
                         wp_delete_file($persistent_filepath); // Удаляем файл
                    } else {
                        // Очищаем предыдущие запланированные задачи (на всякий случай)
                        wp_clear_scheduled_hook(CPU_CRON_HOOK);

                        // Сохраняем состояние для фоновой задачи
                        update_option(CPU_OPTION_STATUS, 'pending'); // Статус "ожидает запуска"
                        update_option(CPU_OPTION_FILEPATH, $persistent_filepath); // Сохраняем путь к ЗАГРУЖЕННОМУ файлу
                        update_option(CPU_OPTION_TOTAL_ROWS, $total_rows);
                        update_option(CPU_OPTION_PROCESSED_ROWS, 0);
                        update_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0); // Сбрасываем счетчик пустых SKU
                        update_option(CPU_OPTION_RESULTS, [
                            'total_rows' => $total_rows, // Общее количество строк данных в CSV
                            'processed_in_run' => 0, // Сколько обработано в текущем запуске (для лога)
                            'updated' => 0, // Сколько строк успешно добавлено/обновлено в БД
                            'skipped_invalid_data' => 0, // Для ошибок БД или неверных данных в строке
                            'errors' => []
                        ]); // Сбрасываем результаты

                        // Планируем первый запуск WP-Cron немедленно
                        wp_schedule_single_event(time(), CPU_CRON_HOOK);

                        add_settings_error('cpu_messages', 'cpu_process_scheduled', sprintf(__('Файл загружен (%d строк данных с артикулом). Обработка запущена в фоновом режиме.', 'csv-to-db-updater'), $total_rows), 'info');
                    }

                } else {
                    add_settings_error('cpu_messages', 'cpu_move_error', __('Ошибка: Не удалось переместить загруженный файл.', 'csv-to-db-updater'), 'error');
                }

            } else {
                add_settings_error('cpu_messages', 'cpu_file_error', __('Ошибка: Пожалуйста, загрузите файл в формате CSV.', 'csv-to-db-updater'), 'error');
            }
        } elseif ($_FILES['csv_file_upload']['error'] !== UPLOAD_ERR_NO_FILE) {
            add_settings_error('cpu_messages', 'cpu_upload_error', __('Ошибка загрузки файла: ', 'csv-to-db-updater') . $_FILES['csv_file_upload']['error'], 'error');
        } else {
             add_settings_error('cpu_messages', 'cpu_no_file_to_process', __('Не выбран файл для загрузки.', 'csv-to-db-updater'), 'warning');
        }
        wp_redirect($redirect_url);
        exit;
    }
    // Если не было загрузки или другой кнопки, просто возвращаемся
}
add_action('admin_init', 'cpu_handle_form_submission');

/**
 * Хук для WP-Cron.
 */
add_action(CPU_CRON_HOOK, 'cpu_run_csv_to_db_batch');

/**
 * Функция, выполняющая один шаг фоновой обработки CSV в БД (используя mysqli с пакетной вставкой).
 */
function cpu_run_csv_to_db_batch() {
    // Убедимся, что константы и префикс доступны
    if (!defined('DB_HOST') || !defined('DB_USER') || !defined('DB_PASSWORD') || !defined('DB_NAME')) {
         // Логируем критическую ошибку, если константы не определены
         $results = get_option(CPU_OPTION_RESULTS, []);
         $results['errors'][] = __('Критическая ошибка: Константы базы данных WordPress не определены.', 'csv-to-db-updater');
         update_option(CPU_OPTION_RESULTS, $results);
         update_option(CPU_OPTION_STATUS, 'error');
         wp_clear_scheduled_hook(CPU_CRON_HOOK);
         return;
    }
    global $table_prefix; // Получаем префикс таблиц WordPress

    // Устанавливаем соединение с БД через mysqli
    $mysqli = mysqli_connect(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME);

    // Проверяем соединение
    if (mysqli_connect_errno()) {
        $results = get_option(CPU_OPTION_RESULTS, []);
        $results['errors'][] = sprintf(__('Критическая ошибка: Не удалось подключиться к базе данных MySQL: %s', 'csv-to-db-updater'), mysqli_connect_error());
        update_option(CPU_OPTION_RESULTS, $results);
        update_option(CPU_OPTION_STATUS, 'error');
        wp_clear_scheduled_hook(CPU_CRON_HOOK);
        return;
    }
    // Устанавливаем кодировку соединения (важно для корректной работы с кириллицей)
    mysqli_set_charset($mysqli, defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4');
    mysqli_query($mysqli, "SET collation_connection = utf8_general_ci");

    $table_name = $table_prefix . CPU_DB_TABLE_NAME;

    // Получаем путь к ЗАГРУЖЕННОМУ файлу из опций
    $filepath = get_option(CPU_OPTION_FILEPATH);
    $total_rows = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    $processed_rows = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $results = get_option(CPU_OPTION_RESULTS, []);
    $skipped_empty_sku = (int) get_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0); // Получаем текущее значение

    // Проверяем базовые условия для продолжения
    if (empty($filepath) || !file_exists($filepath) || $processed_rows >= $total_rows) {
        // Нечего обрабатывать или уже завершено
        update_option(CPU_OPTION_STATUS, 'idle'); // Сбрасываем статус
        wp_clear_scheduled_hook(CPU_CRON_HOOK); // Убираем крон задачу
        mysqli_close($mysqli); // Закрываем соединение
        return;
    }

    // Устанавливаем статус "в процессе"
    update_option(CPU_OPTION_STATUS, 'running');

    @set_time_limit(300); // Увеличиваем лимит времени для этого скрипта

    $rows_in_this_csv_batch = 0; // Renamed from $rows_in_this_batch for clarity
    $db_batch_params = []; // Parameters for the current DB batch
    $db_batch_rows = 0;    // Number of rows in the current DB batch

    $handle = fopen($filepath, "r"); // Открываем ЗАГРУЖЕННЫЙ файл

    if ($handle === FALSE) {
        $results['errors'][] = __('Критическая ошибка: Не удалось открыть CSV файл для обработки в фоновом режиме.', 'csv-to-db-updater');
        update_option(CPU_OPTION_RESULTS, $results);
        update_option(CPU_OPTION_STATUS, 'error');
        wp_clear_scheduled_hook(CPU_CRON_HOOK);
        mysqli_close($mysqli); // Закрываем соединение
        return;
    }

    // Пропускаем заголовок и уже обработанные строки
    for ($i = 0; $i <= $processed_rows; $i++) { // <= пропустить processed_rows + заголовок
        if (feof($handle)) break;
        fgets($handle); // Читаем строку, чтобы сдвинуть указатель
    }

    // Обрабатываем пакет строк CSV
    while (($row = fgetcsv($handle, 0, ";")) !== FALSE && $rows_in_this_csv_batch < CPU_BATCH_SIZE) {
        $current_row_index = $processed_rows + $rows_in_this_csv_batch; // Индекс текущей строки данных (0-based)
        $rows_in_this_csv_batch++;
        $results['processed_in_run'] = $rows_in_this_csv_batch; // Обновляем счетчик для лога этого запуска

        // --- Логика обработки ОДНОЙ строки CSV ---
        if (count($row) < 4) { // Проверяем наличие как минимум 4 колонок
            $results['skipped_invalid_data']++;
            $results['errors'][] = sprintf(__('Строка %d (CSV): Недостаточно колонок (%d). Ожидалось как минимум 4.', 'csv-to-db-updater'), $current_row_index + 2, count($row)); // +1 за 0-based, +1 за заголовок
            continue;
        }

        // Извлекаем данные из строки
        $sku = isset($row[0]) ? trim($row[0]) : '';
        $title = isset($row[1]) ? trim($row[1]) : ''; // <-- ИЗВЛЕКАЕМ НАЗВАНИЕ
        $stock_raw = isset($row[2]) ? trim($row[2]) : '';
        $price_raw = isset($row[3]) ? trim($row[3]) : '';

        // Проверяем наличие SKU
        if (empty($sku)) {
            $skipped_empty_sku++;
            continue;
        }

        // Очистка и подготовка данных
        $price = preg_replace('/[^\d,\.]/', '', $price_raw);
        $price = str_replace(',', '.', $price);
        $price = floatval($price); // Используем float (тип 'd' в bind_param)

        $stock = !empty($stock_raw) ? intval(preg_replace('/[^\d]/', '', $stock_raw)) : 0; // Используем int (тип 'i' в bind_param)

        // Добавляем данные в массив для пакетной вставки (sku, title, price, stock)
        $db_batch_params[] = $sku;
        $db_batch_params[] = $title; // <-- ДОБАВЛЯЕМ TITLE
        $db_batch_params[] = $price;
        $db_batch_params[] = $stock;
        $db_batch_rows++;

        // Если набрался пакет для БД, выполняем вставку
        if ($db_batch_rows >= CPU_DB_BATCH_SIZE) {
            if (!cpu_execute_replace_batch($mysqli, $table_name, $db_batch_params, $db_batch_rows, $results)) {
                // Если пакетная вставка не удалась, можно остановить обработку или просто записать ошибку и продолжить
                // В данном случае, ошибка уже записана в $results внутри helper-функции
            }
            // Сбрасываем пакет БД
            $db_batch_params = [];
            $db_batch_rows = 0;
        }

    } // end while CSV batch

    fclose($handle);

    // Обрабатываем оставшиеся строки в последнем пакете БД (если есть)
    if ($db_batch_rows > 0) {
        cpu_execute_replace_batch($mysqli, $table_name, $db_batch_params, $db_batch_rows, $results);
    }

    // Обновляем общее количество обработанных строк и счетчик пустых SKU
    $new_processed_count = $processed_rows + $rows_in_this_csv_batch; // Используем счетчик CSV строк
    update_option(CPU_OPTION_PROCESSED_ROWS, $new_processed_count);
    update_option(CPU_OPTION_SKIPPED_EMPTY_SKU, $skipped_empty_sku); // Сохраняем обновленный счетчик
    update_option(CPU_OPTION_RESULTS, $results); // Сохраняем обновленные результаты

    // Проверяем, завершена ли обработка
    if ($new_processed_count >= $total_rows) {
        // Завершено
        update_option(CPU_OPTION_STATUS, 'complete');
        $results['errors'][] = __('Обработка CSV файла и обновление БД успешно завершены.', 'csv-to-db-updater');
        if ($skipped_empty_sku > 0) {
            $results['errors'][] = sprintf(__('Пропущено строк CSV с пустым артикулом (SKU): %d', 'csv-to-db-updater'), $skipped_empty_sku);
        }
        update_option(CPU_OPTION_RESULTS, $results);
        wp_clear_scheduled_hook(CPU_CRON_HOOK); // Убираем крон задачу
    } else {
        // Еще есть строки, планируем следующий запуск
        wp_schedule_single_event(time() + 1, CPU_CRON_HOOK); // Небольшая задержка
        update_option(CPU_OPTION_STATUS, 'running'); // Убедимся, что статус все еще running
    }

    // Закрываем соединение с БД в конце работы функции
    mysqli_close($mysqli);
}

/**
 * Выполняет пакетную вставку/замену строк в БД.
 *
 * @param mysqli $mysqli Объект соединения mysqli.
 * @param string $table_name Имя таблицы с префиксом.
 * @param array $params Плоский массив параметров [sku1, title1, price1, stock1, sku2, title2, price2, stock2, ...].
 * @param int $num_rows Количество строк в пакете.
 * @param array &$results Массив результатов для обновления (передается по ссылке).
 * @return bool True в случае успеха, False в случае ошибки.
 */
function cpu_execute_replace_batch($mysqli, $table_name, $params, $num_rows, &$results) {
    if ($num_rows <= 0) {
        return true; // Нечего делать
    }

    // Строим часть VALUES (?,?,?,?), (?,?,?,?), ...
    $value_placeholders = implode(', ', array_fill(0, $num_rows, '(?, ?, ?, ?)')); // <-- 4 плейсхолдера
    // Строим строку типов параметров 'ssdi' + 'ssdi' + ...
    $param_types = str_repeat('ssdi', $num_rows); // <-- ТИПЫ: string, string, double, integer

    $sql = "REPLACE INTO `{$table_name}` (`sku`, `title`, `price`, `stock`) VALUES {$value_placeholders}"; // <-- ДОБАВЛЕН title

    $stmt = mysqli_prepare($mysqli, $sql);

    if (!$stmt) {
        $db_error = mysqli_error($mysqli);
        $results['skipped_invalid_data'] += $num_rows; // Считаем весь пакет ошибочным
        $results['errors'][] = sprintf(
            __('Пакетная вставка (%d строк): Ошибка подготовки SQL запроса. Ошибка MySQLi: %s', 'csv-to-db-updater'),
            $num_rows,
            esc_html($db_error)
        );
        return false;
    }

    // Привязываем параметры
    // Используем splat оператор (...) для передачи массива параметров как отдельных аргументов
    if (!mysqli_stmt_bind_param($stmt, $param_types, ...$params)) {
         $db_error = mysqli_stmt_error($stmt);
         $results['skipped_invalid_data'] += $num_rows;
         $results['errors'][] = sprintf(
             __('Пакетная вставка (%d строк): Ошибка привязки параметров. Ошибка MySQLi: %s', 'csv-to-db-updater'),
             $num_rows,
             esc_html($db_error)
         );
         mysqli_stmt_close($stmt);
         return false;
    }

    // Выполняем запрос
    if (!mysqli_stmt_execute($stmt)) {
        $db_error = mysqli_stmt_error($stmt);
        $results['skipped_invalid_data'] += $num_rows;
        $results['errors'][] = sprintf(
            __('Пакетная вставка (%d строк): Ошибка выполнения запроса. Ошибка MySQLi: %s', 'csv-to-db-updater'),
            $num_rows,
            esc_html($db_error)
        );
        mysqli_stmt_close($stmt);
        return false;
    }

    // Успех
    $results['updated'] += $num_rows; // Считаем все строки в успешно выполненном пакете как обновленные/вставленные
    mysqli_stmt_close($stmt);
    return true;
}

/**
 * Вспомогательная функция для подсчета строк данных в CSV (пропускает заголовок).
 * Считает только строки, где первый столбец (SKU) не пустой.
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
    fgetcsv($handle, 0, ";");
    while (($row = fgetcsv($handle, 0, ";")) !== FALSE) {
        // Считаем только строки с непустым SKU в первой колонке
        if (isset($row[0]) && trim($row[0]) !== '') {
             $count++;
        }
    }
    fclose($handle);
    return $count;
}

/**
 * Отображение страницы настроек - Адаптировано под CSV в БД.
 */
function cpu_render_admin_page() {
    global $table_prefix; // Используем глобальный префикс
    $status = get_option(CPU_OPTION_STATUS, 'idle');
    $processed = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $total = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    $skipped_empty = (int) get_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0);
    $results = get_option(CPU_OPTION_RESULTS, []);
    $is_processing = ($status === 'running' || $status === 'pending');
    $table_name = $table_prefix . CPU_DB_TABLE_NAME; // Собираем имя таблицы

    ?>
    <div class="wrap">
        <h1><?php printf(__('Обновление таблицы `%s` из CSV', 'csv-to-db-updater'), esc_html($table_name)); ?></h1>

        <?php settings_errors('cpu_messages'); // Показываем ошибки/сообщения ?>

        <?php // Отображение статуса и прогресса ?>
        <div id="cpu-status-area" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ccc; background: #f9f9f9;">
            <h3><?php esc_html_e('Статус обработки', 'csv-to-db-updater'); ?></h3>
            <div id="cpu-status-message">
                <?php
                if ($is_processing) {
                   esc_html_e('Идет обработка CSV файла...', 'csv-to-db-updater');
                    if ($total > 0) {
                        printf(' (%d / %d)', $processed, $total);
                    }
                } elseif ($status === 'complete') {
                   esc_html_e('Обработка завершена.', 'csv-to-db-updater');
                } elseif ($status === 'error') {
                   esc_html_e('Произошла ошибка во время обработки. См. лог ниже.', 'csv-to-db-updater');
                } else {
                   esc_html_e('Нет активных задач. Вы можете загрузить CSV файл.', 'csv-to-db-updater');
                }
                ?>
            </div>
            <?php // Прогресс бар ?>
            <?php if ($is_processing || $status === 'complete'): ?>
                <div id="cpu-progress-bar-container" style="margin-top: 10px; height: 20px; background: #eee; border-radius: 5px; overflow: hidden; border: 1px solid #ddd;">
                    <div id="cpu-progress-bar" style="width: <?php echo ($total > 0) ? round(($processed / $total) * 100) : ($status === 'complete' ? 100 : 0); ?>%; height: 100%; background: #4caf50; transition: width 0.5s ease; text-align: center; color: white; font-weight: bold; line-height: 20px;">
                         <?php echo ($total > 0) ? round(($processed / $total) * 100) : ($status === 'complete' ? 100 : 0); ?>%
                    </div>
                </div>
            <?php endif; ?>
        </div>

        <?php // Отображение результатов ПОСЛЕ завершения или при ошибке ?>
        <?php if ($status === 'complete' || $status === 'error'): ?>
             <?php if (!empty($results)): ?>
                <div id="message" class="notice notice-<?php echo ($status === 'error' ? 'error' : 'info'); ?> is-dismissible" style="margin-top: 20px;">
                    <p><strong><?php esc_html_e('Результаты последней обработки:', 'csv-to-db-updater'); ?></strong></p>
                    <ul>
                        <li><?php printf(__('Всего строк данных в CSV (с непустым SKU): %d', 'csv-to-db-updater'), isset($results['total_rows']) ? $results['total_rows'] : 0); ?></li>
                        <li><?php printf(__('Обработано строк CSV: %d', 'csv-to-db-updater'), $processed); ?></li>
                        <li><?php printf(__('Пропущено строк CSV с пустым артикулом: %d', 'csv-to-db-updater'), $skipped_empty); ?></li>
                        <li><?php printf(__('Строк успешно добавлено/обновлено в БД: %d', 'csv-to-db-updater'), isset($results['updated']) ? $results['updated'] : 0); ?></li>
                        <li><?php printf(__('Строк с ошибками (БД или неверные данные): %d', 'csv-to-db-updater'), isset($results['skipped_invalid_data']) ? $results['skipped_invalid_data'] : 0); ?></li>
                        <?php if (!empty($results['errors'])) : ?>
                             <li style="margin-top: 10px;"><strong><?php esc_html_e('Лог обработки / Ошибки / Предупреждения:', 'csv-to-db-updater'); ?></strong>
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
                // Сброс статуса после отображения
                // if (!$is_processing) {
                //     update_option(CPU_OPTION_STATUS, 'idle');
                // }
                ?>
             <?php endif; ?>
        <?php endif; ?>


        <hr>

        <h2><?php esc_html_e('Загрузить и обработать новый CSV файл', 'csv-to-db-updater'); ?></h2>
        <p><?php printf(__('Выберите CSV файл для загрузки. Формат: Артикул; Название; Остаток; Цена (разделитель - точка с запятой ";"). Первая строка должна быть заголовком (она будет проигнорирована). Данные будут добавлены или обновлены в таблице `%s`.', 'csv-to-db-updater'), esc_html($table_name)); ?></p>
        <p><strong><?php esc_html_e('Важно: Файл должен быть сохранен в кодировке UTF-8.', 'csv-to-db-updater'); ?></strong></p>
        <?php // Блокируем форму, если идет обработка ?>
        <form method="post" action="options-general.php?page=csv-to-db-updater" enctype="multipart/form-data" <?php if ($is_processing) echo ' style="opacity: 0.5; pointer-events: none;"'; ?>>
            <?php wp_nonce_field('cpu_update_action', 'cpu_nonce'); ?>
             <input type="hidden" name="action" value="upload_and_process">
            <p>
                <label for="csv_file_upload"><?php esc_html_e('Выберите CSV файл:', 'csv-to-db-updater'); ?></label>
                <input type="file" id="csv_file_upload" name="csv_file_upload" accept=".csv" required <?php if ($is_processing) echo ' disabled'; ?>>
            </p>
            <?php submit_button(__('Загрузить и запустить обработку', 'csv-to-db-updater'), 'primary', 'cpu_upload_and_process', false, ($is_processing) ? ['disabled' => true] : null); ?>
             <?php if ($is_processing): ?>
                 <p style="color: orange; font-weight: bold;"><em><?php esc_html_e('Пожалуйста, подождите завершения текущей обработки перед загрузкой нового файла.', 'csv-to-db-updater'); ?></em></p>
             <?php endif; ?>
        </form>

         <hr>
         <h2><?php esc_html_e('Информация о настройках', 'csv-to-db-updater'); ?></h2>
         <p><strong><?php esc_html_e('Важно:', 'csv-to-db-updater'); ?></strong></p>
         <ul>
              <li><?php printf(__('Обновление идет в таблицу БД: %s', 'csv-to-db-updater'), '<code>' . esc_html($table_name) . '</code>'); ?></li>
              <li><?php _e('Метод обновления: <code>REPLACE INTO</code> (требует PRIMARY или UNIQUE ключ на колонке `sku`). Используется <code>mysqli</code>.', 'csv-to-db-updater'); ?></li>
              <li><?php _e('Ожидаемые колонки в CSV (разделитель ";"): <code>sku</code> (Артикул), <code>title</code> (Название), <code>stock</code> (Остаток), <code>price</code> (Цена).', 'csv-to-db-updater'); ?></li>
              <li><?php _e('Строки с пустым значением в колонке `sku` будут пропущены.', 'csv-to-db-updater'); ?></li>
              <li><?php printf(__('Размер пакета чтения CSV (строк за раз): %d', 'csv-to-db-updater'), CPU_BATCH_SIZE); ?></li>
              <li><?php printf(__('Размер пакета записи в БД (строк за запрос): %d', 'csv-to-db-updater'), CPU_DB_BATCH_SIZE); ?></li>
              <li><?php _e('Убедитесь, что CSV файл сохранен в кодировке <strong>UTF-8</strong>.', 'csv-to-db-updater'); ?></li>
              <li><?php _e('Убедитесь, что таблица БД и колонки `sku`, `title` используют кодировку/сортировку <strong>utf8mb4 / utf8mb4_unicode_ci</strong> для корректной работы с разными символами и поиска.', 'csv-to-db-updater'); ?></li>
         </ul>
          <p><em><?php _e('Эти настройки заданы в коде плагина (константы в начале файла).', 'csv-to-db-updater'); ?></em></p>

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
            var cpu_form = $('form[method="post"][enctype="multipart/form-data"]');
            var initial_check_done = false;

            function cpu_check_status() {
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cpu_ajax_get_progress',
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
                                message = '<?php echo esc_js(__('Идет обработка CSV файла...', 'csv-to-db-updater')); ?>';
                                if (data.total > 0) {
                                    message += ' (' + data.processed + ' / ' + data.total + ')';
                                    progress_percent = Math.round((data.processed / data.total) * 100);
                                }
                                if (cpu_progress_bar.length) {
                                    cpu_progress_bar.css('width', progress_percent + '%').text(progress_percent + '%');
                                }
                                cpu_form.css({ 'opacity': '0.5', 'pointer-events': 'none' });
                                cpu_form.find('input, button').prop('disabled', true);
                            } else {
                                if (data.status === 'complete') {
                                    message = '<?php echo esc_js(__('Обработка завершена. Перезагрузка страницы...', 'csv-to-db-updater')); ?>';
                                    progress_percent = 100;
                                } else if (data.status === 'error') {
                                    message = '<?php echo esc_js(__('Произошла ошибка. Перезагрузка страницы...', 'csv-to-db-updater')); ?>';
                                    progress_percent = (data.total > 0) ? Math.round((data.processed / data.total) * 100) : 0;
                                } else {
                                    message = '<?php echo esc_js(__('Статус изменился. Перезагрузка страницы...', 'csv-to-db-updater')); ?>';
                                    progress_percent = (data.total > 0) ? Math.round((data.processed / data.total) * 100) : 0;
                                }
                                
                                if (cpu_progress_bar.length) {
                                    cpu_progress_bar.css('width', progress_percent + '%').text(progress_percent + '%');
                                }

                                clearInterval(cpu_interval_id);
                                setTimeout(function() {
                                    location.reload();
                                }, 1500);
                            }

                            cpu_status_message.html(message);
                        } else {
                            console.error('AJAX Error:', response.data);
                            cpu_status_message.text('<?php echo esc_js(__('Ошибка обновления статуса (AJAX).', 'csv-to-db-updater')); ?>');
                        }
                        initial_check_done = true;
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        console.error('AJAX Request Failed:', textStatus, errorThrown);
                        cpu_status_message.text('<?php echo esc_js(__('Ошибка сети при обновлении статуса.', 'csv-to-db-updater')); ?>');
                        initial_check_done = true;
                    }
                });
            }

            // Запускаем первую проверку сразу
            cpu_check_status();
            // Устанавливаем интервал проверки каждые 2 секунды вместо 5
            cpu_interval_id = setInterval(cpu_check_status, 2000);
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
        wp_send_json_error(__('У вас нет прав.', 'csv-to-db-updater'), 403);
    }

    $status = get_option(CPU_OPTION_STATUS, 'idle');
    $processed = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $total = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    $skipped_empty = (int) get_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0);

    wp_send_json_success([
        'status' => $status,
        'processed' => $processed,
        'total' => $total,
        'skipped_empty' => $skipped_empty,
    ]);
}
add_action('wp_ajax_cpu_ajax_get_progress', 'cpu_ajax_get_progress');

?>