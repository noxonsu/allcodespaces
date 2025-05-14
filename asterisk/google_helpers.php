<?php

// --- Google API Client Function ---
function getGoogleServiceClient($credentialsPath) {
    $client = new Google\Client();
    $client->setApplicationName('Call Center Dashboard');
    $client->setAuthConfig($credentialsPath);
    $client->setScopes([Google\Service\Sheets::SPREADSHEETS_READONLY]);
    return new Google\Service\Sheets($client);
}

function fetchFromGoogleSheet($service, $sheetId, $range) {
    try {
        $response = $service->spreadsheets_values->get($sheetId, $range);
        return $response->getValues();
    } catch (Exception $e) {
        error_log('Google Sheets API Error fetching range ' . $range . ': ' . $e->getMessage());
        return null;
    }
}

?>
