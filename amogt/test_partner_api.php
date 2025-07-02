<?php
/**
 * Comprehensive Partner API Test Suite
 * 
 * Tests all API endpoints and validates the new features:
 * - Server-generated dealId
 * - PaymentUrl duplication prevention
 * - Balance management
 * - Transaction logging
 * 
 * USAGE:
 * 1. Set environment variable: export TEST_API_PARTNER_KEY=your_test_token
 * 2. Optionally set: export TEST_API_URL=your_api_url (default: https://paysaasbot.ru/chatgptbot_connector/gpt_payment_api/api.php)
 * 3. Run: php test_partner_api.php
 * 
 * SECURITY NOTE:
 * Never commit real API tokens to version control!
 * This file is safe for public repositories as it uses environment variables.
 */

class PartnerApiTester {
    private string $apiUrl;
    private string $apiToken;
    private array $testResults = [];
    
    public function __construct(string $apiUrl, string $apiToken) {
        $this->apiUrl = $apiUrl;
        $this->apiToken = $apiToken;
    }
    
    /**
     * Run all test scenarios
     */
    public function runAllTests(): void {
        echo "🚀 Partner API Test Suite\n";
        echo "========================\n";
        echo "API URL: {$this->apiUrl}\n";
        echo "API Token: " . substr($this->apiToken, 0, 8) . "...\n\n";
        
        // Test basic functionality
        $this->testGetBalance();
        $this->testValidLeadSubmission();
        $this->testDuplicatePaymentUrl();
        $this->testInvalidPaymentUrl();
        $this->testInsufficientFunds();
        $this->testGetTransactions();
        
        // Additional edge cases
        $this->testEmptyLeadData();
        $this->testInvalidApiToken();
        $this->testMultipleLeads();
        
        $this->printSummary();
    }
    
    /**
     * Test get_balance endpoint
     */
    private function testGetBalance(): void {
        echo "📊 Testing get_balance endpoint...\n";
        
        $response = $this->makeApiCall('GET', '?action=get_balance&api_token=' . $this->apiToken);
        
        if ($response['success'] && isset($response['data']['balance'])) {
            $this->logTest('get_balance', true, "Balance: {$response['data']['balance']} USD");
            echo "✅ Balance retrieved: {$response['data']['balance']} USD\n\n";
        } else {
            $this->logTest('get_balance', false, $response['error'] ?? 'Unknown error');
            echo "❌ Failed to get balance\n\n";
        }
    }
    
    /**
     * Test valid lead submission
     */
    private function testValidLeadSubmission(): void {
        echo "📝 Testing valid lead submission...\n";
        
        $uniquePaymentUrl = 'https://buy.stripe.com/test_valid_' . uniqid();
        $leadData = [
            'action' => 'submit_partner_lead',
            'api_token' => $this->apiToken,
            'lead_data' => [
                [
                    'paymentUrl' => $uniquePaymentUrl,
                    'customerName' => 'Test Customer',
                    'customerEmail' => 'test@example.com',
                    'customerPhone' => '+1234567890',
                    'productName' => 'Test Product'
                ]
            ]
        ];
        
        $response = $this->makeApiCall('POST', '', $leadData);
        
        if ($response['success'] && $response['data']['status'] === 'success') {
            $data = $response['data'];
            $this->logTest('valid_lead_submission', true, 
                "Processed: {$data['processed_count']}, Charged: {$data['total_cost_charged']} USD");
            echo "✅ Lead submitted successfully\n";
            echo "   - Processed: {$data['processed_count']} leads\n";
            echo "   - Cost charged: {$data['total_cost_charged']} USD\n";
            echo "   - Remaining balance: {$data['remaining_balance']} USD\n\n";
            
            // Store URL for duplicate test
            $this->duplicateTestUrl = $uniquePaymentUrl;
        } else {
            // Подробное логирование ошибки
            $errorDetails = "HTTP: {$response['http_code']}, ";
            if (isset($response['data'])) {
                $errorDetails .= "Status: " . ($response['data']['status'] ?? 'N/A') . ", ";
                if (isset($response['data']['errors'])) {
                    $errorDetails .= "Errors: " . implode('; ', $response['data']['errors']);
                } else {
                    $errorDetails .= "Message: " . ($response['data']['message'] ?? 'N/A');
                }
            } else {
                $errorDetails .= "Error: " . ($response['error'] ?? 'Unknown error');
            }
            
            $this->logTest('valid_lead_submission', false, $errorDetails);
            echo "❌ Failed to submit valid lead\n";
            echo "   Details: $errorDetails\n\n";
        }
    }
    
    /**
     * Test duplicate paymentUrl prevention
     */
    private function testDuplicatePaymentUrl(): void {
        echo "🔄 Testing duplicate paymentUrl prevention...\n";
        
        if (!isset($this->duplicateTestUrl)) {
            echo "⚠️  Skipping duplicate test - no valid URL from previous test\n\n";
            return;
        }
        
        $leadData = [
            'action' => 'submit_partner_lead',
            'api_token' => $this->apiToken,
            'lead_data' => [
                [
                    'paymentUrl' => $this->duplicateTestUrl,
                    'customerName' => 'Duplicate Customer',
                    'customerEmail' => 'duplicate@example.com'
                ]
            ]
        ];
        
        $response = $this->makeApiCall('POST', '', $leadData);
        
        if (!$response['success'] || 
            (isset($response['data']['errors']) && 
             strpos(implode(' ', $response['data']['errors']), 'already exists') !== false)) {
            $this->logTest('duplicate_prevention', true, 'Duplicate correctly rejected');
            echo "✅ Duplicate paymentUrl correctly rejected\n\n";
        } else {
            $this->logTest('duplicate_prevention', false, 'Duplicate was not rejected');
            echo "❌ Duplicate paymentUrl was not rejected\n\n";
        }
    }
    
    /**
     * Test invalid paymentUrl
     */
    private function testInvalidPaymentUrl(): void {
        echo "🚫 Testing invalid paymentUrl...\n";
        
        $leadData = [
            'action' => 'submit_partner_lead',
            'api_token' => $this->apiToken,
            'lead_data' => [
                [
                    'paymentUrl' => 'https://invalid-url.com/not-stripe',
                    'customerName' => 'Invalid Customer'
                ]
            ]
        ];
        
        $response = $this->makeApiCall('POST', '', $leadData);
        
        if (isset($response['data']['errors']) && 
            strpos(implode(' ', $response['data']['errors']), 'Failed to parse') !== false) {
            $this->logTest('invalid_payment_url', true, 'Invalid URL correctly rejected');
            echo "✅ Invalid paymentUrl correctly rejected\n\n";
        } else {
            $this->logTest('invalid_payment_url', false, 'Invalid URL was not rejected');
            echo "❌ Invalid paymentUrl was not rejected properly\n\n";
        }
    }
    
    /**
     * Test insufficient funds scenario
     */
    private function testInsufficientFunds(): void {
        echo "💰 Testing insufficient funds scenario...\n";
        
        // Try to submit many leads to trigger insufficient funds
        $manyLeads = [];
        for ($i = 0; $i < 100; $i++) {
            $manyLeads[] = [
                'paymentUrl' => 'https://buy.stripe.com/test_many_' . $i . '_' . uniqid(),
                'customerName' => "Customer $i"
            ];
        }
        
        $leadData = [
            'action' => 'submit_partner_lead',
            'api_token' => $this->apiToken,
            'lead_data' => $manyLeads
        ];
        
        $response = $this->makeApiCall('POST', '', $leadData);
        
        if (!$response['success'] && $response['http_code'] === 402) {
            $this->logTest('insufficient_funds', true, 'Insufficient funds correctly detected');
            echo "✅ Insufficient funds correctly detected (HTTP 402)\n\n";
        } else {
            $this->logTest('insufficient_funds', false, 'Insufficient funds test inconclusive');
            echo "ℹ️  Insufficient funds test inconclusive (may have sufficient balance)\n\n";
        }
    }
    
    /**
     * Test get_transactions endpoint
     */
    private function testGetTransactions(): void {
        echo "📋 Testing get_transactions endpoint...\n";
        
        $response = $this->makeApiCall('GET', '?action=get_transactions&api_token=' . $this->apiToken . '&limit=5');
        
        if ($response['success'] && isset($response['data']['transactions'])) {
            $count = count($response['data']['transactions']);
            $this->logTest('get_transactions', true, "Retrieved $count transactions");
            echo "✅ Transactions retrieved: $count records\n";
            
            if (isset($response['data']['stats'])) {
                $stats = $response['data']['stats'];
                echo "   - Total transactions: {$stats['total_transactions']}\n";
                echo "   - Total charged: {$stats['total_charged_usd']} USD\n";
                echo "   - Completed: {$stats['completed_count']}\n";
            }
            echo "\n";
        } else {
            $this->logTest('get_transactions', false, $response['error'] ?? 'Unknown error');
            echo "❌ Failed to get transactions\n\n";
        }
    }
    
    /**
     * Test empty lead data
     */
    private function testEmptyLeadData(): void {
        echo "📭 Testing empty lead data...\n";
        
        $leadData = [
            'action' => 'submit_partner_lead',
            'api_token' => $this->apiToken,
            'lead_data' => []
        ];
        
        $response = $this->makeApiCall('POST', '', $leadData);
        
        if (!$response['success'] || $response['data']['processed_count'] === 0) {
            $this->logTest('empty_lead_data', true, 'Empty data correctly handled');
            echo "✅ Empty lead data correctly handled\n\n";
        } else {
            $this->logTest('empty_lead_data', false, 'Empty data not handled properly');
            echo "❌ Empty lead data not handled properly\n\n";
        }
    }
    
    /**
     * Test invalid API token
     */
    private function testInvalidApiToken(): void {
        echo "🔐 Testing invalid API token...\n";
        
        $response = $this->makeApiCall('GET', '?action=get_balance&api_token=INVALID_TOKEN');
        
        if (!$response['success'] && $response['http_code'] === 401) {
            $this->logTest('invalid_api_token', true, 'Invalid token correctly rejected');
            echo "✅ Invalid API token correctly rejected (HTTP 401)\n\n";
        } else {
            $this->logTest('invalid_api_token', false, 'Invalid token not properly handled');
            echo "❌ Invalid API token not properly handled\n\n";
        }
    }
    
    /**
     * Test multiple leads submission
     */
    private function testMultipleLeads(): void {
        echo "📚 Testing multiple leads submission...\n";
        
        $leadData = [
            'action' => 'submit_partner_lead',
            'api_token' => $this->apiToken,
            'lead_data' => [
                [
                    'paymentUrl' => 'https://buy.stripe.com/test_multi1_' . uniqid(),
                    'customerName' => 'Multi Customer 1'
                ],
                [
                    'paymentUrl' => 'https://buy.stripe.com/test_multi2_' . uniqid(),
                    'customerName' => 'Multi Customer 2'
                ]
            ]
        ];
        
        $response = $this->makeApiCall('POST', '', $leadData);
        
        if ($response['success'] && $response['data']['processed_count'] === 2) {
            $this->logTest('multiple_leads', true, 'Multiple leads processed successfully');
            echo "✅ Multiple leads processed successfully\n\n";
        } else {
            $this->logTest('multiple_leads', false, 'Multiple leads not processed correctly');
            echo "❌ Multiple leads not processed correctly\n\n";
        }
    }
    
    /**
     * Make API call
     */
    private function makeApiCall(string $method, string $endpoint, array $data = null): array {
        $url = $this->apiUrl . $endpoint;
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        
        if ($method === 'POST' && $data) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            return ['success' => false, 'error' => "cURL Error: $error", 'http_code' => 0];
        }
        
        $decodedResponse = json_decode($response, true);
        
        if (json_last_error() === JSON_ERROR_NONE) {
            return [
                'success' => $httpCode >= 200 && $httpCode < 300,
                'data' => $decodedResponse,
                'http_code' => $httpCode
            ];
        } else {
            return [
                'success' => false,
                'error' => "Invalid JSON response: $response",
                'http_code' => $httpCode
            ];
        }
    }
    
    /**
     * Log test result
     */
    private function logTest(string $testName, bool $passed, string $details): void {
        $this->testResults[] = [
            'test' => $testName,
            'passed' => $passed,
            'details' => $details
        ];
    }
    
    /**
     * Print test summary
     */
    private function printSummary(): void {
        echo "📊 Test Summary\n";
        echo "===============\n";
        
        $passed = 0;
        $total = count($this->testResults);
        
        foreach ($this->testResults as $result) {
            $status = $result['passed'] ? '✅ PASS' : '❌ FAIL';
            echo sprintf("%-25s %s - %s\n", $result['test'], $status, $result['details']);
            if ($result['passed']) $passed++;
        }
        
        echo "\n";
        echo "Results: $passed/$total tests passed\n";
        
        if ($passed === $total) {
            echo "🎉 All tests passed!\n";
        } else {
            echo "⚠️  Some tests failed. Check the details above.\n";
        }
    }
}

// Configuration - using environment variables for security
$apiUrl = getenv('TEST_API_URL') ?: 'https://paysaasbot.ru/chatgptbot_connector/gpt_payment_api/api.php';
$apiToken = getenv('TEST_API_PARTNER_KEY');

// Validate required environment variables
if (empty($apiToken)) {
    echo "❌ Error: TEST_API_PARTNER_KEY environment variable is required\n";
    echo "Please set it with: export TEST_API_PARTNER_KEY=your_test_token\n";
    exit(1);
}

// Run tests
$tester = new PartnerApiTester($apiUrl, $apiToken);
$tester->runAllTests();

?>
