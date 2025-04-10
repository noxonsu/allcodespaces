<?php
// Подключаем WordPress
require_once('wp-load.php');

// Проверяем, что скрипт запущен из командной строки или через админку
if (!defined('ABSPATH')) {
    die('Этот скрипт должен запускаться через WordPress или CLI.');
}

// Функция для создания категории, если она не существует
function create_category_if_not_exists($cat_name, $cat_slug) {
    $cat_id = term_exists($cat_name, 'category');
    if (!$cat_id) {
        $cat_id = wp_insert_term($cat_name, 'category', array('slug' => $cat_slug));
        if (!is_wp_error($cat_id)) {
            echo "Создана категория: $cat_name (slug: $cat_slug)\n";
            return $cat_id['term_id'];
        } else {
            echo "Ошибка при создании категории $cat_name.\n";
            return false;
        }
    } else {
        echo "Категория $cat_name уже существует.\n";
        return $cat_id['term_id'];
    }
}

// Функция для загрузки изображения и привязки его к посту
function upload_and_attach_image($image_path, $post_id) {
    if (!file_exists($image_path)) {
        echo "Изображение $image_path не найдено.\n";
        return false;
    }

    $upload_dir = wp_upload_dir();
    $image_data = file_get_contents($image_path);
    $filename = basename($image_path);
    $file = $upload_dir['path'] . '/' . $filename;

    file_put_contents($file, $image_data);

    $attachment = array(
        'post_mime_type' => mime_content_type($image_path),
        'post_title'     => sanitize_file_name($filename),
        'post_content'   => '',
        'post_status'    => 'inherit',
    );

    $attach_id = wp_insert_attachment($attachment, $file, $post_id);
    require_once(ABSPATH . 'wp-admin/includes/image.php');
    $attach_data = wp_generate_attachment_metadata($attach_id, $file);
    wp_update_attachment_metadata($attach_id, $attach_data);

    set_post_thumbnail($post_id, $attach_id);
    echo "Изображение $filename прикреплено к посту ID $post_id.\n";
    return $attach_id;
}

// Функция для создания поста, если он не существует
function create_post_if_not_exists($title, $date, $category_id, $image_path) {
    $post = get_page_by_title($title, OBJECT, 'post');
    if (!$post) {
        $post_data = array(
            'post_title'    => $title,
            'post_content'  => 'Контент для выставки ' . $title, // Можно добавить описание
            'post_status'   => 'publish',
            'post_type'     => 'post',
            'post_author'   => 1,
            'post_date'     => $date,
            'post_category' => array($category_id),
        );
        $post_id = wp_insert_post($post_data);
        if ($post_id && !empty($image_path)) {
            upload_and_attach_image($image_path, $post_id);
        }
        echo "Создана запись: $title (дата: $date)\n";
        return $post_id;
    } else {
        echo "Запись $title уже существует.\n";
        return $post->ID;
    }
}

// Создаём категорию "expo"
$expo_category_id = create_category_if_not_exists('expo', 'expo');

// Создаём посты для категории "expo"
$expos = array(
    array(
        'title' => 'Экспо «ХимПартнёры» провели более 100 встреч и выступили на RUPLASTICA 2025',
        'date'  => '2025-01-27 00:00:00',
        'image' => WP_CONTENT_DIR . '/themes/hims/src/assets/images/article-2.png',
    ),
    array(
        'title' => '«ХимПартнёры» провели более 100 встреч и выступили на RUPLASTICA 2025',
        'date'  => '2025-01-27 00:00:00',
        'image' => WP_CONTENT_DIR . '/themes/hims/src/assets/images/article-3.png',
    ),
    array(
        'title' => '«ХимПартнёры» провели более 100 встреч и выступили на RUPLASTICA 2025',
        'date'  => '2025-01-27 00:00:00',
        'image' => WP_CONTENT_DIR . '/themes/hims/src/assets/images/article-2.png',
    ),
    array(
        'title' => '«ХимПартнёры» провели более 100 встреч и выступили на RUPLASTICA 2025',
        'date'  => '2025-01-27 00:00:00',
        'image' => WP_CONTENT_DIR . '/themes/hims/src/assets/images/article-3.png',
    ),
    array(
        'title' => '«ХимПартнёры» провели более 100 встреч и выступили на RUPLASTICA 2025',
        'date'  => '2025-01-27 00:00:00',
        'image' => WP_CONTENT_DIR . '/themes/hims/src/assets/images/article-3.png',
    ),
);

foreach ($expos as $expo) {
    create_post_if_not_exists($expo['title'], $expo['date'], $expo_category_id, $expo['image']);
}

echo "✅ Настройка выставок завершена. Проверьте записи в админ-панели WordPress.\n";
?>
