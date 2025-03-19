<?php


include sensorica_PATH . 'tools/chate-mascot/list_in_admin_panel.php';

function hide_sensorica_chats_posts($limit = -1, $offset = 0) {
    $args = array(
        'post_type' => 'post',
        /*  'post_status' => 'publish', // Query only published posts
        /* 'tax_query' => array(
            array(
                'taxonomy' => 'sensorica_chats',
                'field' => 'slug',
                'terms' => 'sensorica-chat', // Replace with the actual term slug if different
            ),
        ),*/
        'posts_per_page' => $limit,
        'offset' => $offset,
        's' => 'Mr' // Search for posts with "Mr" in the title
    );

    $query = new WP_Query($args);

    //delete all this posts
    while ($query->have_posts()) {
        $query->the_post();
        $post_id = get_the_ID();
        wp_delete_post($post_id, true);
    }
    /*
    while ($query->have_posts()) {
        $query->the_post();
        $post_id = get_the_ID();
        wp_update_post(array(
            'ID' => $post_id,
            'post_status' => 'private', // Change to 'private' to hide from public
        ));
    } */

    // Reset Post Data
    wp_reset_postdata();
}

function register_sensorica_chats_taxonomy()
{
    $labels = array(
        'name' => 'Sensorica Chats',
        'singular_name' => 'Sensorica Chat',
    );
    $args = array(
        'labels' => $labels,
        'hierarchical' => true,
        'show_ui' => true,
        'show_admin_column' => true, 
        'query_var' => true,
        'rewrite' => array('slug' => 'sensorica_chats'),
        'public' => false // Set public to false to hide from the front end and RSS feeds
    );
    register_taxonomy('sensorica_chats', 'post', $args);
    //hide_sensorica_chats_posts();
}

function sensorica_get_iframe_url($post_id)
{
    $sensorica_client_id = get_option('sensorica_client_id');
    if ($sensorica_client_id == '') {
        return "Plesae set the client id in the settings page of sensorica plugin";
    }
    $saved_inputs = get_post_meta($post_id, '_sensorica_chat_saved_inputs', true);
    // if sensorica_theme == green 
    if (isset($saved_inputs['sensorica_theme']) && $saved_inputs['sensorica_theme'] == 'green') {
        $iframe_url = "https://chuanchu.onout.org/?sensorica_client_id=" . esc_attr($sensorica_client_id) . "&post_id=" . esc_attr($post_id);
    } else {
        $iframe_url = sensorica_URL . 'tools/chate-mascot/vendor_source/Chat.php?post_id=' . $post_id;
    }
    
    
    return $iframe_url;
}
function sensorica_chat_shortcode($atts)
{
    // Get the 'id' attribute from the shortcode, or set to 0 if not provided
    $atts = shortcode_atts(array(
        'id' => 0
    ), $atts);

    // If id is 0, get current post ID
    if ($atts['id'] == 0) {
        $atts['id'] = get_the_ID();
    }

    //iframe rest api call 'sensorica/v1', '/chat/(?P<id>\d+)'
    $iframe_url = sensorica_get_iframe_url($atts['id']);

    return '<iframe src="' . esc_url($iframe_url) . '" style="border: 0; width: 100%; height: 100%; min-height:700px; border-radius: 15px;" allowfullscreen></iframe> ' . get_option('sensorica_chat_footer', '');
}



function sensorica_get_shortcode_data($data) {
    $shortcode_id = $data['id'];
    $secret_envato_key = $data['arg'];
    $sensorica_envato_key_only_numbers = preg_replace('/[^0-9]/', '', get_option("sensorica_envato_key"));
    $md5_secret_envato_key = md5(get_option("sensorica_envato_key"));
    
    if ($secret_envato_key != $md5_secret_envato_key) {
        return new WP_Error('no_data', 'No data found wrong sensorica_envato_key', array('status' => 404));
    }
    
    $saved_inputs = get_post_meta($shortcode_id, '_sensorica_chat_saved_inputs', true);
    
    if (empty($saved_inputs)) {
        // Get individual meta values if _sensorica_chat_saved_inputs is empty
        $welcome_message = get_post_meta($shortcode_id, '_sensorica_welcome_message', true);
        $system_prompt = get_post_meta($shortcode_id, '_sensorica_system_prompt', true);
        $openai_model = get_post_meta($shortcode_id, '_sensorica_openai_model', true) ?: 'gpt-3.5-turbo-0125';
        $theme = get_post_meta($shortcode_id, '_sensorica_theme', true) ?: 'dark';
        
        $saved_inputs = array(
            'MAIN_TITLE' => $welcome_message,
            'SYSTEM_PROMPT' => $system_prompt,
            'API_KEY' => get_option("sensorica_openai_api_key"),
            'OPENAI_MODEL' => $openai_model,
            'sensorica_theme' => $theme
        );
    }
    
    if (empty($saved_inputs)) {
        return new WP_Error('no_data2', 'No data found', array('status' => 404));
    }
    
    $json_res = array('data' => $saved_inputs);
    return new WP_REST_Response($json_res, 200);
}

function sensorica_form_shortcode($atts)
{

    wp_enqueue_script('jquery');
    wp_enqueue_style('sensorica-style', sensorica_URL . 'static/new.css', array(), sensorica_VERSION . "_" . rand(1, 44), 'all');
  
    // Set the tool parameter
    //echo $atts['tool_name'];
    $_GET['sensorica_tool'] = esc_attr( $atts['tool_name'] );

    
    // Define the path to the file
    $file_path = sensorica_PATH . 'new_chat.php';

    // Check if the file exists
    if (file_exists($file_path)) {
        ob_start();
        include $file_path;
        $output = ob_get_clean();
        return $output;
    } else {
        return '<p>Error: File not found.</p>';
    }
}

function sensorica_show_output_links_and_iframes($editing_post_id)
{ ?>
    <?php
    //current user can edit posts
    if (current_user_can('edit_posts')) {
        ?>
        <div class="sensorica_form-section">
            <?php esc_html_e('WordPress Shortcode:', 'sensorica'); ?><br>
            <input class="sensorica_form-control" type="text"
                value='[sensorica_chat id="<?php echo esc_attr($editing_post_id); ?>"]' readonly>
        </div>

    <? } ?>
    <div class="sensorica_form-section">
        <?php esc_html_e('HTML widget:', 'sensorica'); ?>
        <textarea class="sensorica_form-control" cols="50" rows=20 readonly><?php
        $shortcode_html = sensorica_chat_shortcode(array(
            'id' => $editing_post_id,
        ));
        echo esc_textarea($shortcode_html);
        ?>
                </textarea>
    </div>

    <div class="sensorica_form-section">
        <?php esc_html_e('Direct url to this chat iframe:', 'sensorica'); ?>
        <input class="sensorica_form-control" type="text"
            value="<?php echo esc_url(sensorica_get_iframe_url($editing_post_id)); ?>" readonly>
    </div>
    <?php
}



add_shortcode('sensorica_chat', 'sensorica_chat_shortcode');
add_action('init', 'register_sensorica_chats_taxonomy');

add_action('enqueue_block_editor_assets', 'sensorica_enqueue_block_editor_assets');

add_shortcode('sensorica_form', 'sensorica_form_shortcode');
add_action('rest_api_init', function () {
    register_rest_route('sensorica/v1', '/chats/', array(
        'methods' => 'GET',
        'callback' => 'sensorica_get_chats',
        'permission_callback' => '__return_true'
    ));
});

add_action('rest_api_init', function () {
    register_rest_route('sensorica/v1', '/shortcode/(?P<id>\d+)/(?P<arg>\w+)', array(
        'methods' => 'GET',
        'callback' => 'sensorica_get_shortcode_data',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('sensorica/v1', '/openaiapi/api/chat', array(
        'methods' => ['POST', 'GET'],
        'callback' => 'sensorica_openaiapi_local_chat',
        'permission_callback' => '__return_true',
    ));
});

function sensorica_openaiapi_local_chat($request)
{
    $post_id = $request->get_param('post_id');

    $post_id = esc_attr($post_id);
    if ($post_id) {
        $saved_inputs = get_post_meta($post_id, '_sensorica_chat_saved_inputs', true);
        if (!$saved_inputs) {
            return new WP_Error('no_data', 'No data found', array('status' => 404));
        }

        $api_key = $saved_inputs['API_KEY'];
        $system_prompt = $saved_inputs['SYSTEM_PROMPT']; // Assuming this is the prompt you want to include
        $sensorica_openai_model = $saved_inputs['OPENAI_MODEL'];
        $messages = $request->get_param('messages'); // Messages from the request

        if (!is_array($messages) || empty($messages)) {
            return new WP_Error('invalid_messages', 'Invalid or empty messages array', array('status' => 401));
        }

        // Include the system prompt as the first message
        array_unshift($messages, ['role' => 'system', 'content' => $system_prompt]);

        // Sanitize messages
        $sanitized_messages = array_map(function ($message) {
            return [
                'role' => sanitize_text_field($message['role']),
                'content' => sanitize_text_field($message['content'])
            ];
        }, $messages);

        //print_r($messages);
        // Prepare the data payload
        $data = json_encode([
            'model' => $sensorica_openai_model,
            'messages' => $sanitized_messages,
            'max_tokens' => 1000,
            'temperature' => 0.5, // Adjust temperature as necessary
        ]);

        // Check for JSON encoding errors
        if ($data === false) {
            return new WP_Error('json_error', 'JSON encoding error: ' . json_last_error_msg(), array('status' => 500));
        }

        // Making the POST request to OpenAI API
        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', array(
            'method' => 'POST',
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'body' => $data,
            'data_format' => 'body',
        ));

        if (is_wp_error($response)) {
            $error_message = $response->get_error_message();
            return new WP_Error('request_failed', 'Request failed: ' . $error_message, array('status' => 500));
        } else {
            $body = wp_remote_retrieve_body($response);
            $decoded_body = json_decode($body, true); // Decode the JSON response into an associative array

            if (isset($decoded_body['choices'][0]['message']['content'])) {
                $first_choice_message = $decoded_body['choices'][0]['message']['content'];

                // Use json_decode to unescape UTF-8 \uXXXX characters
                $unescaped_message = json_decode(json_encode($first_choice_message));

                // Ensure the response is plain text
                $plain_text_response = wp_strip_all_tags($unescaped_message); // Optionally strip HTML tags if necessary

                // Return plain text response
                return rest_ensure_response($plain_text_response); // Use rest_ensure_response to return a WP_REST_Response object
            } else {
                return new WP_Error('response_parsing_error', 'Unable to parse the response or no choices found', array('status' => 500));
            }
        }


    } else {
        return new WP_Error('invalid_post_id', 'Invalid post ID', array('status' => 400));
    }
}

