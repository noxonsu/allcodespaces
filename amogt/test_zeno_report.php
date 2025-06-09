<?php
// amogt/test_zeno_report.php

// Configuration
$zeno_report_url = 'https://paysaasbot.ru/chatgptbot_connector/zeno_report.php';

// Sample lead ID (replace with an actual lead ID from your allLeads.json for testing)
// You can get a lead ID by running amogt/amodeals_json.php
$test_lead_id = 'lead_6846dcc69c4e2'; // Replace with a real lead ID from allLeads.json

// Test Scenarios
$scenarios = [
    [
        'name' => 'Successful Report (no partner_id)',
        'lead_id' => $test_lead_id,
        'data' => [
            'status' => 'Успешно',
            'amount' => '100.00',
            'currency' => 'USD',
            'email' => 'test@example.com',
            'card' => '**** **** **** 1234'
        ],
        'expected_status' => 'success'
    ],
    [
        'name' => 'Error Report (no partner_id)',
        'lead_id' => 'lead_error_test', // Use a different ID for this test
        'data' => [
            'status' => 'ОШИБКА!',
            'message' => 'Payment failed due to card decline.'
        ],
        'expected_status' => 'success' // The report itself should be saved successfully
    ],
    [
        'name' => 'Report with partner_id (should skip AmoCRM update)',
        'lead_id' => 'lead_partner_test', // Use a different ID for this test
        'data' => [
            'status' => 'Успешно',
            'amount' => '50.00',
            'currency' => 'EUR',
            'partner_id' => 'partner_test_id'
        ],
        'expected_status' => 'success'
    ],
    [
        'name' => 'Missing Status Parameter',
        'lead_id' => 'lead_missing_status',
        'data' => [
            'amount' => '200.00'
        ],
        'expected_status' => 'error'
    ],
    [
        'name' => 'Invalid Status Value',
        'lead_id' => 'lead_invalid_status',
        'data' => [
            'status' => 'Pending' // Invalid status
        ],
        'expected_status' => 'error'
    ]
];

echo "=== Testing Zeno Report API ===\n";

foreach ($scenarios as $scenario) {
    echo "\n--- Running Scenario: " . $scenario['name'] . " ---\n";
    $url = $zeno_report_url . '?id=' . $scenario['lead_id'];
    $post_data = http_build_query($scenario['data']);

    echo "URL: $url\n";
    echo "POST Data: $post_data\n";

    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post_data,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/x-www-form-urlencoded',
            'Content-Length: ' . strlen($post_data)
        ],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_VERBOSE => false
    ]);

    echo "Sending request...\n";
    $response = curl_exec($curl);
    $http_code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($curl);

    curl_close($curl);

    if ($curl_error) {
        echo "cURL Error: $curl_error\n";
        continue;
    }

    echo "HTTP Code: $http_code\n";
    echo "Response Body:\n";

    $response_data = json_decode($response, true);

    if (json_last_error() === JSON_ERROR_NONE) {
        echo json_encode($response_data, JSON_PRETTY_PRINT) . "\n";
        if (isset($response_data['status']) && $response_data['status'] === $scenario['expected_status']) {
            echo "Scenario Result: PASSED (Expected status '{$scenario['expected_status']}' received)\n";
        } else {
            echo "Scenario Result: FAILED (Expected status '{$scenario['expected_status']}', but got '" . ($response_data['status'] ?? 'N/A') . "')\n";
        }
    } else {
        echo "Raw response (not valid JSON):\n$response\n";
        echo "JSON decode error: " . json_last_error_msg() . "\n";
        echo "Scenario Result: FAILED (Invalid JSON response)\n";
    }
}

echo "\n=== All Zeno Report Tests Complete ===\n";

?>
