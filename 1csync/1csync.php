<?php
/**
 * Plugin Name: CSV to Database Updater (priceandstocks) - Background Processing
 * Description: Загружает CSV файл (Артикул, Описание, Остаток, Цена) и обновляет/добавляет данные в таблицу `priceandstocks` с использованием REPLACE INTO. Обработка в фоновом режиме.
 * Version: 3.2
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
define('CPU_BATCH_SIZE', 500); // Сколько строк CSV обрабатывать за один запуск WP-Cron
define('CPU_CRON_HOOK', 'cpu_run_csv_to_db_batch_hook'); // Имя хука для WP-Cron
// --- КОНЕЦ НАСТРОЕК ---

// --- Удалена функция cpu_get_default_csv_path() ---

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
 * Функция, выполняющая один шаг фоновой обработки CSV в БД.
 */
function cpu_run_csv_to_db_batch() {
    global $wpdb;
    $table_name = $wpdb->prefix . CPU_DB_TABLE_NAME;

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
        // Опционально: удалить файл
        // if (!empty($filepath) && file_exists($filepath)) { wp_delete_file($filepath); }
        // update_option(CPU_OPTION_FILEPATH, '');
        return;
    }

    // Устанавливаем статус "в процессе"
    update_option(CPU_OPTION_STATUS, 'running');

    @set_time_limit(300); // Увеличиваем лимит времени для этого скрипта

    $rows_in_this_batch = 0;
    $handle = fopen($filepath, "r"); // Открываем ЗАГРУЖЕННЫЙ файл

    if ($handle === FALSE) {
        $results['errors'][] = __('Критическая ошибка: Не удалось открыть CSV файл для обработки в фоновом режиме.', 'csv-to-db-updater');
        update_option(CPU_OPTION_RESULTS, $results);
        update_option(CPU_OPTION_STATUS, 'error');
        wp_clear_scheduled_hook(CPU_CRON_HOOK);
        // Не удаляем файл, чтобы можно было посмотреть
        return;
    }

    // Пропускаем заголовок и уже обработанные строки
    for ($i = 0; $i <= $processed_rows; $i++) { // <= пропустить processed_rows + заголовок
        if (feof($handle)) break;
        fgets($handle); // Читаем строку, чтобы сдвинуть указатель
    }

    // Обрабатываем пакет строк
    while (($row = fgetcsv($handle, 0, ";")) !== FALSE && $rows_in_this_batch < CPU_BATCH_SIZE) {
        $current_row_index = $processed_rows + $rows_in_this_batch; // Индекс текущей строки данных (0-based)
        $rows_in_this_batch++;
        $results['processed_in_run'] = $rows_in_this_batch; // Обновляем счетчик для лога этого запуска

        // --- Логика обработки ОДНОЙ строки CSV для записи в БД ---
        // Ожидаемый формат: Артикул (sku), Описание (ignored), Остаток (stock), Цена (price)
        if (count($row) < 4) { // Проверяем наличие как минимум 4 колонок
            $results['skipped_invalid_data']++;
            $results['errors'][] = sprintf(__('Строка %d (CSV): Недостаточно колонок (%d). Ожидалось как минимум 4.', 'csv-to-db-updater'), $current_row_index + 2, count($row)); // +1 за 0-based, +1 за заголовок
            continue;
        }

        // Извлекаем данные из строки
        $sku = isset($row[0]) ? trim($row[0]) : '';
        // $description = isset($row[1]) ? trim($row[1]) : ''; // Описание игнорируется
        $stock_raw = isset($row[2]) ? trim($row[2]) : '';
        $price_raw = isset($row[3]) ? trim($row[3]) : ''; // Цена теперь в 4-й колонке (индекс 3)

        // Проверяем наличие SKU
        if (empty($sku)) {
            $skipped_empty_sku++; // Увеличиваем общий счетчик пропущенных пустых SKU
            // Не логируем каждую пустую строку индивидуально
            continue;
        }

        // Очистка и подготовка данных
        $price = preg_replace('/[^\d,\.]/', '', $price_raw); // Удаляем все кроме цифр, запятых, точек
        $price = str_replace(',', '.', $price); // Заменяем запятую на точку для float/decimal
        $price = floatval($price); // Или использовать number_format для DECIMAL

        $stock = !empty($stock_raw) ? intval(preg_replace('/[^\d]/', '', $stock_raw)) : 0; // Удаляем все нецифровое перед intval

        // Используем $wpdb->replace()
        // Требует, чтобы таблица имела PRIMARY KEY или UNIQUE индекс на 'sku'
        $data_to_replace = [
            'sku'   => $sku,
            'price' => $price, // Убедитесь, что тип колонки price в БД совместим (DECIMAL, FLOAT, VARCHAR)
            'stock' => $stock, // Убедитесь, что тип колонки stock в БД - INT
        ];
        $format = [
            '%s', // sku - строка
            '%f', // price - float (или %s если VARCHAR, или %d если DECIMAL без дробной части)
            '%d'  // stock - integer
        ];

        $replace_result = $wpdb->replace($table_name, $data_to_replace, $format);

        if ($replace_result === false) {
            // Ошибка при выполнении REPLACE
            $results['skipped_invalid_data']++;
            $results['errors'][] = sprintf(
                __('Строка %d (CSV): Ошибка при обновлении/вставке в БД для SKU "%s". Ошибка WPDB: %s', 'csv-to-db-updater'),
                $current_row_index + 2,
                esc_html($sku),
                esc_html($wpdb->last_error)
            );
        } else {
            // Успешно добавлено (1) или обновлено (2). Иногда может вернуть 0, если данные не изменились.
            // Считаем любой неотрицательный результат успехом.
            $results['updated']++;
            // Лог успеха можно раскомментировать для отладки
            // $results['errors'][] = sprintf(__('Строка %d (CSV): Успешно обработан SKU "%s". Цена: %s, Остаток: %d. (Результат REPLACE: %s)', 'csv-to-db-updater'), $current_row_index + 2, esc_html($sku), $price, $stock, $replace_result);
        }
        // --- Конец логики обработки ОДНОЙ строки ---

    } // end while batch

    fclose($handle);

    // Обновляем общее количество обработанных строк и счетчик пустых SKU
    $new_processed_count = $processed_rows + $rows_in_this_batch;
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
        // Опционально: удалить файл
        // if (file_exists($filepath)) { wp_delete_file($filepath); }
        // update_option(CPU_OPTION_FILEPATH, '');
    } else {
        // Еще есть строки, планируем следующий запуск
        wp_schedule_single_event(time() + 1, CPU_CRON_HOOK); // Небольшая задержка
        update_option(CPU_OPTION_STATUS, 'running'); // Убедимся, что статус все еще running
    }
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
    $status = get_option(CPU_OPTION_STATUS, 'idle');
    $processed = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $total = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    $skipped_empty = (int) get_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0);
    $results = get_option(CPU_OPTION_RESULTS, []);
    $is_processing = ($status === 'running' || $status === 'pending');
    $table_name = $GLOBALS['wpdb']->prefix . CPU_DB_TABLE_NAME;

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
                        <li><?php printf(__('Всего строк данных в CSV (с непустым SKU): %d', 'csv-to-db-updater'), $results['total_rows']); ?></li>
                        <li><?php printf(__('Обработано строк CSV: %d', 'csv-to-db-updater'), $processed); ?></li>
                        <li><?php printf(__('Пропущено строк CSV с пустым артикулом: %d', 'csv-to-db-updater'), $skipped_empty); ?></li>
                        <li><?php printf(__('Строк успешно добавлено/обновлено в БД: %d', 'csv-to-db-updater'), $results['updated']); ?></li>
                        <li><?php printf(__('Строк с ошибками (БД или неверные данные): %d', 'csv-to-db-updater'), $results['skipped_invalid_data']); ?></li>
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
        <p><?php printf(__('Выберите CSV файл для загрузки. Формат: Артикул; Описание; Остаток; Цена (разделитель - точка с запятой ";"). Первая строка должна быть заголовком (она будет проигнорирована). Данные будут добавлены или обновлены в таблице `%s`. Колонка "Описание" будет проигнорирована.', 'csv-to-db-updater'), esc_html($table_name)); ?></p>
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
              <li><?php _e('Метод обновления: <code>$wpdb->replace()</code> (требует PRIMARY или UNIQUE ключ на колонке `sku`).', 'csv-to-db-updater'); ?></li>
              <li><?php _e('Ожидаемые колонки в CSV (разделитель ";"): <code>sku</code> (Артикул), <code>description</code> (Описание - игнорируется), <code>stock</code> (Остаток), <code>price</code> (Цена).', 'csv-to-db-updater'); ?></li>
              <li><?php _e('Строки с пустым значением в колонке `sku` будут пропущены.', 'csv-to-db-updater'); ?></li>
              <li><?php printf(__('Размер пакета обработки (строк CSV за раз): %d', 'csv-to-db-updater'), CPU_BATCH_SIZE); ?></li>
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
            var cpu_form = $('form[method="post"][enctype="multipart/form-data"]'); // Находим форму загрузки
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
                                clearInterval(cpu_interval_id);
                                setTimeout(function() {
                                     location.reload();
                                }, 1500);

                                if (data.status === 'complete') {
                                    message = '<?php echo esc_js(__('Обработка завершена. Перезагрузка страницы...', 'csv-to-db-updater')); ?>';
                                    progress_percent = 100;
                                } else if (data.status === 'error') {
                                    message = '<?php echo esc_js(__('Произошла ошибка. Перезагрузка страницы...', 'csv-to-db-updater')); ?>';
                                    progress_percent = (data.total > 0) ? Math.round((data.processed / data.total) * 100) : 0; // Оставляем прогресс на момент ошибки
                                } else {
                                     message = '<?php echo esc_js(__('Статус изменился. Перезагрузка страницы...', 'csv-to-db-updater')); ?>';
                                     progress_percent = (data.total > 0) ? Math.round((data.processed / data.total) * 100) : 0; // Показываем прогресс на момент смены статуса
                                }
                                if (cpu_progress_bar.length) {
                                     cpu_progress_bar.css('width', progress_percent + '%').text(progress_percent + '%');
                                }
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

            cpu_interval_id = setInterval(cpu_check_status, 5000);
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


// --- Старые функции удалены ---

?>