<?php
/**
 * Plugin Name: Database Product Updater (for Details CPT) - Background Processing
 * Description: Обновляет цену и наличие для постов типа "Запчасти" (details) из таблицы `piceandstocks` по артикулу. Использует ACF поля. Обработка в фоновом режиме.
 * Version: 2.0
 * Author: Noxon
 * Text Domain: db-product-updater
 * Domain Path: /languages
 */

defined('ABSPATH') or die('No script kiddies please!');

// --- НАСТРОЙКИ ---
// Имя таблицы в базе данных WordPress
define('CPU_DB_TABLE_NAME', 'piceandstocks'); // <--- Убедитесь, что имя таблицы верное

// --- НАСТРОЙКИ ДЛЯ CPT 'details' И ACF ---
// Тип поста для поиска (из вашего functions.php)
define('CPU_POST_TYPES', 'details');
// Ключ поля ACF для артикула (проверьте точное имя поля в ACF).
define('CPU_SKU_ACF_KEY', 'artikul');
// !!! ВАЖНО: Укажите ТОЧНЫЙ ключ поля ACF для ЦЕНЫ !!!
define('CPU_PRICE_ACF_KEY', 'price'); // <--- ЗАМЕНИТЕ 'price', ЕСЛИ КЛЮЧ ДРУГОЙ
// !!! ВАЖНО: Укажите ТОЧНЫЙ ключ поля ACF для ОСТАТКА !!!
define('CPU_STOCK_ACF_KEY', 'stock'); // <--- ЗАМЕНИТЕ 'stock', ЕСЛИ КЛЮЧ ДРУГОЙ

// --- НАСТРОЙКИ ФОНОВОЙ ОБРАБОТКИ ---
// Ключи для хранения состояния в опциях WordPress
define('CPU_OPTION_STATUS', 'cpu_db_import_status'); // 'idle', 'pending', 'running', 'complete', 'error'
// define('CPU_OPTION_FILEPATH', 'cpu_import_filepath'); // Больше не используется
define('CPU_OPTION_TOTAL_ROWS', 'cpu_db_import_total_rows');
define('CPU_OPTION_PROCESSED_ROWS', 'cpu_db_import_processed_rows');
define('CPU_OPTION_RESULTS', 'cpu_db_import_results');
define('CPU_OPTION_SKIPPED_EMPTY_SKU', 'cpu_db_skipped_empty_sku'); // Новая опция
// define('CPU_BATCH_SIZE', 1000); // Убрано, обрабатываем все сразу для маленькой таблицы
define('CPU_CRON_HOOK', 'cpu_run_db_process_hook'); // Имя хука для WP-Cron
// --- КОНЕЦ НАСТРОЕК ---

// --- Удалена функция cpu_get_default_csv_path() ---

/**
 * Регистрация страницы настроек.
 */
function cpu_register_admin_page() {
    add_options_page(
        __('DB Details Update', 'db-product-updater'),
        __('DB Details Update', 'db-product-updater'),
        'manage_options',
        'db-product-updater', // Изменен slug страницы
        'cpu_render_admin_page'
    );
}
add_action('admin_menu', 'cpu_register_admin_page');

/**
 * Обработка отправки формы - ЗАПУСК ФОНОВОГО ПРОЦЕССА ИЗ БД.
 */
function cpu_handle_form_submission() {
    // Проверяем nonce и права доступа
    if (!isset($_POST['cpu_nonce']) || !wp_verify_nonce($_POST['cpu_nonce'], 'cpu_update_action')) {
       return;
    }
    if (!current_user_can('manage_options')) {
       wp_die(__('У вас нет прав для выполнения этой операции.', 'db-product-updater'));
    }

    $redirect_url = admin_url('options-general.php?page=db-product-updater'); // Обновлен slug

    // Проверяем, не идет ли уже обработка
    $current_status = get_option(CPU_OPTION_STATUS, 'idle');
    if ($current_status === 'running' || $current_status === 'pending') {
        add_settings_error('cpu_messages', 'cpu_already_running', __('Ошибка: Предыдущая обработка еще не завершена. Дождитесь ее окончания.', 'db-product-updater'), 'error');
        wp_redirect($redirect_url);
        exit;
    }

    // Обработка ЗАПУСКА ОБНОВЛЕНИЯ ИЗ БД
    if (isset($_POST['cpu_start_db_update'])) {
        global $wpdb;
        $table_name = $wpdb->prefix . CPU_DB_TABLE_NAME; // Добавляем префикс WordPress

        // Проверяем существование таблицы (базовая проверка)
        // Для MySQL: SHOW TABLES LIKE 'table_name'
        // Для $wpdb: $wpdb->get_var("SHOW TABLES LIKE '$table_name'") == $table_name
        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table_name)) != $table_name) {
             add_settings_error('cpu_messages', 'cpu_table_not_found', sprintf(__('Ошибка: Таблица `%s` не найдена в базе данных.', 'db-product-updater'), esc_html($table_name)), 'error');
             wp_redirect($redirect_url);
             exit;
        }

        // Считаем общее количество строк в таблице
        $total_rows = (int) $wpdb->get_var("SELECT COUNT(*) FROM `$table_name`");

        if ($total_rows === 0) {
             add_settings_error('cpu_messages', 'cpu_table_empty', sprintf(__('Таблица `%s` пуста. Нет данных для обработки.', 'db-product-updater'), esc_html($table_name)), 'warning');
        } else {
            // Очищаем предыдущие запланированные задачи (на всякий случай)
            wp_clear_scheduled_hook(CPU_CRON_HOOK);

            // Сохраняем состояние для фоновой задачи
            update_option(CPU_OPTION_STATUS, 'pending'); // Статус "ожидает запуска"
            // update_option(CPU_OPTION_FILEPATH, ''); // Больше не используется
            update_option(CPU_OPTION_TOTAL_ROWS, $total_rows);
            update_option(CPU_OPTION_PROCESSED_ROWS, 0);
            update_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0); // Сбрасываем счетчик пустых SKU
            update_option(CPU_OPTION_RESULTS, [
                'total_rows' => $total_rows, // Общее количество строк в таблице
                'processed_in_run' => 0, // Сколько обработано (будет равно total_rows после одного запуска)
                'updated' => 0,
                'skipped_not_found' => 0,
                'skipped_invalid_data' => 0, // Может использоваться для ошибок обновления ACF
                'errors' => []
            ]); // Сбрасываем результаты

            // Планируем ОДИН запуск WP-Cron немедленно
            wp_schedule_single_event(time(), CPU_CRON_HOOK);

            add_settings_error('cpu_messages', 'cpu_process_scheduled', sprintf(__('Найдено %d строк в таблице `%s`. Обработка запущена в фоновом режиме.', 'db-product-updater'), $total_rows, esc_html($table_name)), 'info');
        }
        wp_redirect($redirect_url);
        exit;
    }
}
add_action('admin_init', 'cpu_handle_form_submission');

/**
 * Хук для WP-Cron.
 */
add_action(CPU_CRON_HOOK, 'cpu_process_db_table');

/**
 * Функция, выполняющая обработку данных из таблицы БД.
 */
function cpu_process_db_table() {
    global $wpdb;
    $table_name = $wpdb->prefix . CPU_DB_TABLE_NAME;

    // Получаем текущие значения (хотя для одного запуска они будут 0)
    $total_rows = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    // $processed_rows = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0); // Не нужен для одного прохода
    $results = get_option(CPU_OPTION_RESULTS, []);
    $skipped_empty_sku = 0; // Локальный счетчик

    // Проверяем базовые условия
    if ($total_rows === 0) {
        update_option(CPU_OPTION_STATUS, 'idle'); // Сбрасываем статус
        wp_clear_scheduled_hook(CPU_CRON_HOOK);
        return;
    }

    // Устанавливаем статус "в процессе"
    update_option(CPU_OPTION_STATUS, 'running');

    @set_time_limit(300); // Увеличиваем лимит времени
    wp_defer_term_counting(true);
    wp_defer_comment_counting(true);
    wp_suspend_cache_invalidation(true);

    $post_types = explode(',', CPU_POST_TYPES);
    $post_types = array_map('trim', $post_types);

    // Получаем ВСЕ строки из таблицы
    $db_rows = $wpdb->get_results($wpdb->prepare("SELECT sku, price, stock FROM `$table_name`"));

    if ($db_rows === null) { // Проверка на ошибку SQL
        $results['errors'][] = sprintf(__('Критическая ошибка: Не удалось получить данные из таблицы `%s`. Ошибка WPDB: %s', 'db-product-updater'), esc_html($table_name), esc_html($wpdb->last_error));
        update_option(CPU_OPTION_RESULTS, $results);
        update_option(CPU_OPTION_STATUS, 'error');
        wp_clear_scheduled_hook(CPU_CRON_HOOK);
        wp_defer_term_counting(false);
        wp_defer_comment_counting(false);
        wp_suspend_cache_invalidation(false);
        return;
    }

    $processed_count = 0; // Счетчик обработанных строк в этом запуске

    // Обрабатываем строки
    foreach ($db_rows as $index => $row) {
        $processed_count++;
        $current_row_index = $index; // Индекс текущей строки (0-based)

        // --- Логика обработки ОДНОЙ строки из БД ---

        // Извлекаем данные из строки БД
        $sku = isset($row->sku) ? trim($row->sku) : '';
        $price_raw = isset($row->price) ? trim($row->price) : '';
        $stock_raw = isset($row->stock) ? trim($row->stock) : ''; // stock уже должен быть int из БД

        // Проверяем наличие SKU
        if (empty($sku)) {
            $skipped_empty_sku++;
            // Не логируем каждую пустую строку индивидуально
            continue;
        }

        // --- Поиск поста ТОЛЬКО по артикулу (ACF поле) ---
        $post_id = null;
        $found_by = '';

        // Используем LIKE для поиска по артикулу
        $args_sku = [
            'post_type' => $post_types,
            'post_status' => 'any', // Искать во всех статусах
            'posts_per_page' => 1, // Нам нужен только один пост
            'meta_query' => [
                [
                    'key' => CPU_SKU_ACF_KEY,
                    'value' => $sku,
                    'compare' => 'LIKE', // Ищем по частичному совпадению, если нужно точное, измените на '='
                ],
            ],
            'fields' => 'ids', // Получаем только ID
            'suppress_filters' => true,
            'cache_results' => false,
            'update_post_meta_cache' => false,
            'update_post_term_cache' => false,
        ];
        $found_posts_sku = get_posts($args_sku);

        if (!empty($found_posts_sku)) {
            $post_id = $found_posts_sku[0];
            $found_by = 'ACF Key LIKE (' . CPU_SKU_ACF_KEY . ')';
        } else {
             // Поиск по имени убран, так как в таблице нет имени
             $results['skipped_not_found']++;
             // Лог "не найдено" можно раскомментировать
             // $results['errors'][] = sprintf(__('Строка %d (БД): Пост не найден по Артикулу (LIKE) "%s".', 'db-product-updater'), $current_row_index + 1, esc_html($sku));
             continue; // Переходим к следующей строке БД
        }


        // --- Обновление метаданных ACF, если пост найден ---
        if ($post_id) {
            try {
                // Очистка и подготовка цены (из varchar)
                $price = preg_replace('/[^\d,\.]/', '', $price_raw);
                $price = str_replace(',', '.', $price);
                $price = floatval($price);

                // Очистка и подготовка остатка (из int)
                // Если stock из БД может быть не числом, добавить очистку
                $stock = intval($stock_raw); // Прямое преобразование, т.к. тип int(11)

                // Обновляем мета-поля ACF
                update_field(CPU_PRICE_ACF_KEY, $price, $post_id);
                update_field(CPU_STOCK_ACF_KEY, $stock, $post_id);

                $results['updated']++;

                // Лог успешного обновления (опционально)
                // $edit_link = admin_url('post.php?post=' . $post_id . '&action=edit');
                // $results['errors'][] = sprintf(
                //     __('Строка %d (БД): Обновлен пост "%s" (ID: %d). Артикул: %s. Цена: %s, Остаток: %d. <a href="%s" target="_blank">Ред.</a>', 'db-product-updater'),
                //     $current_row_index + 1, esc_html(get_the_title($post_id)), $post_id, esc_html($sku), wc_price($price), $stock, esc_url($edit_link)
                // );

            } catch (Exception $e) {
                 $results['skipped_invalid_data']++; // Считаем ошибку обновления как invalid_data
                 $results['errors'][] = sprintf(__('Строка %d (БД) (Пост ID: %d, Артикул: %s): Исключение при обновлении ACF полей - %s', 'db-product-updater'), $current_row_index + 1, $post_id, esc_html($sku), $e->getMessage());
            }
        }
        // --- Конец логики обработки ОДНОЙ строки ---

    } // end foreach db_rows

    // Обновляем итоговые значения
    update_option(CPU_OPTION_PROCESSED_ROWS, $processed_count);
    update_option(CPU_OPTION_SKIPPED_EMPTY_SKU, $skipped_empty_sku);
    $results['processed_in_run'] = $processed_count; // Сколько всего обработано

    // Завершение
    update_option(CPU_OPTION_STATUS, 'complete');
    $results['errors'][] = sprintf(__('Обработка таблицы `%s` успешно завершена.', 'db-product-updater'), esc_html($table_name));
    if ($skipped_empty_sku > 0) {
        $results['errors'][] = sprintf(__('Пропущено строк с пустым артикулом (SKU): %d', 'db-product-updater'), $skipped_empty_sku);
    }
    update_option(CPU_OPTION_RESULTS, $results);
    wp_clear_scheduled_hook(CPU_CRON_HOOK); // Убираем крон задачу (на всякий случай)

    wp_defer_term_counting(false);
    wp_defer_comment_counting(false);
    wp_suspend_cache_invalidation(false);
    wp_cache_flush();
}


// --- Удалена функция cpu_count_csv_rows() ---


/**
 * Отображение страницы настроек - Адаптировано под БД.
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
        <h1><?php printf(__('Обновление Запчастей (details) из таблицы `%s`', 'db-product-updater'), esc_html($table_name)); ?></h1>

        <?php settings_errors('cpu_messages'); // Показываем ошибки/сообщения ?>

        <?php // Отображение статуса и прогресса ?>
        <div id="cpu-status-area" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ccc; background: #f9f9f9;">
            <h3><?php _e('Статус обработки', 'db-product-updater'); ?></h3>
            <div id="cpu-status-message">
                <?php
                if ($is_processing) {
                    _e('Идет обработка...', 'db-product-updater');
                    // Прогресс для одного запуска не так информативен, но оставим
                    if ($total > 0) {
                        // Показываем 0 / total пока не завершится
                        printf(' (%d / %d)', $status === 'running' ? $processed : 0, $total);
                    }
                } elseif ($status === 'complete') {
                    _e('Обработка завершена.', 'db-product-updater');
                } elseif ($status === 'error') {
                    _е('Произошла ошибка во время обработки. См. лог ниже.', 'db-product-updater');
                } else {
                    _е('Нет активных задач. Вы можете запустить обновление.', 'db-product-updater');
                    
                }
                ?>
            </div>
            <?php // Прогресс бар можно оставить, он покажет 0% или 100% ?>
            <?php if ($is_processing || $status === 'complete'): ?>
                <div id="cpu-progress-bar-container" style="margin-top: 10px; height: 20px; background: #eee; border-radius: 5px; overflow: hidden; border: 1px solid #ddd;">
                    <div id="cpu-progress-bar" style="width: <?php echo ($status === 'complete') ? 100 : (($total > 0 && $status === 'running') ? round(($processed / $total) * 100) : 0); ?>%; height: 100%; background: #4caf50; transition: width 0.5s ease; text-align: center; color: white; font-weight: bold; line-height: 20px;">
                         <?php echo ($status === 'complete') ? 100 : (($total > 0 && $status === 'running') ? round(($processed / $total) * 100) : 0); ?>%
                    </div>
                </div>
            <?php endif; ?>
        </div>

        <?php // Отображение результатов ПОСЛЕ завершения или при ошибке ?>
        <?php if ($status === 'complete' || $status === 'error'): ?>
             <?php if (!empty($results)): ?>
                <div id="message" class="notice notice-<?php echo ($status === 'error' ? 'error' : 'info'); ?> is-dismissible" style="margin-top: 20px;">
                    <p><strong><?php _е('Результаты последней обработки:', 'db-product-updater'); ?></strong></p>
                    <ul>
                        <li><?php printf(__('Всего строк в таблице `%s`: %d', 'db-product-updater'), esc_html($table_name), $results['total_rows']); ?></li>
                        <li><?php printf(__('Обработано строк: %d', 'db-product-updater'), $processed); ?></li>
                        <li><?php printf(__('Пропущено строк с пустым артикулом: %d', 'db-product-updater'), $skipped_empty); ?></li>
                        <li><?php printf(__('Найдено и обновлено постов: %d', 'db-product-updater'), $results['updated']); ?></li>
                        <li><?php printf(__('Постов не найдено по артикулу (пропущено): %d', 'db-product-updater'), $results['skipped_not_found']); ?></li>
                        <li><?php printf(__('Ошибок обновления ACF (пропущено): %d', 'db-product-updater'), $results['skipped_invalid_data']); ?></li>
                        <?php if (!empty($results['errors'])) : ?>
                             <li style="margin-top: 10px;"><strong><?php _е('Лог обработки / Ошибки / Предупреждения:', 'db-product-updater'); ?></strong>
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
                // Сброс статуса после отображения, чтобы можно было запустить снова
                // if (!$is_processing) {
                //     update_option(CPU_OPTION_STATUS, 'idle');
                //     // Можно очистить результаты, если не нужно их хранить
                //     // update_option(CPU_OPTION_RESULTS, []);
                //     // update_option(CPU_OPTION_PROCESSED_ROWS, 0);
                //     // update_option(CPU_OPTION_TOTAL_ROWS, 0);
                //     // update_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0);
                // }
                ?>
             <?php endif; ?>
        <?php endif; ?>


        <hr>

        <h2><?php _е('Запустить обновление из базы данных', 'db-product-updater'); ?></h2>
        <p><?php printf(__('Нажмите кнопку ниже, чтобы запустить процесс обновления цен и остатков для постов типа "%s" из таблицы `%s`.', 'db-product-updater'), esc_html(CPU_POST_TYPES), esc_html($table_name)); ?></p>
        <p><?php _е('Поиск постов будет осуществляться по полю ACF артикула.', 'db-product-updater'); ?></p>
        <?php // Блокируем форму, если идет обработка ?>
        <form method="post" action="options-general.php?page=db-product-updater" <?php if ($is_processing) echo ' style="opacity: 0.5; pointer-events: none;"'; ?>>
            <?php wp_nonce_field('cpu_update_action', 'cpu_nonce'); ?>
            <?php submit_button(__('Запустить обновление из БД', 'db-product-updater'), 'primary', 'cpu_start_db_update', false, ($is_processing) ? ['disabled' => true] : null); ?>
             <?php if ($is_processing): ?>
                 <p style="color: orange; font-weight: bold;"><em><?php _е('Пожалуйста, подождите завершения текущей обработки.', 'db-product-updater'); ?></em></p>
             <?php endif; ?>
        </form>

         <hr>
         <h2><?php _е('Информация о настройках', 'db-product-updater'); ?></h2>
         <p><strong><?php _е('Важно:', 'db-product-updater'); ?></strong></p>
         <ul>
              <li><?php printf(__('Обновление идет из таблицы БД: %s', 'db-product-updater'), '<code>' . esc_html($table_name) . '</code>'); ?></li>
              <li><?php printf(__('Поиск будет производиться по типу поста: %s', 'db-product-updater'), '<code>' . esc_html(CPU_POST_TYPES) . '</code>'); ?></li>
              <li><?php printf(__('Поле ACF для поиска артикула (SKU): %s (используется поиск LIKE)', 'db-product-updater'), '<code>' . esc_html(CPU_SKU_ACF_KEY) . '</code>'); ?></li>
              <li><?php printf(__('Поле ACF для обновления цены: %s', 'db-product-updater'), '<code>' . esc_html(CPU_PRICE_ACF_KEY) . '</code>'); ?> </li>
               <li><?php printf(__('Поле ACF для обновления остатка: %s', 'db-product-updater'), '<code>' . esc_html(CPU_STOCK_ACF_KEY) . '</code>'); ?> </li>
               <li><?php _е('Строки с пустым значением в колонке `sku` будут пропущены.', 'db-product-updater'); ?></li>
               <?php /* <li><?php printf(__('Размер пакета обработки (строк за раз): %d', 'db-product-updater'), CPU_BATCH_SIZE); ?></li> */ ?>
               <li><?php _е('Обработка выполняется за один проход (оптимизировано для небольших таблиц).', 'db-product-updater'); ?></li>
         </ul>
          <p><em><?php _е('Эти настройки заданы в коде плагина (константы в начале файла).', 'db-product-updater'); ?></em></p>

    </div>
    <?php
    // Добавляем JavaScript для AJAX-опроса, только если обработка активна
    if ($is_processing) {
        cpu_add_ajax_script();
    }
}

/**
 * Добавляет JavaScript для опроса статуса.
 * (Незначительные изменения для адаптации сообщений)
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
            var cpu_form = $('form[method="post"]'); // Находим форму запуска
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
                                message = '<?php echo esc_js(__('Идет обработка...', 'db-product-updater')); ?>';
                                if (data.total > 0) {
                                    // Показываем 0 / total пока не завершится
                                    message += ' (' + (data.status === 'running' ? data.processed : 0) + ' / ' + data.total + ')';
                                    progress_percent = (data.status === 'running' && data.total > 0) ? Math.round((data.processed / data.total) * 100) : 0;
                                }
                                if (cpu_progress_bar.length) {
                                    cpu_progress_bar.css('width', progress_percent + '%').text(progress_percent + '%');
                                }
                                cpu_form.css({ 'opacity': '0.5', 'pointer-events': 'none' });
                                cpu_form.find('input[type="submit"], button').prop('disabled', true);

                            } else {
                                clearInterval(cpu_interval_id);
                                setTimeout(function() {
                                     location.reload();
                                }, 1500);

                                if (data.status === 'complete') {
                                    message = '<?php echo esc_js(__('Обработка завершена. Перезагрузка страницы...', 'db-product-updater')); ?>';
                                    progress_percent = 100;
                                } else if (data.status === 'error') {
                                    message = '<?php echo esc_js(__('Произошла ошибка. Перезагрузка страницы...', 'db-product-updater')); ?>';
                                    progress_percent = (data.total > 0) ? Math.round((data.processed / data.total) * 100) : 0; // Оставляем прогресс на момент ошибки
                                } else {
                                     message = '<?php echo esc_js(__('Статус изменился. Перезагрузка страницы...', 'db-product-updater')); ?>';
                                }
                                if (cpu_progress_bar.length) {
                                     cpu_progress_bar.css('width', progress_percent + '%').text(progress_percent + '%');
                                }
                            }

                            cpu_status_message.html(message);

                        } else {
                            console.error('AJAX Error:', response.data);
                            cpu_status_message.text('<?php echo esc_js(__('Ошибка обновления статуса (AJAX).', 'db-product-updater')); ?>');
                        }
                        initial_check_done = true;
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        console.error('AJAX Request Failed:', textStatus, errorThrown);
                        cpu_status_message.text('<?php echo esc_js(__('Ошибка сети при обновлении статуса.', 'db-product-updater')); ?>');
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
        wp_send_json_error(__('У вас нет прав.', 'db-product-updater'), 403);
    }

    $status = get_option(CPU_OPTION_STATUS, 'idle');
    $processed = (int) get_option(CPU_OPTION_PROCESSED_ROWS, 0);
    $total = (int) get_option(CPU_OPTION_TOTAL_ROWS, 0);
    $skipped_empty = (int) get_option(CPU_OPTION_SKIPPED_EMPTY_SKU, 0); // Добавлено

    wp_send_json_success([
        'status' => $status,
        'processed' => $processed,
        'total' => $total,
        'skipped_empty' => $skipped_empty, // Добавлено
    ]);
}
add_action('wp_ajax_cpu_ajax_get_progress', 'cpu_ajax_get_progress');


// --- Старая функция cpu_process_csv_file() удалена ---

?>