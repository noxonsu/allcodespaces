<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/favicon.svg">
    <?php wp_head(); ?>
    <title><?php bloginfo('name'); ?> | <?php wp_title(); ?></title>
</head>
<body <?php body_class(); ?>>
<header class="him-header">
    <div class="him-top-nav py-1">
        <div class="him-container">
            <div class="d-flex align-items-center justify-content-between gap-2 him-top-nav__content">
                <div class="d-flex align-items-center gap-2 him-top-nav__location">
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/location.svg" alt="">
                    <p class="text-uppercase m-0">Работаем по всей России</p>
                </div>
                <div class="him-top-nav__btns d-flex align-items-center gap-1">
                    <a href="<?php echo get_permalink(get_page_by_title('Expo')); ?>" class="btn bg-blue">Выставка</a>
                    <a href="<?php echo get_permalink(get_page_by_title('Vacancies')); ?>" class="btn bg-blue-dark">Вакансии</a>
                    <a href="<?php echo get_permalink(get_page_by_title('AI Assistant')); ?>" class="btn bg-purple">ИИ помощник</a>
                    <a href="<?php echo get_permalink(get_page_by_title('Articles')); ?>" class="btn bg-blue-green">Статьи</a>
                    <a href="<?php echo get_permalink(get_page_by_title('News')); ?>" class="btn bg-green">Новости</a>
                    <a href="tel:+74951102145" class="d-flex align-items-center gap-2 him-top-nav__phone ms-3">
                        <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/phone.svg" alt="">
                        <p class="m-0">+7 (495) 110-21-45</p>
                    </a>
                </div>
            </div>
        </div>
    </div>
    <div class="him-container">
        <nav class="him-nav d-flex align-items-center justify-content-between py-4">
            <a class="him-logo" href="<?php echo home_url(); ?>"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/logo.svg" alt=""></a>
            <ul class="him-menu align-items-center gap-4">
                <li class="him-menu__item"><a href="#" class="him-menu__link">Марки</a></li>
                <li class="him-menu__item"><a href="#" class="him-menu__link">О компании</a></li>
                <li class="him-menu__item"><a href="#" class="him-menu__link">Таблица характеристик</a></li>
                <li class="him-menu__item"><a href="#" class="him-menu__link">Применение</a></li>
                <li class="him-menu__item"><a href="#" class="him-menu__link">Отзывы</a></li>
            </ul>
            <div class="d-flex align-items-center gap-4">
                <a href="mailto:zapros@propartners.world" class="him-nav__mail align-items-center gap-2">
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/mail.svg" alt="">
                    <p class="m-0">zapros@propartners.world</p>
                </a>
                <div class="burger">
                    <span class="burger-line"></span>
                    <span class="burger-line"></span>
                    <span class="burger-line"></span>
                </div>
            </div>
        </nav>
    </div>
</header>
