<?php
function himpartners_enqueue() {
    wp_enqueue_style('swiper', get_template_directory_uri() . '/src/styles/swiper.css');
    wp_enqueue_style('bootstrap', get_template_directory_uri() . '/src/styles/bootstrap.css');
    wp_enqueue_style('style', get_template_directory_uri() . '/src/styles/style.css');
    wp_enqueue_style('index', get_template_directory_uri() . '/src/styles/index.css');
    wp_enqueue_script('wavesurfer', get_template_directory_uri() . '/src/scripts/wavesurfer.js', array(), false, true);
    wp_enqueue_script('swiper', get_template_directory_uri() . '/src/scripts/swiper.js', array(), false, true);
    wp_enqueue_script('header', get_template_directory_uri() . '/src/scripts/header.js', array(), false, true);
    wp_enqueue_script('index', get_template_directory_uri() . '/src/scripts/index.js', array(), false, true);
}
add_action('wp_enqueue_scripts', 'himpartners_enqueue');

// Регистрируем пользовательский тип записи для АБС-гранул
function register_abs_granules_post_type() {
    register_post_type('abs_granules', array(
        'labels' => array(
            'name' => 'АБС-гранулы',
            'singular_name' => 'АБС-гранула',
        ),
        'public' => true,
        'has_archive' => true,
        'supports' => array('title', 'editor', 'thumbnail', 'custom-fields'),
    ));
}
add_action('init', 'register_abs_granules_post_type');

// Регистрируем пользовательский тип записи для аудио-отзывов
function register_audio_reviews_post_type() {
    register_post_type('audio_reviews', array(
        'labels' => array(
            'name' => 'Аудио-отзывы',
            'singular_name' => 'Аудио-отзыв',
        ),
        'public' => true,
        'has_archive' => true,
        'supports' => array('title', 'custom-fields'),
    ));
}
add_action('init', 'register_audio_reviews_post_type');

// Добавляем метабокс для загрузки аудио
function add_audio_metabox() {
    add_meta_box(
        'audio_file_box',
        'Аудио файл',
        'audio_file_box_html',
        'audio_reviews'
    );
    
    // Подключаем скрипты медиа библиотеки WordPress
    wp_enqueue_media();
}
add_action('add_meta_boxes', 'add_audio_metabox');

// HTML для метабокса
function audio_file_box_html($post) {
    $value = get_post_meta($post->ID, 'audio_file', true);
    ?>
    <div>
        <input type="text" 
               id="audio_file" 
               name="audio_file" 
               value="<?php echo esc_attr($value); ?>" 
               style="width: 100%"
        />
        <button type="button" 
                class="upload_audio_button button" 
                style="margin-top: 10px;"
        >
            Выбрать аудио файл
        </button>
    </div>
    <script type="text/javascript">
    jQuery(document).ready(function($){
        $('.upload_audio_button').click(function(e) {
            e.preventDefault();
            
            if (typeof wp !== 'undefined' && wp.media && wp.media.editor) {
                var custom_uploader = wp.media({
                    title: 'Выберите аудио файл',
                    button: {
                        text: 'Выбрать'
                    },
                    multiple: false,
                    library: {
                        type: 'audio'
                    }
                });

                custom_uploader.on('select', function() {
                    var attachment = custom_uploader.state().get('selection').first().toJSON();
                    $('#audio_file').val(attachment.url.replace('http:', 'https:'));
                });

                custom_uploader.open();
            }
        });
    });
    </script>
    <?php
}

// Сохраняем значение поля
function save_audio_file($post_id) {
    if (array_key_exists('audio_file', $_POST)) {
        update_post_meta(
            $post_id,
            'audio_file',
            $_POST['audio_file']
        );
    }
}
add_action('save_post', 'save_audio_file');

// Регистрируем пользовательский тип записи для письменных отзывов
function register_written_reviews_post_type() {
    register_post_type('written_reviews', array(
        'labels' => array(
            'name' => 'Письменные отзывы',
            'singular_name' => 'Письменный отзыв',
        ),
        'public' => true,
        'has_archive' => true,
        'supports' => array('title', 'editor', 'thumbnail', 'custom-fields'),
    ));
}
add_action('init', 'register_written_reviews_post_type');

function him_customize_register($wp_customize) {
    // Add new section
    $wp_customize->add_section('him_social_links', array(
        'title' => 'Социальные сети',
        'priority' => 30,
    ));

    // Add WhatsApp setting
    $wp_customize->add_setting('him_whatsapp_link', array(
        'default' => '',
        'sanitize_callback' => 'esc_url_raw',
    ));

    $wp_customize->add_control('him_whatsapp_link', array(
        'label' => 'Ссылка WhatsApp',
        'section' => 'him_social_links',
        'type' => 'url',
    ));

    // Add Telegram setting
    $wp_customize->add_setting('him_telegram_link', array(
        'default' => '',
        'sanitize_callback' => 'esc_url_raw',
    ));

    $wp_customize->add_control('him_telegram_link', array(
        'label' => 'Ссылка Telegram',
        'section' => 'him_social_links',
        'type' => 'url',
    ));
}
add_action('customize_register', 'him_customize_register');

// Register Certificates Custom Post Type
function register_certificates_post_type() {
    $labels = array(
        'name' => 'Сертификаты',
        'singular_name' => 'Сертификат',
        'add_new' => 'Добавить новый',
        'add_new_item' => 'Добавить новый сертификат',
        'edit_item' => 'Редактировать сертификат',
        'new_item' => 'Новый сертификат',
        'view_item' => 'Просмотреть сертификат',
        'search_items' => 'Искать сертификаты',
        'not_found' => 'Сертификаты не найдены',
        'not_found_in_trash' => 'В корзине сертификаты не найдены'
    );

    $args = array(
        'labels' => $labels,
        'public' => true,
        'has_archive' => true,
        'menu_icon' => 'dashicons-awards',
        'supports' => array('title', 'thumbnail'),
        'menu_position' => 5
    );

    register_post_type('certificates', $args);
}
add_action('init', 'register_certificates_post_type');
?>
