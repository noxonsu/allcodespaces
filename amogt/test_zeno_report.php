<?php
// amogt/test_zeno_report.php

// Configuration
$zeno_report_url = 'https://paysaasbot.ru/chatgptbot_connector/zeno_report.php';

// Delay between requests to avoid AmoCRM rate limiting (in seconds)
$delay_between_requests = 3;

// Set to specific scenario index (0-4) to run only one test, or null to run all
$run_single_scenario = null; // Change to 0, 1, 2, 3, or 4 to run specific scenario only

// Sample lead ID (replace with an actual lead ID from your allLeads.json for testing)
// You can get a lead ID by running amogt/amodeals_json.php
$test_lead_id = '18536300'; // Replace with a real lead ID from allLeads.json

// Test Scenarios
$scenarios = [
    [
        'name' => 'Successful Report (no partner_id)',
        'lead_id' => $test_lead_id,
        'data' => [
            'status' => 'Выполнено',
            'amount' => '100.00',
            'currency' => 'USD',
            'email' => 'test@example.com',
            'card' => '1234'
        ],
        'expected_status' => 'success'
    ]
];

echo "=== Testing Zeno Report API ===\n";

if ($run_single_scenario !== null) {
    echo "Running only scenario #{$run_single_scenario}\n";
    $scenarios_to_run = [$scenarios[$run_single_scenario]];
} else {
    echo "Running all scenarios with {$delay_between_requests}s delay between requests\n";
    $scenarios_to_run = $scenarios;
}

foreach ($scenarios_to_run as $index => $scenario) {
    if ($index > 0 && $run_single_scenario === null) {
        echo "\nWaiting {$delay_between_requests} seconds before next request to avoid rate limiting...\n";
        sleep($delay_between_requests);
    }
    
    echo "\n--- Running Scenario: " . $scenario['name'] . " ---\n";
    $url = $zeno_report_url . '?id=' . $scenario['lead_id'];
    $query_string = http_build_query($scenario['data']);
    $url = $zeno_report_url . '?id=' . $scenario['lead_id'] . '&' . $query_string;

    echo "URL: $url\n";

    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
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
