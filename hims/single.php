<?php
/*
 Template Name: News Page
*/
get_header(); ?>
<main class="him-main">
    <div class="him-page">
        <div class="him-container">
            <div class="him-page__content d-flex flex-column gap-50">
                <?php get_template_part('template-parts/pageControls'); ?>
                
                <div class="row g-2">
                    <div class="col-12 col-md-8 col-lg-9">
                        <?php if (have_posts()) : while (have_posts()) : the_post(); ?>
                            <article class="him-single-post">
                                <h1 class="fs-1 fw-light text-uppercase mb-4"><?php the_title(); ?></h1>
                                <div class="him-single-post__content">
                                    <?php the_content(); ?>
                                </div>
                            </article>
                        <?php endwhile; endif; ?>
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
