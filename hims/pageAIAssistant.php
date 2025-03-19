<?php
/*
 Template Name: AI Assistant Page
*/
get_header(); ?>
<main class="him-main">
    <div class="him-page">
        <div class="him-container">
            <div class="him-page__content d-flex flex-column gap-50">
                <?php get_template_part('template-parts/pageControls'); ?>
                <div class="row g-2">
                    <div class="col-12 col-md-8 col-lg-9">
                        <div class="him-ai" style="width: 100%; height: 100%; background-color: #353541; border-radius: 6px; min-height: 400px;"></div>
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
