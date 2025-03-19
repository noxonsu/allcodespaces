<div class="him-page-controls row g-2">
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_title('AI Assistant')); ?>" class="him-page-controls__item ai <?php if (is_page('AI Assistant')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/ai-active.svg" alt="">
            <p class="mb-0">ИИ помощник</p>
        </a>
    </div>
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_title('News')); ?>" class="him-page-controls__item news <?php if (is_page('News')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/news-active.svg" alt="">
            <p class="mb-0">Новости</p>
        </a>
    </div>
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_title('Articles')); ?>" class="him-page-controls__item article <?php if (is_page('Articles')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/article.svg" alt="">
            <p class="mb-0">Статьи</p>
        </a>
    </div>
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_title('Expo')); ?>" class="him-page-controls__item expo <?php if (is_page('Expo')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/expo.svg" alt="">
            <p class="mb-0">Выставки</p>
        </a>
    </div>
</div>
