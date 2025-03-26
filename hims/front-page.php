<?php
get_header(); ?>
<style>
.him-in-stock__list-item {
    height: 100%;
}
</style>
<main class="him-main">
    <div class="him-banner">
        <div class="him-container position-relative h-100">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/granules.png" alt="" class="him-banner__granuls position-absolute">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/bags.png" alt="" class="him-banner__bags position-absolute">
            <p class="him-banner__info position-absolute mb-0">* Внешний вид товара и его упаковки может отличаться от фотографий на сайте!</p>
            <div class="him-banner__text position-absolute d-flex flex-column gap-4">
                <div class="d-flex flex-column">
                    <div class="d-flex align-items-center">
                        <h1 class="fs-1 fw-light text-uppercase him-banner__text-green m-0">Купите</h1>
                        <h1 class="fs-1 fw-bold text-uppercase him-banner__text-yellow m-0">АБС гранулы</h1>
                    </div>
                    <h1 class="fs-1 fw-light text-uppercase him-banner__text-green m-0">Выгодные оптовые цены</h1>
                    <h1 class="fs-1 fw-light text-uppercase him-banner__text-green m-0">Высокое подтвержденное</h1>
                    <h1 class="fs-1 fw-light text-uppercase him-banner__text-green m-0">качество!</h1>
                </div>
                <div class="him-banner__text-letto d-flex flex-column flex-lg-row align-items-start align-items-sm-center gap-4">
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/lotte.svg" alt="">
                    <p class="m-0 text-start text-sm-center text-lg-start">Мы — официальный дистрибьютор<br>
                        LOTTE CHEMICAL (Южная Корея).<br>
                        Различные цвета и марки.<br>
                        Для экструзии и литья под давлением.<br>
                    </p>
                </div>
                <div class="him-always-in-stock d-flex flex-column gap-2 gap-sm-3">
                        <div class="d-flex align-items-center">
                            <span class="him-always-in-stock__circle">1</span>
                            <h4 class="fs-4 fw-bold text-uppercase position-relative mb-0">Всегда в наличии на складе!</h4>
                        </div>
                        <div class="d-flex align-items-center">
                            <span class="him-always-in-stock__circle">2</span>
                            <p class="mb-0">Широкий ассортимент цветов и марок. 
                                Для литья под давлением и экструзии!
                            </p>
                        </div>
                        <div class="d-flex align-items-center">
                            <span class="him-always-in-stock__circle">3</span>
                            <p class="mb-0">23 года опыта. Высокое качество АБС гранул!</p>
                        </div>
                    </div>
            </div>
        </div>
    </div>

    <div class="him-running-line w-100">
        <div class="swiper" id="him-running-line">
            <div class="swiper-wrapper">
                <div class="swiper-slide him-running-line__slide">
                    <p>РАЗЛИЧНЫЕ ЦВЕТА И МАРКИ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>ДЛЯ ЭКСТРУЗИИ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>ДЛЯ ЛИТЬЯ ПОД ДАВЛЕНИЕМ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>РАЗЛИЧНЫЕ ЦВЕТА И МАРКИ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>ДЛЯ ЭКСТРУЗИИ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>ДЛЯ ЛИТЬЯ ПОД ДАВЛЕНИЕМ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>РАЗЛИЧНЫЕ ЦВЕТА И МАРКИ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>ДЛЯ ЭКСТРУЗИИ</p>
                </div>
                <div class="swiper-slide him-running-line__slide">
                    <p>ДЛЯ ЛИТЬЯ ПОД ДАВЛЕНИЕМ</p>
                </div>
            </div>
        </div>
    </div>

    <div class="container">
        <div class="him-reputation d-flex flex-column align-items-center" id="about">
            <div class="d-flex flex-column align-items-center gap-3 him-reputation__title">
                <h1 class="fs-1 fw-light text-uppercase text-center mb-0">Компания с <span class="fw-bold">безупречной репутацией</span></h1>
                <p class="m-0 text-center">Основанная в 2001 году, компания «ХимПартнеры» уверенно закрепила за собой репутацию надёжного поставщика, войдя в престижный рейтинг ICIS TOP 100 крупнейших мировых дистрибьютеров химии и сырья.</p>
            </div>
            <div class="him-reputation__info d-flex flex-column flex-lg-row align-items-center justify-content-between gap-3 gap-lg-1 position-relative w-100">
                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/feather.svg" alt="" class="position-absolute feather-left">
                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/feather.svg" alt="" class="position-absolute feather-right">
                <div class="d-flex gap-4">
                    <div class="d-flex flex-column align-items-center gap-2 px-3 him-reputation__info-item">
                        <h1 class="fw-light text-uppercase mb-0">2001</h1>
                        <span class="fw-semibold text-uppercase">год</span>
                        <p class="m-0 fw-semibold text-center">Дата нашего основания</p>
                    </div>
                    <div class="d-flex flex-column align-items-center gap-2 ps-3 px-3 him-reputation__info-item">
                        <h1 class="fw-light text-uppercase mb-0">1000</h1>
                        <span class="fw-semibold text-uppercase">КЛиентов</span>
                        <p class="m-0 fw-semibold text-center">Постоянно покупают у нас</p>
                    </div>
                </div>
                <div class="d-flex flex-column align-items-center gap-3 him-reputation__info-center">
                    <div class="d-flex flex-column gap-3">
                        <span>Мы<br> — официальный дистрибьютор</span>
                        <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/lotte.svg" alt="">
                    </div>
                    <p class="m-0">(Южная Корея). Различные цвета и марки. Для экструзии и литья под давлением.</p>
                </div>
                <div class="d-flex gap-4">
                    <div class="d-flex flex-column align-items-center gap-2 px-3 him-reputation__info-item">
                        <h1 class="fw-light text-uppercase mb-0">2001</h1>
                        <span class="fw-semibold text-uppercase">год</span>
                        <p class="m-0 fw-semibold text-center">Дата нашего основания</p>
                    </div>
                    <div class="d-flex flex-column align-items-center gap-2 ps-3 px-3 him-reputation__info-item">
                        <h1 class="fw-light text-uppercase mb-0">1000</h1>
                        <span class="fw-semibold text-uppercase">КЛиентов</span>
                        <p class="m-0 fw-semibold text-center">Постоянно покупают у нас</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="him-in-stock">
    <div class="him-container">
        <div class="him-in-stock__content d-flex flex-column">
            <div class="him-in-stock__content-item d-flex flex-column align-items-center" id="marks">
                <div class="him-in-stock__title d-flex flex-column align-items-center gap-3">
                    <h1 class="fs-1 fw-light text-uppercase mb-0 text-center">Марки <span class="fw-bold">АБС в наличии</span></h1>
                    <p class="mb-0">АБС-гранулы — это небольшие твердые частицы акрилонитрил-бутадиен-стирола (АБС), термопластичного полимера, широко используемого в промышленности. Гранулы служат сырьем для различных методов переработки пластмасс, таких как литье под давлением, экструзия и 3D-печать.</p>
                </div>
                <div class="him-in-stock__list row g-3">
                    <?php
                    $args = array(
                        'post_type' => 'abs_granules',
                        'posts_per_page' => -1,
                    );
                    $query = new WP_Query($args);
                    if ($query->have_posts()) {
                        while ($query->have_posts()) {
                            $query->the_post();
                            $characteristics = get_post_meta(get_the_ID(), 'characteristics', true);
                            ?>
                            <div class="col-12 col-md-6">
                                <div class="him-in-stock__list-item">
                                    <div class="him-in-stock__list-item-img">
                                        <?php if (has_post_thumbnail()) : ?>
                                            <img src="<?php echo get_the_post_thumbnail_url(); ?>" alt="">
                                        <?php else : ?>
                                            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/bag.png" alt="">
                                        <?php endif; ?>
                                    </div>
                                    <div class="d-flex flex-column">
                                        <div class="d-flex flex-column gap-2 mb-1">
                                            <h4 class="fs-4 fw-bold mb-0"><?php the_title(); ?></h4>
                                            <span><?php echo get_post_meta(get_the_ID(), 'model', true); ?></span>
                                        </div>
                                        <?php the_content(); ?>
                                        <?php if ($characteristics) : ?>
                                            <div class="him-in-stock__characteristics mt-0">
                                                <p class="mb-0">Основные характеристики:</p>
                                                <ul>
                                                    <?php foreach ($characteristics as $char) : ?>
                                                        <li style='padding-bottom:12px;padding-left: 10px;'><?php echo esc_html($char); ?></li>
                                                    <?php endforeach; ?>
                                                </ul>
                                            </div>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </div>
                            <?php
                        }
                    }
                    wp_reset_postdata();
                    ?>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Separate characteristics table section -->
<div class="him-characteristics">
    <div class="him-container">
        <div class="him-characteristics__content d-flex flex-column align-items-center" id="characteristics">
            <div class="him-characteristics__title d-flex flex-column align-items-center gap-3">
                <h1 class="fs-1 fw-light text-uppercase mb-0 text-center"><span class="fw-bold">Сравнение характеристик</span> АБС-гранул</h1>
            </div>
            <div class="him-table-wrapper">
                <table class="him-table-custom" style="margin-bottom: 50px;">
                    <thead>
                        <tr>
                            <th scope="col">ПАРАМЕТР</th>
                            <?php
                            $args = array(
                                'post_type' => 'abs_granules',
                                'posts_per_page' => -1,
                            );
                            $query = new WP_Query($args);
                            if ($query->have_posts()) : 
                                while ($query->have_posts()) : 
                                    $query->the_post();
                            ?>
                                <th scope="col"><?php the_title(); ?></th>
                            <?php 
                                endwhile;
                            endif;
                            ?>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $query->rewind_posts();
                        if ($query->have_posts()) {
                            $query->the_post();
                            $characteristics = get_post_meta(get_the_ID(), 'characteristics', true);
                            if (is_array($characteristics)) {
                                foreach ($characteristics as $char) {
                                    echo '<tr>';
                                    echo '<td>' . esc_html($char) . '</td>';
                                    
                                    $query->rewind_posts();
                                    while ($query->have_posts()) {
                                        $query->the_post();
                                        $post_chars = get_post_meta(get_the_ID(), 'characteristics', true);
                                        echo '<td>' . esc_html($post_chars[array_search($char, $characteristics)]) . '</td>';
                                    }
                                    
                                    echo '</tr>';
                                }
                            }
                        }
                        wp_reset_postdata();
                        ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

        <div class="him-available-colors">
            <div class="him-container">
                <div class="him-available-colors__content d-flex flex-column align-items-center">
                    <h1 class="mb-0 fw-light text-white text-uppercase text-center"><span class="fw-bold">Доступные цвета</span> АБС-гранул</h1>
                    <div class="row him-available-g">
                        <div class="col-12 col-md-6 col-xl-3">
                            <div class="him-available-colors__item d-flex flex-column gap-3 gap-sm-5">
                                <div class="him-available-colors__item-img">
                                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/graul-1.png" alt="">
                                </div>
                                <div class="d-flex flex-column gap-1 align-items-center">
                                    <h4 class="fs-4 text-white fw-semibold text-uppercase mb-0">RAL 9016</h4>
                                    <p class="mb-0">Белый теплый</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-xl-3">
                            <div class="him-available-colors__item d-flex flex-column gap-3 gap-sm-5">
                                <div class="him-available-colors__item-img">
                                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/graul-2.png" alt="">
                                </div>
                                <div class="d-flex flex-column gap-1 align-items-center">
                                    <h4 class="fs-4 text-white fw-semibold text-uppercase mb-0">RAL 9003</h4>
                                    <p class="mb-0">Белый стандартный холодный</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-xl-3">
                            <div class="him-available-colors__item d-flex flex-column gap-3 gap-sm-5">
                                <div class="him-available-colors__item-img">
                                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/graul-3.png" alt="">
                                </div>
                                <div class="d-flex flex-column gap-1 align-items-center">
                                    <h4 class="fs-4 text-white fw-semibold text-uppercase mb-0">RAL 9005</h4>
                                    <p class="mb-0">Глубокий черный</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-xl-3">
                            <div class="him-available-colors__item d-flex flex-column gap-3 gap-sm-5">
                                <div class="him-available-colors__item-img">
                                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/graul-4.png" alt="">
                                </div>
                                <div class="d-flex flex-column gap-1 align-items-center">
                                    <h4 class="fs-4 text-white fw-semibold text-uppercase mb-0">RAL 7035</h4>
                                    <p class="mb-0">Светло-серый</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="him-about" id="about-details">
            <div class="him-container">
                <div class="him-about__content d-flex flex-column align-items-center gap-50">
                    <h1 class="text-uppercase fs-1 fw-light">Подробнее <span class="fw-bold">о компании</span></h1>
                    <div class="row him-about-g">
                        <div class="col-12 col-md-6">
                            <div class="him-about__img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/about.png" alt=""></div>
                        </div>
                        <div class="col-12 col-md-6">
                            <div class="him-about__text d-flex flex-column justify-content-between gap-3 h-100">
                                <p class="mb-0">
                                    <b>ХимПартнёры</b> ежегодно поставляет продукцию на сумму более <b>200 миллионов долларов из более чем 20 стран</b> и продает в более чем 10 странах. Международное распределение промышленных сырьевых материалов обеспечивается более чем 200 сотрудниками в 5 странах, а также агентами в более чем 10 странах.
                                </p>
                                <p class="mb-0">
                                    <b>Надежные и своевременные поставки более 50 000 тонн продукции ежегодно для тысяч наших уважаемых клиентов</b> обеспечиваются собственной профессиональной логистической командой.
                                </p>
                                <p class="mb-0">
                                    Исторически наша ключевая экспертиза сосредоточена в Южной, Юго-Восточной и Северо-Восточной Азии, однако в <b>2023</b> году масштаб наших поставок охватил все континенты. Среди наших клиентов — как крупные международные корпорации, так и малые и средние производители, которые, как и мы, стремятся к честному, долгосрочному и взаимовыгодному сотрудничеству.
                                </p>
                                <p class="mb-0">
                                    <b>Мы занимаемся только теми поставками, которые можем предложить на конкурентных условиях.</b> Многолетний опыт и профессионализм нашей международной команды позволяют нам гарантировать надежность и качество поставок, а также стабильно конкурентоспособные цены.
                                </p>
                                <p class="mb-0">
                                    <b>Мы искренне ценим наших сотрудников и партнеров</b> и верим, что вносим положительный вклад в их жизнь, бизнес и улучшаем окружающую среду.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="him-areas-wrapper" style="background-color: #fff;">
            <div class="him-container">
                <div class="him-areas d-flex flex-column" id="applications">
                    <h1 class="fw-light text-uppercase fs-1 mb-0 text-center">Наши АБС-гранулы <span class="fw-bold">применяются в следующих областях</span></h1>
                    <div class="row g-2">
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-1.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>Автомобильные детали</span>
                                    <p class="mb-0">Включает панели, ручки, корпуса зеркал, решетки радиатора и другие элементы. АБС активно используется в автоиндустрии благодаря прочности и термостойкости.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-2.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>Детали для электроники</span>
                                    <p class="mb-0">Корпуса для компьютеров, принтеров, игровых приставок, клавиатур и телефонов. Электроника повсеместно содержит компоненты из АБС.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-3.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>Бытовая техника</span>
                                    <p class="mb-0">Корпуса для холодильников, стиральных машин, пылесосов, телевизоров и кондиционеров. Высокая прочность и ударостойкость делают АБС оптимальным выбором.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-4.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>Детские игрушки</span>
                                    <p class="mb-0">Например, LEGO и другие популярные игрушки. АБС безопасен, долговечен и позволяет создавать яркие, прочные изделия.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-5.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>Сантехника и строительные изделия</span>
                                    <p class="mb-0">Панели для ванн, душевых кабин, различные комплектующие для сантехники. АБС устойчив к воздействию влаги, химикатов и может сохранять форму при контакте с горячей водой.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-6.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>Мебель и фурнитура</span>
                                    <p class="mb-0">Декоративные элементы мебели, ручки, накладки, а также детали фурнитуры, которые требуют прочного и стойкого к ударам материала.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-7.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>Спортивные товары</span>
                                    <p class="mb-0">Из АБС изготавливают шлемы, защитные элементы, лыжные крепления и другие товары, требующие надежного и ударопрочного материала.</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <div class="him-areas__item">
                                <div class="him-areas__item-img"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/area-8.png" alt=""></div>
                                <div class="him-areas__item-content">
                                    <span>3D-печать</span>
                                    <p class="mb-0">АБС является одним из самых распространенных материалов для 3D-принтеров благодаря легкости печати и обработке, что делает его популярным для прототипирования и создания функциональных изделий.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="him-certificates">
            <div class="him-container">
                <div class="him-certificates__content d-flex flex-column align-items-center gap-50">
                    <h1 class="fs-1 text-uppercase fw-light mx-auto">Сертификаты</h1>
                    <div class="him-certificates__slider w-100 overflow-hidden">
                        <div class="swiper-wrapper">
                            <?php
                            $certificates = new WP_Query([
                                'post_type' => 'certificates',
                                'posts_per_page' => -1,
                                'orderby' => 'date',
                                'order' => 'DESC'
                            ]);

                            if ($certificates->have_posts()) :
                                while ($certificates->have_posts()) : $certificates->the_post();
                                    $full_image = wp_get_attachment_image_src(get_post_thumbnail_id(), 'full');
                                    if ($full_image) :
                            ?>
                                    <div class="swiper-slide">
                                        <img src="<?php echo esc_url($full_image[0]); ?>" 
                                             alt="<?php echo esc_attr(get_the_title()); ?>"
                                             class="certificate-image"
                                             data-full-image="<?php echo esc_url($full_image[0]); ?>">
                                    </div>
                            <?php
                                    endif;
                                endwhile;
                                wp_reset_postdata();
                            endif;
                            ?>
                        </div>
                    </div>
                    <div class="him-certificates__controls d-flex align-items-center">
                        <span class="swiper-prev certificate-prev">
                            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt="">
                        </span>
                        <div class="swiper-pagination him-certificates__pagination"></div>
                        <span class="swiper-next certificate-next">
                            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt="">
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal for certificates -->
        <div id="certificateModal" class="modal">
            <span class="modal-close">&times;</span>
            <img class="modal-content" id="certificateModalImg">
        </div>

        <div class="him-advantages" style="background-color: #fff;">
            <div class="him-container">
            <div class="him-advantages d-flex flex-column align-items-center">
                <h1 class="fw-light text-uppercase fs-1 mb-0"><span class="fw-bold">Преимущества</span> АБС-гранул</h1>
                <div class="row g-2">
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Ударопрочность до 20 кДж/м²</span>
                        <p class="mb-0">Материал выдерживает высокие нагрузки и удары.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-1.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Температурный диапазон от -20°C до +90°C</span>
                        <p class="mb-0">Сохраняет свойства при умеренных температурах.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-2.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Плотность 1,05 г/см³</span>
                        <p class="mb-0">Лёгкий, но прочный материал для разных задач.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-3.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Долговечность Срок службы до 10 лет</span>
                        <p class="mb-0">Отличается устойчивостью к износу и деформации.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-4.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Жёсткость до 2400 МПа</span>
                        <p class="mb-0">Гарантирует стабильность формы под нагрузками.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-5.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Химическая устойчивость До 80% химикатов</span>
                        <p class="mb-0">Надёжно противостоит кислотам и щелочам.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-6.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Применение Более 50 отраслей</span>
                        <p class="mb-0">Широко используется в электронике, автомобилестроении и быту.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-7.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Влагостойкость До 95% влажности</span>
                        <p class="mb-0">Сохраняет свойства даже в условиях высокой влажности.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-8.svg" alt="">
                    </div>
                </div>
                <div class="col-12 col-md-6 col-lg-4">
                    <div class="him-advantages__item d-flex justify-content-between">
                    <div class="d-flex flex-column">
                        <span>Технологичность цикл формования 30–60 секунд</span>
                        <p class="mb-0">Ускоряет производство благодаря лёгкой обработке.</p>
                    </div>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/advantage-9.svg" alt="">
                    </div>
                </div>
                </div>
            </div>
            </div>
        </div>

        <div class="him-reviews" id="reviews">
            <div class="him-container">
                <div class="him-reviews__content d-flex flex-column">
                    <div class="d-flex flex-column align-items-center gap-50">
                        <div class="d-flex flex-column align-items-center gap-3 mb-2">
                            <h1 class="fw-light text-uppercase fs-1 mb-0">Аудио <span class="fw-bold">Отзывы</span></h1>
                            <p class="mb-0 text-center">Мы дорожим своими клиентами и держим репутацию на высоком уровне!</p>
                        </div>
                        <div class="him-reviews-slider mt-3 w-100 overflow-hidden">
                            <div class="swiper-wrapper">
                                <?php
                                $args = array(
                                    'post_type' => 'audio_reviews',
                                    'posts_per_page' => -1,
                                );
                                $query = new WP_Query($args);
                                $slide_count = 0;
                                while ($query->have_posts()) {
                                    $query->the_post();
                                    if ($slide_count % 4 == 0) {
                                        if ($slide_count > 0) {
                                            echo '</div></div>';
                                        }
                                        echo '<div class="swiper-slide him-review-slide"><div class="row g-2 w-100">';
                                    }
                                    ?>
                                    <div class="col-12 col-md-6">
                                        <div class="him-review__item" data-audio-url="<?php echo esc_url(get_post_meta(get_the_ID(), 'audio_file', true)); ?>">
                                            <div class="him-waveform-container d-flex align-items-center gap-3">
                                                <button class="him-play-btn" style="cursor: pointer;">
                                                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/play.svg" alt="Play">
                                                </button>
                                                <div class="waveform"></div>
                                            </div>
                                            <div class="d-flex flex-column mt-2 him-waveform-text">
                                                <span><?php echo get_post_meta(get_the_ID(), 'reviewer_name', true); ?></span>
                                                <div class="d-flex justify-content-between align-items-end">
                                                    <p class="mb-0"><?php echo get_post_meta(get_the_ID(), 'company', true); ?></p>
                                                    <p class="mb-0"><?php echo get_the_date(); ?></p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <?php
                                    $slide_count++;
                                }
                                if ($slide_count > 0) {
                                    echo '</div></div>';
                                }
                                wp_reset_postdata();
                                ?>
                            </div>
                        </div>
                        <div class="him-certificates__controls d-flex align-items-center">
                            <span class="swiper-prev review-prev"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt=""></span>
                            <div class="swiper-pagination review__pagination"></div>
                            <span class="swiper-next review-next"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt=""></span>
                        </div>
                    </div>
                    <span class="him-review-line"></span>
                    <div class="d-flex flex-column align-items-center gap-50">
                        <div class="d-flex flex-column align-items-center gap-3 mb-2">
                            <h1 class="fw-light text-uppercase fs-1 mb-0">Письменные <span class="fw-bold">Отзывы</span></h1>
                            <p class="mb-0 text-center">Ваше доверие — наша главная ценность, а качество — наш приоритет!</p>
                        </div>
                        <div class="him-written-review-slider w-100 overflow-hidden mt-3">
                            <div class="swiper-wrapper">
                                <?php
                                $args = array(
                                    'post_type' => 'written_reviews',
                                    'posts_per_page' => -1,
                                );
                                $query = new WP_Query($args);
                                while ($query->have_posts()) {
                                    $query->the_post();
                                    ?>
                                    <div class="swiper-slide him-written-review__slide">
                                        <div class="him-written-review-slide__img">
                                            <?php if (has_post_thumbnail()) : ?>
                                                <img src="<?php echo get_the_post_thumbnail_url(); ?>" alt="" class="review-image" data-full-image="<?php echo get_the_post_thumbnail_url(); ?>">
                                            <?php else : ?>
                                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/written-review.png" alt="" class="review-image" data-full-image="<?php echo get_template_directory_uri(); ?>/src/assets/images/written-review.png">
                                            <?php endif; ?>
                                        </div>
                                        <div class="d-flex flex-column gap-4 him-written-review__text">
                                            <div class="position-relative">
                                                <img class="position-absolute" src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/«.svg" alt="">
                                                <img class="position-absolute" src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/«.svg" alt="">
                                                <div class="him-written-review__text-p">
                                                    <?php the_content(); ?>
                                                </div>
                                            </div>
                                            <p class="position-relative">
                                                С уважением,<br>
                                                <?php echo get_post_meta(get_the_ID(), 'reviewer_title', true); ?><br>
                                                <?php echo get_post_meta(get_the_ID(), 'reviewer_name', true); ?>
                                            </p>
                                        </div>
                                    </div>
                                    <?php
                                }
                                wp_reset_postdata();
                                ?>
                            </div>
                        </div>
                        <div class="him-certificates__controls d-flex align-items-center">
                            <span class="swiper-prev written-review-prev"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt=""></span>
                            <div class="swiper-pagination written-review__pagination"></div>
                            <span class="swiper-next written-review-next"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt=""></span>
                        </div>
                        <a href="#" class="btn bg-green btn-custom">Смотреть все отзывы</a>
                    </div>
                </div>
            </div>
        </div>

        <div class="him-exhibition">
            <div class="him-container">
                <div class="d-flex align-items-center flex-column">
                    <div class="d-flex flex-column align-items-center gap-3">
                        <h1 class="fw-light text-uppercase fs-1 mb-0 text-white">Химпартнёры <span class="fw-bold">на выставках</span></h1>
                        <p class="mb-0 text-white text-center">Компания «ХимПартнёры» активно участвует в различных выставках химической промышленности</p>
                    </div>
                    <div class="him-exhibition__content">
                        <div class="him-exhibition__controls d-flex flex-column">
                            <?php
                            $args = array(
                                'category_name' => 'expo',
                                'posts_per_page' => -1,
                                'meta_key' => 'exhibition_date',
                                'orderby' => 'meta_value',
                                'order' => 'ASC',
                            );
                            $query = new WP_Query($args);
                            $count = 1;
                            while ($query->have_posts()) {
                                $query->the_post();
                                ?>
                                <div class="him-exhibition__control-item d-flex flex-column <?php echo $count == 1 ? 'active' : ''; ?>" data-id="<?php echo $count; ?>">
                                    <span><?php the_title(); ?></span>
                                    <p style='color:gray'><?php echo get_post_meta(get_the_ID(), 'exhibition_date', true); ?>, <?php echo get_post_meta(get_the_ID(), 'exhibition_location', true); ?></p>
                                </div>
                                <?php
                                $count++;
                            }
                            wp_reset_postdata();
                            ?>
                        </div>
                        <div class="him-exhibition__info-wrapper">
                            <?php
                            $count = 1;
                            $query->rewind_posts();
                            while ($query->have_posts()) {
                                $query->the_post();
                                ?>
                                <div class="him-exhibition__info <?php echo $count == 1 ? 'active' : ''; ?>" id="exhibition-<?php echo $count; ?>">
                                    <div class="him-exhibition__info-img mb-2">
                                        <?php if (has_post_thumbnail()) : ?>
                                            <img src="<?php echo get_the_post_thumbnail_url(); ?>" alt="">
                                        <?php else : ?>
                                            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/images/exhibition.png" alt="">
                                        <?php endif; ?>
                                    </div>
                                    <h2 class="fw-bold mt-4"><?php the_title(); ?></h2>
                                    <span class="mt-1 mb-2" style='color:gray'><?php echo get_post_meta(get_the_ID(), 'exhibition_date', true); ?>, <?php echo get_post_meta(get_the_ID(), 'exhibition_location', true); ?></span>
                                    <p class="mb-0 mt-4"><?php the_content(); ?></p>
                                </div>
                                <?php
                                $count++;
                            }
                            wp_reset_postdata();
                            ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="him-news" style="background-color: #fff; width: 100%;">
            <div class="him-container">
                <div class="him-news__content d-flex flex-column align-items-center">
                    <h1 class="fs-1 fw-bold text-uppercase m-0">Новости</h1>
                    <div class="row g-2">
                        <?php
                        $args = array(
                            'category_name' => 'news',
                            'posts_per_page' => 4,
                        );
                        $query = new WP_Query($args);
                        if ($query->have_posts()) {
                            while ($query->have_posts()) {
                                $query->the_post();
                                $permalink = get_permalink();
                                ?>
                                <div class="col-12 col-md-6 col-lg-3">
                                    <div class="him-news__item" style="cursor: pointer" onclick="window.location='<?php echo $permalink; ?>'">
                                        <div class="him-news__item-img">
                                            <img src="<?php echo get_the_post_thumbnail_url(); ?>" alt="">
                                        </div>
                                        <div class="him-news__item-text d-flex flex-column gap-2">
                                            <span><?php echo get_the_date(); ?></span>
                                            <p class="mb-0" style="text-decoration: none; transition: text-decoration 0.3s;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'"><?php the_title(); ?></p>
                                        </div>
                                        <div class="d-flex align-items-end">
                                            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt="">
                                        </div>
                                    </div>
                                </div>
                                <?php
                            }
                        }
                        wp_reset_postdata();
                        ?>
                    </div>
                    <a href="<?php echo get_permalink(get_page_by_path('news')); ?>" class="btn bg-green btn-custom">читать все новости</a>
                </div>
            </div>
        </div>

        <div class="him-partners">
            <div class="him-container">
                <div class="him-partners__content d-flex flex-column align-items-center">
                    <div class="d-flex flex-column align-items-center gap-3 him-reputation__title">
                        <h1 class="fs-1 fw-light text-uppercase text-center mb-0">Наши <span class="fw-bold">партнеры</span></h1>
                        <p class="m-0 text-center">ХимПартнёры стремятся работать с лучшими партнёрами</p>
                    </div>
                    <div class="row row-cols-2 row-cols-sm-3 row-cols-lg-5 g-2">
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/lotte.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/verif.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/toray.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/bird.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/dafa.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/pb-group.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/indorama.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/grasim.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/reliance.svg" alt="">
                            </div>
                        </div>
                        <div class="col">
                            <div class="him-partners__item">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/stirolplast.svg" alt="">
                            </div>
                        </div>
                    </div>
                    <a href="#" class="btn bg-green btn-custom">Подробнее</a>
                </div>
            </div>
        </div>

        <div class="him-form-wrapper" style="background-color: #fff; width: 100%;">
            <div class="him-container">
                <div class="him-form-content d-flex flex-column align-items-center">
                    <div class="d-flex flex-column align-items-center gap-3 him-reputation__title">
                        <h1 class="fs-1 fw-light text-uppercase text-center mb-0">Отправить <span class="fw-bold">запрос цен на АБС</span></h1>
                        <p class="m-0 text-center">Обратите внимание, мы работаем только с заказами строго от 25 кг (мешок)!</p>
                    </div>
                    <form class="him-form d-flex flex-column">
                        <div class="row him-form-g">
                            <div class="col-md-6">
                                <input type="text" class="form-control" placeholder="Ваше имя">
                            </div>
                            <div class="col-md-6">
                                <input type="email" class="form-control" placeholder="E-mail">
                            </div>
                        </div>
                        <div class="row him-form-g">
                            <div class="col-md-6">
                                <input type="text" class="form-control" placeholder="В какой город доставка?">
                            </div>
                            <div class="col-md-6">
                                <input type="text" class="form-control" placeholder="+7 (999) 999-9999">
                            </div>
                        </div>
                        <div class="row him-form-g">
                            <div class="col-12">
                                <input type="text" class="form-control" placeholder="Что именно вы ищете?">
                            </div>
                        </div>
                        <div class="row him-form-g">
                            <div class="col-12">
                                <input type="text" class="form-control" placeholder="Какой объём нужен?">
                            </div>
                        </div>
                        <div class="him-form__btn d-flex flex-column align-items-center">
                            <button type="submit" class="btn bg-green btn-custom">Отправить запрос</button>
                            <p class="mb-0">
                                Нажимая «отправить запрос» вы соглашаетесь с
                                <a href="#">политикой обработки персональных данных</a>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <?php get_template_part('template-parts/contact-section'); ?>
    </main>

    <div class="image-modal" id="imageModal">
        <span class="close-modal">&times;</span>
        <img src="" alt="" id="modalImage">
    </div>

    <div class="him-to-top" id="scrollToTopBtn"></div>

    
<style>
.image-modal {
    display: none;
    position: fixed;
    z-index: 9999;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.9);
    padding: 20px;
}

.image-modal img {
    max-width: 90%;
    max-height: 90vh;
    margin: auto;
    display: block;
    position: relative;
    top: 50%;
    transform: translateY(-50%);
}

.close-modal {
    position: absolute;
    right: 25px;
    top: 15px;
    color: #f1f1f1;
    font-size: 40px;
    font-weight: bold;
    cursor: pointer;
}

.review-image {
    cursor: pointer;
    transition: opacity 0.3s;
}

.review-image:hover {
    opacity: 0.8;
}

.him-advantages {
    background-color: #fff;
    padding: 50px 0;
}

#certificateModal {
    display: none;
    position: fixed;
    z-index: 9999;
    padding-top: 50px;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.9);
}

#certificateModal .modal-content {
    margin: auto;
    display: block;
    max-width: 90%;
    max-height: 90vh;
}

.modal-close {
    position: absolute;
    right: 35px;
    top: 15px;
    color: #f1f1f1;
    font-size: 40px;
    font-weight: bold;
    cursor: pointer;
}

.certificate-image {
    cursor: pointer;
    transition: opacity 0.3s;
}

.certificate-image:hover {
    opacity: 0.8;
}

.him-certificates__slider .swiper-slide img {
    width: auto;
    height: 300px; /* фиксированная высота для слайдера */
    object-fit: contain;
    margin: 0 auto;
    display: block;
}

#certificateModal .modal-content {
    margin: auto;
    display: block;
    width: auto;
    height: auto;
    max-width: 80%;
    max-height: 90vh;
    object-fit: contain;
    position: relative;
    top: 50%;
    transform: translateY(-50%);
}

.certificate-image {
    cursor: pointer;
    transition: opacity 0.3s;
    width: auto !important; /* переопределяем стили swiper если нужно */
    height: 100%;
    object-fit: contain;
}

.certificate-image:hover {
    opacity: 0.8;
}

/* Центрирование модального окна */
#certificateModal {
    display: none;
    position: fixed;
    z-index: 9999;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.9);
    padding: 20px;
}
</style>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const closeBtn = document.getElementsByClassName('close-modal')[0];
    
    // Get all review images
    const images = document.querySelectorAll('.review-image');
    
    // Add click handler to each image
    images.forEach(img => {
        img.addEventListener('click', function() {
            modal.style.display = "block";
            modalImg.src = this.getAttribute('data-full-image');
        });
    });
    
    // Close modal on X click
    closeBtn.addEventListener('click', function() {
        modal.style.display = "none";
    });
    
    // Close modal on outside click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });
    
    // Close modal on ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === "block") {
            modal.style.display = "none";
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    // Get all certificate images
    const certificateImages = document.querySelectorAll('.certificate-image');
    const modal = document.getElementById('certificateModal');
    const modalImg = document.getElementById('certificateModalImg');
    const closeBtn = document.querySelector('.modal-close');

    // Add click handler to each certificate image
    certificateImages.forEach(img => {
        img.addEventListener('click', function() {
            modal.style.display = "block";
            modalImg.src = this.getAttribute('data-full-image');
        });
    });

    // Close modal on X click
    closeBtn.addEventListener('click', function() {
        modal.style.display = "none";
    });

    // Close modal on outside click
    window.addEventListener('click', function(e) {
        if (e.target == modal) {
            modal.style.display = "none";
        }
    });

    // Close modal on ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === "Escape") {
            modal.style.display = "none";
        }
    });
});
</script>

<?php get_footer(); ?>

