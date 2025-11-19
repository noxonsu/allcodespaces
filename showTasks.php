<?php

include("wp-config.php"); // Подключаем конфигурацию WordPress

$db = new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME);

// Устанавливаем кодировку соединения
$db->set_charset("utf8mb4");

// *** Префикс таблиц (ОБЯЗАТЕЛЬНО ИЗМЕНИТЕ, ЕСЛИ У ВАС ДРУГОЙ ПРЕФИКС, НЕ wp_hababru_) ***
$table_prefix = 'wp_hababru_'; // *** ВАЖНО! ИСПОЛЬЗУЙТЕ ВАШ ПРЕФИКС! ***

?>
<script>
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        //alert('Описание задачи скопировано в буфер обмена');
    }).catch(err => {
        console.error('Ошибка копирования: ', err);
    });
}
</script>
<?php

// SQL-запрос для извлечения категорий, описаний и ID
$sql = "SELECT
            t.term_id,
            t.name AS category_name,
            tt.description AS task_description,
            tt.parent AS parent_id
        FROM
            {$table_prefix}terms AS t
        INNER JOIN
            {$table_prefix}term_taxonomy AS tt ON t.term_id = tt.term_id
        WHERE
            tt.taxonomy = 'category'
        ORDER BY
            t.term_id"; // Сортировка по term_id для порядка


$result = $db->query($sql);

if ($result === false) {
    die("<b>Ошибка SQL запроса!</b> Смотрите custom_log сервера для деталей.<br>" . $db->error);
}

if ($result->num_rows > 0) {
    echo "<h2>Список категорий и задач (описаний) из базы данных:</h2>";
    echo "<pre>"; //  Для лучшего форматирования текста

    $categories = []; // Массив для хранения категорий, индексированный по term_id

    // Первая проход:  Собираем все категории в массив
    while ($row = $result->fetch_assoc()) {
        $categories[$row['term_id']] = [
            'name' => $row['category_name'],
            'description' => $row['task_description'],
            'parent_id' => $row['parent_id'],
            'children' => [] // Массив для хранения ID дочерних категорий
        ];
    }
    $result->free_result(); // Освобождаем память

    // Второй проход: Строим иерархию, добавляя ID дочерних категорий к родительским
    foreach ($categories as $term_id => &$category) { // Используем ссылку &$category
        $parent_id = $category['parent_id'];
        if ($parent_id != 0 && isset($categories[$parent_id])) {
            $categories[$parent_id]['children'][] = $term_id; // Добавляем ID ребенка к родителю
        }
    }
    unset($category); // Важно разорвать ссылку после цикла foreach(&)

    // Функция для рекурсивного вывода дерева категорий
    function display_category_tree($categories, $parent_id = 0, $indent = '') {
        foreach ($categories as $term_id => $category) {
            if ($category['parent_id'] == $parent_id) {
                echo $indent . "- ID: " . $term_id . ", Категория: " . $category['name'] . "<br>";
                
                // Split description into lines and create clickable elements for each
                $descriptions = explode("\n", $category['description']);
                foreach ($descriptions as $description) {
                    $description = trim($description);
                    if (!empty($description)) {
                        $escaped_description = htmlspecialchars($description, ENT_QUOTES);
                        echo $indent . "  Задача: <span class='task-description' 
                            onclick='copyToClipboard(\"" . $escaped_description . "\")' 
                            style='cursor: pointer; color: blue; text-decoration: underline;'>" 
                            . $escaped_description . "</span><br>";
                    }
                }
                
                if (!empty($category['children'])) {
                    display_category_tree($categories, $term_id, $indent . "  ");
                }
            }
        }
    }

    display_category_tree($categories); // Выводим дерево, начиная с корневых (parent_id = 0)

    echo "</pre>"; // Закрываем <pre>
} else {
    echo "<p>В базе данных не найдено категорий.</p>";
}

$db->close();

?>