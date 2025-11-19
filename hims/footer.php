<footer class="him-footer">
    <div class="him-container">
        <div class="him-footer__content d-flex flex-column flex-md-row align-items-center justify-content-between gap-3">
            <a class="him-logo" href="<?php echo home_url(); ?>"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/logo.svg" alt=""></a>
            <div class="d-flex align-items-center gap-2">
                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/policy.svg" alt="">
                <span><a href="https://him.wpmix.net/%d0%bf%d0%be%d0%bb%d0%b8%d1%82%d0%b8%d0%ba%d0%b0-%d0%ba%d0%be%d0%bd%d1%84%d0%b8%d0%b4%d0%b5%d0%bd%d1%86%d0%b8%d0%b0%d0%bb%d1%8c%d0%bd%d0%be%d1%81%d1%82%d0%b8/">Политика конфиденциальности</a></span>
            </div>
            <div class="d-flex flex-row flex-md-column gap-3 gap-md-1">
                <a class="d-flex align-items-center justify-content-center btn" 
                   href="<?php echo esc_url(get_theme_mod('him_whatsapp_link', '#')); ?>" 
                   target="_blank">
                    <span>Написать в WhatsApp</span>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/whatsapp.svg" alt="">
                </a>
                <a class="d-flex align-items-center justify-content-center btn" 
                   href="<?php echo esc_url(get_theme_mod('him_telegram_link', '#')); ?>" 
                   target="_blank">
                    <span>Написать в Telegram</span>
                    <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/telagram.svg" alt="">
                </a>
            </div>
        </div>
    </div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
