<?php
get_header();
if (have_posts()) :
    while (have_posts()) : the_post();
        the_content();
    endwhile;
else :
    echo '<p>Записей не найдено.</p>';
endif;
get_footer();
?>
