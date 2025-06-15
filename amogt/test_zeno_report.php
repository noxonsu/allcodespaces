<?php
// amogt/test_zeno_report.php

// Configuration
$zeno_report_url = './zeno_report.php';

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
    echo "Simulating GET request for Lead ID: " . $scenario['lead_id'] . "\n";

    // Simulate $_GET parameters
    $_GET = array_merge(['id' => $scenario['lead_id']], $scenario['data']);

    // Capture output of zeno_report.php
    ob_start();
    require __DIR__ . '/zeno_report.php';
    $response = ob_get_clean();

    // zeno_report.php sets HTTP headers and exits, so we need to parse its output
    // and capture the JSON response.
    // We'll assume the last JSON block in the output is the response.
    $response_data = null;
    $json_start = strrpos($response, '{');
    $json_end = strrpos($response, '}');
    if ($json_start !== false && $json_end !== false && $json_end > $json_start) {
        $json_string = substr($response, $json_start, $json_end - $json_start + 1);
        $response_data = json_decode($json_string, true);
    }

    // Since zeno_report.php exits, we can't get HTTP code directly.
    // We'll rely on the 'status' field in the JSON response.
    $http_code = 'N/A (simulated)';
    $curl_error = null; // No cURL error in this simulation

    echo "Response Body:\n";

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
