<?php

/**
 * Fetches the status of a specific operator extension from Asterisk ARI.
 *
 * @param string $operatorExtension The extension number to check (e.g., "101").
 * @param string $ariUsername ARI username.
 * @param string $ariPassword ARI password.
 * @param string $ariHost ARI host (e.g., 'sip.qazna24.kz').
 * @param string $ariPort ARI port (e.g., '8089').
 * @return string 'online', 'offline', or 'error'
 */
function getOperatorAriStatus(string $operatorExtension, string $ariUsername, string $ariPassword, string $ariHost, string $ariPort): string {
    $url = "https://$ariHost:$ariPort/ari/endpoints";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
    curl_setopt($ch, CURLOPT_USERPWD, "$ariUsername:$ariPassword");
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Consider security implications for production
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // Consider security implications for production
    curl_setopt($ch, CURLOPT_TIMEOUT, 5); // Set a timeout for the request

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        custom_log("ARI cURL Error for ext $operatorExtension: " . curl_error($ch));
        curl_close($ch);
        return 'error';
    }

    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        custom_log("ARI HTTP Error for ext $operatorExtension: Code $httpCode, Response: $response");
        return 'error';
    }

    $endpoints = json_decode($response, true);

    if (json_last_error() !== JSON_ERROR_NONE || !is_array($endpoints)) {
        custom_log("ARI JSON Decode Error for ext $operatorExtension: " . json_last_error_msg() . ", Raw: " . $response);
        return 'error';
    }

    foreach ($endpoints as $endpoint) {
        // Assuming $endpoint['resource'] is the extension number (e.g., "101")
        // And $endpoint['technology'] might be "PJSIP", "SIP", etc.
        // We are looking for a direct match on the resource name.
        if (isset($endpoint['resource']) && $endpoint['resource'] === $operatorExtension) {
            // States like 'idle', 'inuse', 'ringing', 'unavailable' (if registered but DND) can mean online.
            // 'unknown' typically means not registered.
            $onlineStates = ['idle', 'inuse', 'ringing', 'unavailable', 'busy']; // Add 'busy' as it's also an online state
            if (isset($endpoint['state']) && in_array(strtolower($endpoint['state']), $onlineStates)) {
                return 'online';
            } else {
                return 'offline'; // e.g., state 'unknown' or other non-online states
            }
        }
    }

    // If the specific extension was not found in the list
    custom_log("ARI: Extension $operatorExtension not found in endpoints list.");
    return 'offline'; 
}

?>
