<?php

// Configuration
$api_url = 'https://paysaasbot.ru/chatgptbot_connector/gpt_payment_api/api.php';
$api_token = 'fd9be88e261c6d2ca38d87c5e2cb3ea8'; // Replace with actual API token

// Sample lead data for testing
$lead_data = [
    [
        'paymentUrl' => 'https://pay.openai.com/c/pay/cs_live_a1CtYtwEj0KJEyHUSn40Ir2m7hb0ybi8nEyGoQAWkVwrBE0RIbvxF5Rs79#fidpamZkaWAnPydgaycpJ3ZwZ3Zmd2x1cWxqa1BrbHRwYGtgdnZAa2RnaWBhJz9jZGl2YCknZHVsTmB8Jz8ndW5aaWxzYFowNE1Kd1ZyRjNtNGt9QmpMNmlRRGJXb1xTd38xYVA2Y1NKZGd8RmZOVzZ1Z0BPYnBGU0RpdEZ9YX1GUHNqV200XVJyV2RmU2xqc1A2bklOc3Vub20yTHRuUjU1bF1Udm9qNmsnKSdjd2poVmB3c2B3Jz9xd3BgKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl',
        'custom_field_example' => 'some_value'
    ]
];

// Prepare request data
$request_data = [
    'action' => 'submit_partner_lead',
    'api_token' => $api_token,
    'lead_data' => $lead_data
];

// Convert to JSON
$json_data = json_encode($request_data, JSON_PRETTY_PRINT);

echo "=== Testing Partner API ===\n";
echo "URL: $api_url\n";

echo "\n=== PAYLOAD STRUCTURE ===\n";
echo "Action: " . $request_data['action'] . "\n";
echo "API Token: " . $request_data['api_token'] . "\n";
echo "Lead Data Count: " . count($request_data['lead_data']) . "\n";
echo "\nFull Payload (JSON):\n";
echo str_repeat("=", 50) . "\n";
echo $json_data . "\n";
echo str_repeat("=", 50) . "\n";

echo "\nRequest Data:\n$json_data\n\n";

// Initialize cURL
$curl = curl_init();

curl_setopt_array($curl, [
    CURLOPT_URL => $api_url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $json_data,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Content-Length: ' . strlen($json_data)
    ],
    CURLOPT_TIMEOUT => 30,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_VERBOSE => false
]);

// Execute request
echo "Sending request...\n";
$response = curl_exec($curl);
$http_code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
$curl_error = curl_error($curl);

curl_close($curl);

// Handle cURL errors
if ($curl_error) {
    echo "cURL Error: $curl_error\n";
    exit(1);
}

// Display response
echo "=== Response ===\n";
echo "HTTP Code: $http_code\n";
echo "Response Body:\n";

// Try to decode JSON response
$response_data = json_decode($response, true);

if (json_last_error() === JSON_ERROR_NONE) {
    echo json_encode($response_data, JSON_PRETTY_PRINT) . "\n";
    
    // Display summary if successful
    if (isset($response_data['status']) && $response_data['status'] === 'success') {
        echo "\n=== Summary ===\n";
        echo "Status: SUCCESS\n";
        echo "Message: " . $response_data['message'] . "\n";
        echo "Processed: " . $response_data['processed_count'] . " leads\n";
        echo "Added to main list: " . $response_data['added_to_main_list_count'] . "\n";
        echo "Updated in main list: " . $response_data['updated_in_main_list_count'] . "\n";
        
        if (!empty($response_data['errors'])) {
            echo "Errors:\n";
            foreach ($response_data['errors'] as $error) {
                echo "  - $error\n";
            }
        }
    } else {
        echo "\n=== Error ===\n";
        echo "Status: FAILED\n";
        if (isset($response_data['message'])) {
            echo "Message: " . $response_data['message'] . "\n";
        }
    }
} else {
    echo "Raw response (not valid JSON):\n$response\n";
    echo "JSON decode error: " . json_last_error_msg() . "\n";
}

echo "\n=== Test Complete ===\n";

// Function to test with different scenarios
function runTestScenarios($api_url, $api_token) {
    echo "\n=== Running Additional Test Scenarios ===\n";
    
    // Test 1: Empty lead data
    testScenario($api_url, $api_token, [], "Empty lead data");
    
    // Test 2: Single lead
    testScenario($api_url, $api_token, [
        ['dealId' => '99999', 'paymentUrl' => 'https://test.com']
    ], "Single lead");
    
    // Test 3: Invalid API token
    testScenario($api_url, 'INVALID_TOKEN', [
        ['dealId' => '88888']
    ], "Invalid API token");
}

function testScenario($api_url, $api_token, $lead_data, $scenario_name) {
    echo "\n--- Testing: $scenario_name ---\n";
    
    $request_data = [
        'action' => 'submit_partner_lead',
        'api_token' => $api_token,
        'lead_data' => $lead_data
    ];
    
    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => $api_url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($request_data),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 10
    ]);
    
    $response = curl_exec($curl);
    $http_code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    
    echo "HTTP Code: $http_code\n";
    $response_data = json_decode($response, true);
    if ($response_data) {
        echo "Status: " . ($response_data['status'] ?? 'unknown') . "\n";
        echo "Message: " . ($response_data['message'] ?? 'no message') . "\n";
    }
}

// Uncomment the line below to run additional test scenarios
// runTestScenarios($api_url, $api_token);

?>
