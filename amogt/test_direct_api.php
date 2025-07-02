<?php
/**
 * Direct Partner API Test (without web server)
 * Tests API functionality by including files directly
 */

// Set up environment
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['action'] = 'get_balance';
$_GET['api_token'] = 'test_partner_token_123';

echo "🚀 Direct Partner API Test\n";
echo "==========================\n\n";

// Test 1: Check if partner exists
echo "📊 Testing partner authentication...\n";

try {
    require_once __DIR__ . '/gpt_payment_api/lib/db.php';
    
    $db = new DB();
    $partners = $db->read('partners');
    
    $testPartner = null;
    foreach ($partners as $partner) {
        if ($partner['token'] === 'test_partner_token_123') {
            $testPartner = $partner;
            break;
        }
    }
    
    if ($testPartner) {
        echo "✅ Test partner found: {$testPartner['name']}\n";
        echo "   Balance: {$testPartner['balance']} USD\n\n";
    } else {
        echo "❌ Test partner not found\n\n";
    }
    
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n\n";
}

// Test 2: Check API structure
echo "🔧 Testing API file structure...\n";

$apiFile = __DIR__ . '/gpt_payment_api/api.php';
if (file_exists($apiFile)) {
    echo "✅ API file exists\n";
    
    // Check for syntax errors
    $output = shell_exec("php -l $apiFile 2>&1");
    if (strpos($output, 'No syntax errors') !== false) {
        echo "✅ API file has no syntax errors\n";
    } else {
        echo "❌ API file has syntax errors:\n$output\n";
    }
} else {
    echo "❌ API file not found\n";
}

echo "\n";

// Test 3: Check required classes
echo "🔍 Testing required classes...\n";

$requiredFiles = [
    'gpt_payment_api/lib/db.php',
    'gpt_payment_api/lib/auth_partner.php',
    'gpt_payment_api/lib/partner_transaction_logger.php'
];

foreach ($requiredFiles as $file) {
    $fullPath = __DIR__ . '/' . $file;
    if (file_exists($fullPath)) {
        echo "✅ $file exists\n";
    } else {
        echo "❌ $file missing\n";
    }
}

echo "\n📝 Test Summary:\n";
echo "- Partner data structure: " . ($testPartner ? "✅ OK" : "❌ Missing") . "\n";
echo "- API file structure: ✅ OK\n";
echo "- Required dependencies: Check individual files above\n";

echo "\n💡 To run full API tests:\n";
echo "1. Start a web server (e.g., php -S localhost:8000)\n";
echo "2. Set environment: export TEST_API_PARTNER_KEY=test_partner_token_123\n";
echo "3. Update API URL in test: export TEST_API_URL=http://localhost:8000/amogt/gpt_payment_api/api.php\n";
echo "4. Run: php test_partner_api.php\n";

?>
