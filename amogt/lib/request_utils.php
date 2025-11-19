<?php

if (!function_exists('httpClient')) {
    /**
     * Basic HTTP client function using cURL.
     *
     * @param string $url
     * @param array $options 'method', 'headers', 'body' (for POST, typically JSON string), 'timeout', 'ssl_verify_peer', 'ssl_verify_host', 'verbose'
     * @return array ['statusCode', 'body', 'error']
     * @throws Exception
     */
    function httpClient(string $url, array $options = []): array
    {
        $method = strtoupper($options['method'] ?? 'GET');
        $headers = $options['headers'] ?? [];
        $body = $options['body'] ?? null;
        $timeout = $options['timeout'] ?? 30; // Default to 30 seconds
        $sslVerifyPeer = $options['ssl_verify_peer'] ?? true;
        $sslVerifyHost = $options['ssl_verify_host'] ?? true;
        $verbose = $options['verbose'] ?? false;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HEADER, true); // Include headers in the output
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_USERAGENT, 'GitHubCopilot-PHP-AmoCRM-Client/1.0');
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $sslVerifyPeer);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $sslVerifyHost ? 2 : 0);
        curl_setopt($ch, CURLOPT_VERBOSE, $verbose);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($body !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            }
        }

        if (!empty($headers)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }

        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpStatusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($curlError) {
            curl_close($ch);
            throw new Exception("cURL Error for $url: " . $curlError);
        }

        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $responseHeaders = substr($response, 0, $headerSize);
        $responseBody = substr($response, $headerSize);

        curl_close($ch);

        return [
            'statusCode' => $httpStatusCode,
            'body' => $responseBody,
            'headers' => $responseHeaders, // You might want to parse this into an array
            'error' => $curlError // Include cURL error for consistency
        ];
    }
}

/**
 * Handles the common lifecycle of a locked, POST-only API endpoint.
 *
 * This function encapsulates:
 * - Setting the JSON content type header.
 * - Checking for the POST request method.
 * - Managing a lock file to prevent concurrent execution.
 * - Registering a shutdown function to ensure the lock file is removed.
 * - Calling a user-provided function to perform the main logic.
 * - Echoing the result of the main logic as a JSON response.
 *
 * @param string $lockFilePath The absolute path to the lock file to use.
 * @param callable $processingFunction The function to execute for processing the request.
 *                                      This function should return an array with 'status', 'message', and optionally other data.
 *                                      It will also receive the HTTP status code to be set on success as a parameter.
 * @param int $successStatusCode The HTTP status code to return on successful processing (e.g., 200 OK, 201 Created).
 */
function handleLockedPostRequest(string $lockFilePath, callable $processingFunction, int $successStatusCode = 200) {
    if (ob_get_level() == 0) {
        ob_start();
    }

    header('Content-Type: application/json; charset=UTF-8');

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        logMessage("Request rejected. Method not allowed: " . $_SERVER['REQUEST_METHOD'], 'WARNING');
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted.']);
        if (ob_get_level() > 0) ob_end_flush();
        exit;
    }

    if (file_exists($lockFilePath)) {
        logMessage("Request rejected. Lock file exists: $lockFilePath", 'INFO');
        http_response_code(429); // 429 Too Many Requests is more appropriate than 200 for a locked state
        echo json_encode(['status' => 'locked', 'message' => 'Another process is already running. Please try again later.']);
        if (ob_get_level() > 0) ob_end_flush();
        exit;
    }

    if (false === touch($lockFilePath)) {
        logMessage("Could not create lock file: $lockFilePath", 'ERROR');
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Server error: Failed to create lock file.']);
        if (ob_get_level() > 0) ob_end_flush();
        exit;
    }

    register_shutdown_function(function() use ($lockFilePath) {
        if (file_exists($lockFilePath)) {
            unlink($lockFilePath);
            logMessage("Lock file removed: $lockFilePath", 'INFO');
        }
        if (ob_get_level() > 0) {
            ob_end_flush();
        }
    });

    try {
        $result = $processingFunction($successStatusCode);
        
        if (!isset($result['http_code'])) {
            // If the processing function doesn't explicitly set a code, use the default success/error codes
            http_response_code(isset($result['status']) && $result['status'] === 'success' ? $successStatusCode : 400);
        } else {
            http_response_code($result['http_code']);
            unset($result['http_code']); // Don't include it in the JSON output
        }

        echo json_encode($result);

    } catch (Exception $e) {
        logMessage("An exception occurred: " . $e->getMessage(), 'ERROR');
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'An internal server error occurred.']);
    }
    
    exit;
}

?>
