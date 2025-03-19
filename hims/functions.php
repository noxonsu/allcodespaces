<?php
function himpartners_enqueue() {
    wp_enqueue_style('bootstrap', get_template_directory_uri() . '/src/styles/bootstrap.css');
    wp_enqueue_style('style', get_template_directory_uri() . '/src/styles/style.css');
    wp_enqueue_script('header', get_template_directory_uri() . '/src/scripts/header.js', array(), false, true);
}
add_action('wp_enqueue_scripts', 'himpartners_enqueue');
?>
