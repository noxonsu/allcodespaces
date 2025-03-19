<?php

include("wp-config.php"); // Подключаем конфигурацию WordPress
include("wp-load.php"); // Добавляем wp-load для доступа к функциям WordPress

$db = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME);

// Устанавливаем кодировку соединения
$db->set_charset("utf8mb4");

// *** Префикс таблиц (ОБЯЗАТЕЛЬНО ИЗМЕНИТЕ, ЕСЛИ У ВАС ДРУГОЙ ПРЕФИКС, НЕ wp_hababru_) ***
$table_prefix = 'wp_hababru_'; // *** ВАЖНО! ИСПОЛЬЗУЙТЕ ВАШ ПРЕФИКС! ***

// SQL запрос для получения постов с их focus keywords
$sql = "
    SELECT 
        p.ID,
        p.post_title,
        pm.meta_value as focus_keyword
    FROM 
        {$table_prefix}posts p
    INNER JOIN 
        {$table_prefix}postmeta pm ON p.ID = pm.post_id
    WHERE 
        pm.meta_key = '_yoast_wpseo_focuskw'
        AND p.post_status = 'publish'
    ORDER BY 
        p.post_title ASC
";

$result = $db->query($sql);

if ($result === false) {
    die("Ошибка запроса: " . $db->error);
}

echo "prompt: размнож ссылки, верни форомат csv URL;Keywords;Anchor text ( без Title). Title только для справки, для каждоый ссылки попробуй сделать два или три дополнительных варианта с anchor <br>\n";
// Выводим ссылки в формате: URL #a#anchor#/a# (Title)
while ($row = $result->fetch_assoc()) {
    $post_id = $row['ID'];
    $permalink = get_permalink($post_id);
    $focus_keyword = $row['focus_keyword'];
    $title = $row['post_title'];
    
    if (!empty($focus_keyword)) {
        echo esc_url($permalink) . " #a#" . esc_html($focus_keyword) . "#/a# (" . esc_html($title) . ")\n";
    }
}

$result->free_result();
$db->close();

// Создаем директорию для split-файлов если её нет
$split_dir = 'split_files';
if (!file_exists($split_dir)) {
    if (!@mkdir($split_dir, 0755, true)) {
        die("Ошибка создания директории $split_dir");
    }
}

// Проверяем существование и читаемость CSV файла
$csv_file = 'habab_sp.csv';
if (!file_exists($csv_file)) {
    die("Файл $csv_file не найден");
}

if (!is_readable($csv_file)) {
    die("Файл $csv_file недоступен для чтения");
}

// Читаем оригинальный CSV файл с обработкой ошибок
$lines = @file($csv_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if ($lines === false) {
    die("Ошибка чтения файла $csv_file");
}

$total_lines = count($lines);
$links_per_file = 40;
$total_files = ceil($total_lines / $links_per_file);

// Разбиваем на файлы по 40 ссылок
for ($i = 0; $i < $total_files; $i++) {
    $start = $i * $links_per_file;
    $chunk = array_slice($lines, $start, $links_per_file);
    $filename = $split_dir . '/links_' . ($i + 1) . '.csv';
    
    if (!@file_put_contents($filename, implode("\n", $chunk))) {
        die("Ошибка записи в файл $filename");
    }
}

// 
echo "<h3>Ссылки для скачивания:</h3>\n";
for ($i = 1; $i <= $total_files; $i++) {
    $filename = 'links_' . $i . '.csv';
    $filepath = $split_dir . '/' . $filename;
    if (file_exists($filepath) && is_readable($filepath)) {
        $num_lines = count(file($filepath));
        echo "<a href='" . esc_url($split_dir . '/' . $filename) . "' download>" . 
             "Скачать " . esc_html($filename) . " (" . $num_lines . " ссылок)</a><br>\n";
    }
}
