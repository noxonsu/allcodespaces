<?php get_header(); 

$images = get_field('gallary-product');
?>

    <div class="over">
        <div class="fixed">
            <div class="cont-flex">
            <?php if(!wp_is_mobile()){ ?>
                <?php get_sidebar('left'); ?>
            <?php }?>
                <div class="content">
                    <div class="block light-wrapper tovar-block">
                        <ul class="number-block">
                            <li class="active">01</li>
                            <li>02</li>
                            <li>03</li>
                            <li>04</li>
                            <li>05</li>
                        </ul>
                        <div class="light">
                            <div class="breadcrumb">
                                <?php
                                if (function_exists('bcn_display')) {
                                    bcn_display();
                                } ?>
                            </div>
                            <h1 class="tovar-title"><?php the_field('brend'); ?></h1>
                            <?php if(!wp_is_mobile()){ ?>
                            <div class="columns-detailed-2">
                                <b>Для оформления заказа</b> заполните <a class="open-popup-checkout" href="">форму
                                    запроса</a> или свяжитесь с нами по телефону: <span><a href="tel:88005119180">8-800-511-91-80</a></span>
                            </div>
                            
                            <?php }?>
                            <div class="slider-tovar">
                                <?php while (have_posts()) : the_post(); ?>
                                    <div class="st-pic">
                                        <div class="slider-for">
                                            <?php if (isset($images) && $images != ""): foreach ($images as $image): ?>
                                                <div class="item">
                                                    <a class="lightbox-pic" href="<?php echo $image['url']; ?>"
                                                       data-lightbox="lightbox" data-title="">
                                                        <img src="<?php echo $image['url']; ?>"
                                                             alt="<?php echo $image['alt']; ?>"/>
                                                    </a>
                                                </div>
                                            <?php endforeach; endif; ?>
                                        </div>
                                    </div>
                                    <div class="st-info">
                                        <div class="st-carusel">
                                            <div class="slider-nav">
                                                <?php if (isset($images) && $images != ""): foreach ($images as $image): ?>
                                                    <div class="item-img">
                                                        <img src="<?php echo $image['url']; ?>"
                                                             alt="<?php echo $image['alt']; ?>"/>
                                                    </div>
                                                <?php endforeach; endif; ?>

                                            </div>
                                        </div>
                                        
                                             <?php
global $wpdb;
$table_name = $wpdb->prefix . CPU_DB_TABLE_NAME; // Используем константу для имени таблицы
$artikul = get_field('artikul'); // Получаем артикул

$price = null;
$stock = null;

// Проверяем, есть ли артикул
if (!empty($artikul)) {
    // Подготавливаем варианты артикула для поиска
    $artikul_original = $artikul;
    $artikul_alternative = $artikul; // По умолчанию равен оригиналу

    // Если артикул начинается с '0' и имеет больше одного символа,
    // создаем версию без ведущих нулей.
    if (strpos($artikul_original, '0') === 0 && strlen($artikul_original) > 1) {
        $artikul_alternative = ltrim($artikul_original, '0');
    }
    // Если артикул НЕ начинается с '0', но является числом,
    // можно создать версию с ведущим нулем (на случай, если в базе он хранится так).
    // Закомментировано, т.к. запрос был только про удаление ведущего нуля.
    /*
    else if (ctype_digit($artikul_original) && $artikul_original !== '0') {
         $artikul_alternative = '0' . $artikul_original;
    }
    */

    // Если артикулы отличаются, ищем по обоим. Иначе - только по одному.
    if ($artikul_original !== $artikul_alternative) {
        // Ищем по обоим вариантам, используя IN.
        // ORDER BY FIELD гарантирует, что если найдены оба, предпочтение отдается оригинальному артикулу.
        $query = $wpdb->prepare(
            "SELECT price, stock FROM `{$table_name}` WHERE sku IN (%s, %s) ORDER BY FIELD(sku, %s, %s) LIMIT 1",
            $artikul_original,
            $artikul_alternative,
            $artikul_original, // Приоритет для оригинального артикула
            $artikul_alternative
        );
    } else {
        // Ищем только по оригинальному артикулу
        $query = $wpdb->prepare(
            "SELECT price, stock FROM `{$table_name}` WHERE sku = %s",
            $artikul_original
        );
    }

    $result = $wpdb->get_row($query);

    // Если результат найден, извлекаем цену и остаток
    if ($result) {
        // Проверяем, что цена не пустая и больше нуля (или другое условие по необходимости)
        if (isset($result->price) && is_numeric($result->price) && $result->price > 0) {
             // Форматируем цену, например, с двумя знаками после запятой
            $price = number_format((float)$result->price, 2, ',', ' ');
        }
        // Проверяем, что остаток не пустой и больше нуля (или другое условие)
        if (isset($result->stock) && is_numeric($result->stock) && $result->stock > 0) {
            $stock = (int)$result->stock;
        }
    }
}
?>

<div class="over">


<?php
// ...existing code...

$artikul = get_field('artikul'); // Получаем артикул товара
 
//echo "==".$artikul."==";
$current_price = null;
$current_stock = null;

// Путь к последнему загруженному CSV файлу из опций плагина
$csv_filepath = get_option('cpu_csv_to_db_filepath');

if (!empty($artikul) && !empty($csv_filepath) && file_exists($csv_filepath)) {
    // Подготавливаем варианты артикула для поиска
    $artikul_original = $artikul;
    $artikul_alternative = $artikul;

    // Если артикул начинается с '0' и имеет больше одного символа,
    // создаем версию без ведущих нулей
    if (strpos($artikul_original, '0') === 0 && strlen($artikul_original) > 1) {
        $artikul_alternative = ltrim($artikul_original, '0');
    }

    // Открываем файл
    if (($handle = fopen($csv_filepath, "r")) !== FALSE) {
        // Пропускаем заголовок
        fgetcsv($handle, 0, ";");
        
        // Ищем строку с нужным SKU
        while (($row = fgetcsv($handle, 0, ";")) !== FALSE) {
            $row_sku = trim($row[0]);
            // Проверяем оба варианта артикула
		
            if (isset($row[0]) && ($row_sku === $artikul_original || $row_sku === $artikul_alternative)) {
                // Нашли нужную строку
                $current_stock = isset($row[2]) ? intval(preg_replace('/[^\d]/', '', trim($row[2]))) : 0;
                $price_raw = isset($row[3]) ? trim($row[3]) : '';
                $current_price = preg_replace('/[^\d,\.]/', '', $price_raw);
                $current_price = str_replace(',', '.', $current_price);
                $current_price = floatval($current_price);
                break;
            }
        }
        fclose($handle);
    }
}

// Выводим результат

// Determine if price and stock should be displayed based on conditions
// Price is valid if it's not null and greater than 0
$display_price = !is_null($current_price) && $current_price > 0;
// Stock is valid if it's not null and greater than 0
$display_stock = !is_null($current_stock) && $current_stock > 0;

// Always display the article number if it exists
if (!empty($artikul)): ?>
    <div class="artikul-info">Артикул: <?php echo esc_html($artikul); ?></div>
<?php endif; ?>

<?php // Only display the price/stock container if there's something to show (either price or stock)
if ($display_price || $display_stock): ?>
    <div class="price-stock-info">
        <?php // Display price info only if price is valid
        if ($display_price): ?>
            <div class="price">Цена с НДС: <?php echo number_format($current_price, 2, ',', ' '); ?> руб.</div>
        <?php endif; ?>

        <?php // Display stock info only if stock is valid and greater than 0
        if ($display_stock): ?>
            <div class="stock">Остаток: <?php echo (int)$current_stock; ?> шт.</div>
        <?php endif; ?>
    </div>
<?php endif; ?>

</div>                                    
                                        
                                        <div class="over">
                                            <a class="backward" href="/">Обратно</a>
                                            <a id="request" class="make-request open-request" href="/"><span>Оформить запрос</span></a>
                                        </div>
                                    </div>
                                <?php endwhile;
                                wp_reset_query(); ?>
                            </div>
                            <div class="request-block">
                                <form class="request-flex ajax-mail">
                                    <div class="rf-tf">
                                        <input class="rf-text-field" name="name" type="text" placeholder="Имя"/>
                                    </div>
                                    <div class="rf-tf">
                                        <input class="rf-text-field mask" name="phone" type="text" placeholder="8 (...)"/>
                                    </div>
                                    <div class="rf-tf">
                                        <input class="rf-text-field" type="text" name="email" placeholder="E-mail"/>
                                    </div>
                                    <div class="rf-ar">
                                        <textarea class="rf-textarea" name="text" placeholder="Комментарий"><?php echo esc_html('Здравствуйте! Меня интересует запчасть "' . get_field('brend') . ', ' . get_field('model') . '". Просьба сообщить стоимость, сроки и условия поставки.')?></textarea>
                                    </div>
                                    <div class="captcha-block">
                                        Укажите ответ:
                                        <div class="captcha-pic">
                                            <span class="capch-numbers"></span>
                                            <span class="captcha-refresh"></span>
                                        </div>
                                        <input class="rf-text-field capcha-value" type="text" placeholder="Поле ввода">
                                    </div>
                                    <input type="submit" name="submit-captcha" class=" rf-sub" value="Оформить запрос">
                                    <input type="hidden" name="form" value="Оформить запрос"/>
									<div class="politic"><input type="checkbox" name="check" checked="">Нажимая кнопку "Отправить", я принимаю условия <a href="/politika-konfidentsialnosti">Политики конфиденциальности</a> и даю согласие на обработку моих персональных данных</div>
								</form>
                            </div>
                           

                            <div class="separator"></div>

                            <div class="tabs">
                                <ul class="bookmark tovar-tabs">
                                    <li>Описание</li>
                                    <li>Параметры</li>
                                    <li>Размеры</li>
                            <?php if(!empty(get_field('video'))){?>
                                     <li>Видео</li>
                            <?php }?>
                                </ul>
                                <div class="bookmarker-box">
                                    <div class="tovar-description"><?php the_field('description'); ?></div>
                                </div>
                                <div class="bookmarker-box">
                                    <div class="tovar-description"><?php the_field('options'); ?></div>
                                </div>
                                <div class="bookmarker-box">
                                    <div class="tovar-description"><?php the_field('sizes'); ?></div>
                                </div>
                            <?php if(!empty(get_field('video'))){?>
                                <div class="bookmarker-box">
                                <div class="tovar-description" style="text-align:center;">
                                <?php if(!empty(get_field('video'))){?>
                                <div class="part">

                                <iframe width="100%" height="315" src="<? the_field('video');?>" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                                </div>
                                <?php }?>
                                <?php if(!empty(get_field('video_2'))){?>
                                <div class="part">
                                <iframe width="100%" height="315" src="<? the_field('video_2');?>" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                                </div>
                                <?php }?>
                                                        </div>
                                <?php }?>
                            </div>
                            <?php if(wp_is_mobile()){ ?>
                            <div class="columns-detailed-2">
                                <b>Для оформления заказа</b> заполните <a class="open-popup-checkout" href="">форму
                                    запроса</a> или свяжитесь с нами по телефону: <span><a href="tel:88005119180">8-800-511-91-80</a></span>
                            </div>    
                            <?php }?>

                            <div class="separator"></div>
                            <?php
                            $post_id = get_the_ID();
                            $cur_terms = get_terms(array(
                                'taxonomy' => 'category_model',
                                'object_ids' => $post_id,
                                'childless' => true,
                            ));
                            if(count($cur_terms) != 0) :?>

                            <h3 class="title"><span><b>Подходит для</b></span></h3>

                            <div class="tovar-flex tovar-flex-title">
                                <div><span>Т</span>ехника/ модель</div>
                                <div><span>Н</span>аименование:</div>
                                <div><span>Н</span>омер:</div>
                            </div>
                            <div class="scroll-tovar">
                                <?php
                                $post_id = get_the_ID();
                                $cur_terms = get_terms(array(
                                    'taxonomy' => 'category_model',
                                    'object_ids' => $post_id,
                                    'childless' => true,
                                ));
                                foreach ($cur_terms as $term) {
                                    ?>
                                    <div class="tovar-flex-row">
                                        <div class="tovar-flex">
                                            <div><?php echo $term->name; ?><a class="link-tovar" href="<?php echo get_term_link((int)$term->term_id,'category_model') ?>"></a>
                                            </div>
                                            <div><?php echo the_title() ?></div>
                                            <div><?php the_field('artikul'); ?></div>
                                        </div>
                                    </div>
                                <?php } ?>
                                <?php  wp_reset_postdata(); ?>
                            </div>
                            <?php endif; if(wp_is_mobile()){ ?>
                            <?php get_sidebar('left'); ?>
                            <?php }?>
                        </div>
                    </div>
                    <div class="block dark-wrapper">
                        <ul class="number-block">
                            <li>01</li>
                            <li>02</li>
                            <li class="active">03</li>
                            <li>04</li>
                            <li>05</li>
                        </ul>
                        <div class="dark">
                            <h3 class="title"><span><b>Правила покупки</b></span></h3>
                            <div class="columns">
                                <?php the_field('rules', 5); ?>
                            </div>
                        </div>

                    </div>
                    <div class="block gray-wrapper scheme-work">
                        <ul class="number-block">
                            <li>01</li>
                            <li>02</li>
                            <li>03</li>
                            <li class="active">04</li>
                            <li>05</li>
                        </ul>
                        <div class="gray">
                            <h3 class="title"><span><b>Схема работы</b></span></h3>
                            <ul class="scheme-list">
                                <li>
                                    <div class="step-number">01</div>
                                    <div class="scheme-pic"><img
                                                src="<?php echo get_template_directory_uri(); ?>/images/scheme-pic_1.png"
                                                width="73" height="56" alt=""/></div>
                                    <p>Выбор запчасти</p>
                                </li>
                                <li>
                                    <div class="step-number">02</div>
                                    <div class="scheme-pic"><img
                                                src="<?php echo get_template_directory_uri(); ?>/images/scheme-pic_2.png"
                                                width="73" height="55" alt=""/></div>
                                    <p>Заказ на сайте</p>
                                </li>
                                <li>
                                    <div class="step-number">03</div>
                                    <div class="scheme-pic"><img
                                                src="<?php echo get_template_directory_uri(); ?>/images/scheme-pic_3.png"
                                                width="73" height="58" alt=""/></div>
                                    <p>Звонок<br/> менеджера</p>
                                </li>
                                <li>
                                    <div class="step-number">04</div>
                                    <div class="scheme-pic"><img
                                                src="<?php echo get_template_directory_uri(); ?>/images/scheme-pic_4.png"
                                                width="73" height="56" alt=""/></div>
                                    <p>Согласование и<br/> уточнение спецификации</p>
                                </li>
                                <li>
                                    <div class="step-number">05</div>
                                    <div class="scheme-pic"><img
                                                src="<?php echo get_template_directory_uri(); ?>/images/scheme-pic_5.png"
                                                width="73" height="58" alt=""/></div>
                                    <p>Оформление<br/> заказа</p>
                                </li>
                                <li>
                                    <div class="step-number">06</div>
                                    <div class="scheme-pic"><img
                                                src="<?php echo get_template_directory_uri(); ?>/images/scheme-pic_6.png"
                                                width="73" height="52" alt=""/></div>
                                    <p>Доставка заказа</p>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <div class="block dark-wrapper">
                        <ul class="number-block">
                            <li>01</li>
                            <li>02</li>
                            <li>03</li>
                            <li>04</li>
                            <li class="active">05</li>
                        </ul>
                        <div class="dark">
                            <h3 class="title title-small"><span><b>Вы смотрели</b></span></h3>
                            <div class="news-slider">
                                <div class="flexslider">
                                    <ul class="slides">
                                        <?php if ($_COOKIE['viewedProd']) {
                                            foreach ($_COOKIE['viewedProd'] as $viewedProdId) {
                                                //var_dump($viewedProd);
                                                $viewedProd = get_post($viewedProdId);
                                                if ($viewedProd->post_type == "details") { ?>
                                                    <li>
                                                        <div class="news-flex part-element">
                                                            <div class="viewed-item">
                                                                <a href="#"
                                                                   style="color: transparent;"
                                                                   class="choice-item choice-element"><?php echo $viewedProd->post_title; ?></a>
                                                                <span class="del-item"></span>
                                                                <a href="<?php echo $viewedProd->guid; ?>" class="viewed-pic"><?php echo $thumb = get_the_post_thumbnail($viewedProd, 'post-thumbnails'); ?></a>
                                                                <a href="<?php echo $viewedProd->guid; ?>" class="viewed-title">
                                                                    <span></span><?php echo $viewedProd->post_title; ?>
                                                                </a>
                                                                <p ><?php echo get_post_meta($viewedProd->ID, 'brend', 1); ?></p>
                                                                <a class="  make-request open-popup-checkout"
                                                                   href="#"><span>Оформить запрос</span></a>
                                                            </div>
                                                        </div>
                                                    </li>
                                                <?php }
                                            }
                                        } ?>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="gray-wrapper call-back mar">
                        <div class="gray">
                            <h3 class="title"><span><b>Мы вам перезвоним</b></span></h3>
                            <form class=" ajax-mail">
								<div class="cb-form">
									<input class="cb-text-field " name="name" type="text" placeholder="Имя"/>
									<input class="cb-text-field mask " name="phone" type="text" placeholder="+7 (...)"/>
									<input class=" request-call" type="submit" value="Заказать звонок"/>
									<input type="hidden" name="form" value="Заказать звонок"/>
									</div>
								<div class="politic"><input type="checkbox" name="check" checked="">Нажимая кнопку "Отправить", я принимаю условия <a href="/politika-konfidentsialnosti">Политики конфиденциальности</a> и даю согласие на обработку моих персональных данных</div>
							</form> 
						 </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
<?php get_footer(); ?>
