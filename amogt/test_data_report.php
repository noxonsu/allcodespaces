<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/json_storage_utils.php';

// Define the reports file path (same as in zeno_report.php)
define('ZENO_REPORTS_JSON_FILE', __DIR__ . '/data/zeno_report.json');

header('Content-Type: application/json; charset=UTF-8');

try {
    // Load the reports data
    $reportsData = loadDataFromFile(ZENO_REPORTS_JSON_FILE);
    
    if (empty($reportsData)) {
        echo json_encode([
            'message' => 'No reports found or file is empty',
            'file_path' => ZENO_REPORTS_JSON_FILE,
            'reports' => []
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } else {
        echo json_encode([
            'message' => 'Zeno reports data',
            'total_reports' => count($reportsData),
            'file_path' => ZENO_REPORTS_JSON_FILE,
            'reports' => $reportsData
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to read reports file',
        'message' => $e->getMessage(),
        'file_path' => ZENO_REPORTS_JSON_FILE
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
?>
