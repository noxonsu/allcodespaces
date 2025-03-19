<?php
/*
 Template Name: Articles Page
*/
get_header(); ?>
<main class="him-main">
    <div class="him-page">
        <div class="him-container">
            <div class="him-page__content d-flex flex-column gap-50">
                <?php get_template_part('template-parts/pageControls'); ?>
                <div class="row g-2">
                    <div class="col-12 col-md-8 col-lg-9">
                        <div class="row g-2">
                            <?php
                            $args = array(
                                'category_name' => 'articles',
                                'posts_per_page' => -1
                            );
                            $query = new WP_Query($args);
                            if ($query->have_posts()) {
                                while ($query->have_posts()) {
                                    $query->the_post();
                                    ?>
                                    <div class="col-12 col-md-6 col-lg-4">
                                        <div class="him-news__item">
                                            <div class="him-news__item-img"><img src="<?php echo get_the_post_thumbnail_url(); ?>" alt=""></div>
                                            <div class="him-news__item-text d-flex flex-column gap-2">
                                                <span><?php echo get_the_date(); ?></span>
                                                <p class="mb-0"><?php echo get_the_title(); ?></p>
                                            </div>
                                            <a href="<?php echo get_permalink(); ?>" class="d-flex align-items-end"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/arrow-green.svg" alt=""></a>
                                        </div>
                                    </div>
                                    <?php
                                }
                            }
                            wp_reset_postdata();
                            ?>
                        </div>
                    </div>
                    <div class="col-12 col-md-4 col-lg-3">
                        <div class="him-page-form d-flex flex-column align-items-center">
                            <div class="d-flex flex-column align-items-center gap-2">
                                <h5 class="text-uppercase fw-bold mb-0">запрос цен на АБС</h5>
                                <p class="mb-0">Обратите внимание, мы работаем только с заказами строго от 25 кг (мешок)!</p>
                            </div>
                            <form class="him-form d-flex flex-column">
                                <input type="text" class="form-control" placeholder="Ваше имя">
                                <input type="email" class="form-control" placeholder="E-mail">
                                <input type="text" class="form-control" placeholder="В какой город доставка?">
                                <input type="text" class="form-control" placeholder="+7 (999) 999-9999">
                                <div class="him-form__btn d-flex flex-column align-items-center gap-3">
                                    <button type="submit" class="btn bg-green w-100">Отправить запрос</button>
                                    <p class="mb-0">Нажимая «отправить запрос» вы соглашаетесь с <a href="#">политикой обработки персональных данных</a></p>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="him-contacts position-relative">
        <div class="him-container h-100">
            <div class="row h-100">
                <div class="col-12 col-md-6 h-100">
                    <div class="him-contacts__info d-flex align-items-start justify-content-center flex-column h-100 gap-50">
                        <div class="d-flex flex-column align-items-start gap-3 him-reputation__title">
                            <h1 class="fs-1 fw-bold text-uppercase text-center mb-0">Связаться с нами</h1>
                            <p class="m-0 text-start text-md-center">ХимПартнёры стремятся работать с лучшими партнёрами</p>
                        </div>
                        <div class="d-flex flex-column gap-3">
                            <div class="d-flex align-items-center gap-2">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/location-green.svg" alt="">
                                <p class="mb-0">115054, Москва, Большой Строченовский переулок, дом 7</p>
                            </div>
                            <a class="d-flex align-items-center gap-2" href="mailto:zapros@propartners.world">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/mail-green.svg" alt="">
                                <p class="mb-0 text-green">zapros@propartners.world</p>
                            </a>
                            <div class="d-flex align-items-center gap-2">
                                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/phone-green.svg" alt="">
                                <h5 class="mb-0 fw-bold fs-5">+7 (495) 110-21-45</h5>
                            </div>
                        </div>
                        <p class="mb-0">Наши склады находятся на всей территории Российской Федерации</p>
                    </div>
                </div>
                <div class="col-6 d-none d-md-block"></div>
            </div>
        </div>
        <div class="him-contacts__map position-absolute">
            <iframe src="https://yandex.ru/map-widget/v1/?lang=ru_RU&scroll=true&source=constructor-api&um=constructor%3Aeb422da14c951353644a88c159cc8950e5b74596b00114d88474200cb338c4ed" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
    </div>
</main>
<?php get_footer(); ?>