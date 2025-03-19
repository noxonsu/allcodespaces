<div class="him-page-controls row g-2">
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_path('ai-assistant')) ?: '#'; ?>" class="him-page-controls__item ai <?php if (is_page('ai-assistant')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/<?php echo is_page('ai-assistant') ? 'ai-active.svg' : 'ai.svg'; ?>" alt="">
            <p class="mb-0">ИИ помощник</p>
        </a>
    </div>
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_path('news')) ?: '#'; ?>" class="him-page-controls__item news <?php if (is_page('news')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/<?php echo is_page('news') ? 'news-active.svg' : 'news.svg'; ?>" alt="">
            <p class="mb-0">Новости</p>
        </a>
    </div>
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_path('articles')) ?: '#'; ?>" class="him-page-controls__item article <?php if (is_page('articles')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/<?php echo is_page('articles') ? 'article-active.svg' : 'article.svg'; ?>" alt="">
            <p class="mb-0">Статьи</p>
        </a>
    </div>
    <div class="col-6 col-md-3">
        <a href="<?php echo get_permalink(get_page_by_path('expo')) ?: '#'; ?>" class="him-page-controls__item expo <?php if (is_page('expo')) echo 'active'; ?>">
            <img src="<?php echo get_template_directory_uri(); ?>/src/assets/Icons/<?php echo is_page('expo') ? 'expo-active.svg' : 'expo.svg'; ?>" alt="">
            <p class="mb-0">Выставки</p>
        </a>
    </div>
</div>