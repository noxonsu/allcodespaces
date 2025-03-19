<footer class="him-footer">
    <div class="him-container">
        <div class="him-footer__content d-flex flex-column flex-md-row align-items-center justify-content-between gap-3">
            <a class="him-logo" href="<?php echo home_url(); ?>"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/logo.svg" alt=""></a>
            <div class="d-flex align-items-center gap-2">
                <img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/policy.svg" alt="">
                <span>Политика конфиденциальности</span>
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
