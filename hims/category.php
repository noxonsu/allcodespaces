<?php get_header(); ?>
<main class="him-main">
    <div class="him-page">
        <div class="him-container">
            <div class="him-page__content d-flex flex-column gap-50">
                <?php get_template_part('template-parts/pageControls'); ?>
                <div class="row g-2">
                    <div class="col-12 col-md-8 col-lg-9">
                        <div class="row g-2">
                            <?php
                            if (have_posts()) {
                                while (have_posts()) {
                                    the_post();
                                    ?>
                                    <div class="col-12 col-md-6 col-lg-4">
                                        <div class="him-news__item">
                                            <div class="him-news__item-img"><img src="<?php echo get_the_post_thumbnail_url(); ?>" alt=""></div>
                                            <div class="him-news__item-text d-flex flex-column gap-2">
                                                <span><?php echo get_the_date(); ?></span>
                                                <p class="mb-0"><?php echo get_the_title(); ?></p>
                                            </div>
                                            <a href="<?php echo get_permalink(); ?>" class="d-flex align-items-end"><img src="<?php echo get_template_directory_uri(); ?>/src/assets/icons/arrow-green.svg" alt=""></a>
                                        </div>
                                    </div>
                                    <?php
                                }
                            }
                            ?>
                        </div>
                    </div>
                    <div class="col-12 col-md-4 col-lg-3">
                        <?php get_template_part('template-parts/price-request-form'); ?>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <?php get_template_part('template-parts/contact-section'); ?>
</main>
<?php get_footer(); ?>