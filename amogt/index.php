<?php // filepath: /workspaces/allcodespaces/amogt/index.php
#!/usr/bin/env php



declare(strict_types=1);

set_time_limit(35); // No time limit for script execution
// Show all errors for development
error_reporting(E_ALL);
ini_set('display_errors', '1');

//prevent double run
if (file_exists(__DIR__ . '/lockfile')) {
    echo "Script is already running.\n";
    exit(1);
}
file_put_contents(__DIR__ . '/lockfile', getmypid());

// Register shutdown function to remove lockfile
register_shutdown_function(function () {
    if (file_exists(__DIR__ . '/lockfile')) {
        unlink(__DIR__ . '/lockfile');
    }
});


// Set a default timezone if not set in php.ini
if (!ini_get('date.timezone')) {
    date_default_timezone_set('UTC'); // Or your preferred timezone
}

// Assume these files are in the same directory or adjust paths accordingly
require_once __DIR__ . '/logger.php'; // Add this line before other requires
require_once __DIR__ . '/config.php'; // Defines constants like AMO_DOMAIN, AMO_INTEGRATION_ID, etc.
require_once __DIR__ . '/amo2excel.php'; // Defines pushToExcelSheet()
require_once __DIR__ . '/excel2amo.php'; // Defines startExcelSheetSync()

/**
 * Basic HTTP client function using cURL.
 *
 * @param string $url
 * @param array $options 'method', 'headers', 'body' (for POST, typically JSON string)
 * @return array ['statusCode', 'body', 'headers']
 * @throws Exception
 */
function httpClient(string $url, array $options = []): array
{
    $method = strtoupper($options['method'] ?? 'GET');
    $headers = $options['headers'] ?? [];
    $body = $options['body'] ?? null;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true); // Include headers in the output
    curl_setopt($ch, CURLOPT_TIMEOUT, 30); // 30 seconds timeout
    curl_setopt($ch, CURLOPT_USERAGENT, 'GitHubCopilot-PHP-AmoCRM-Client/1.0');

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
    } elseif ($method !== 'GET') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
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
        'headers' => $responseHeaders // You might want to parse this into an array
    ];
}

function getAuthUrl(): string
{
    return sprintf(
        'https://www.amocrm.ru/oauth?client_id=%s&mode=popup',
        AMO_INTEGRATION_ID
    );
}

/**
 * @throws Exception
 */
function getNewTokens(string $authCode): array
{
    logMessage('[Auth] Attempting to get new tokens with authCode: ' . ($authCode ? 'provided' : 'MISSING'));
    if (empty($authCode)) {
        throw new Exception('Authorization code is missing for getNewTokens.');
    }

    $payload = json_encode([
        'client_id' => AMO_INTEGRATION_ID,
        'client_secret' => AMO_SECRET_KEY,
        'grant_type' => 'authorization_code',
        'code' => $authCode,
        'redirect_uri' => AMO_REDIRECT_URI
    ]);

    $response = httpClient(AMO_DOMAIN . '/oauth2/access_token', [
        'method' => 'POST',
        'headers' => ['Content-Type: application/json'],
        'body' => $payload
    ]);

    if ($response['statusCode'] >= 400) {
        logMessage('[Auth] Failed to get new tokens. Status: ' . $response['statusCode'] . ' Body: ' . $response['body']);
        throw new Exception('Failed to get new tokens: ' . $response['statusCode'] . '. Body: ' . $response['body']);
    }

    $tokens = json_decode($response['body'], true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Failed to parse tokens JSON: ' . json_last_error_msg());
    }
    logMessage('[Auth] Successfully obtained new tokens.');
    saveTokens($tokens);
    return $tokens;
}

/**
 * @throws Exception
 */
function refreshTokens(string $refreshToken): array
{
    logMessage('[Auth] Attempting to refresh tokens.');
    $payload = json_encode([
        'client_id' => AMO_INTEGRATION_ID,
        'client_secret' => AMO_SECRET_KEY,
        'grant_type' => 'refresh_token',
        'refresh_token' => $refreshToken,
        'redirect_uri' => AMO_REDIRECT_URI
    ]);

    $response = httpClient(AMO_DOMAIN . '/oauth2/access_token', [
        'method' => 'POST',
        'headers' => ['Content-Type: application/json'],
        'body' => $payload
    ]);

    if ($response['statusCode'] >= 400) {
        logMessage('[Auth] Failed to refresh tokens. Status: ' . $response['statusCode'] . ' Body: ' . $response['body']);
        throw new Exception('Failed to refresh tokens: ' . $response['statusCode'] . '. Body: ' . $response['body']);
    }

    $tokens = json_decode($response['body'], true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Failed to parse refreshed tokens JSON: ' . json_last_error_msg());
    }
    logMessage('[Auth] Successfully refreshed tokens.');
    saveTokens($tokens);
    return $tokens;
}

function saveTokens(array $tokens): void
{
    logMessage('[Auth] Saving tokens to: ' . AMO_TOKENS_PATH);
    if (file_put_contents(AMO_TOKENS_PATH, json_encode($tokens, JSON_PRETTY_PRINT)) === false) {
        logMessage('[Auth] Failed to save tokens.');
        // Consider throwing an exception or logging more severely
    }
}

function loadTokens(): ?array
{
    logMessage('[Auth] Attempting to load tokens from: ' . AMO_TOKENS_PATH);
    if (!file_exists(AMO_TOKENS_PATH)) {
        logMessage('[Auth] No tokens file found.');
        return null;
    }
    $data = file_get_contents(AMO_TOKENS_PATH);
    if ($data === false) {
        logMessage('[Auth] Error reading tokens file.');
        return null;
    }
    $tokens = json_decode($data, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        logMessage('[Auth] Error parsing tokens JSON: ' . json_last_error_msg());
        return null;
    }
    logMessage('[Auth] Tokens loaded successfully.');
    return $tokens;
}

/**
 * @return array|null Returns tokens on success, null on failure that doesn't exit. Exits on critical auth failure.
 * @throws Exception
 */
function checkAmoAccess(): ?array
{
    $tokens = loadTokens();
    $amoAuthCodeUsed = false;

    if (!$tokens) {
        logMessage('[Auth] No stored tokens found.');
        $authCodeFromEnv = AMO_AUTH_CODE; // From config.php
        if ($authCodeFromEnv) {
            logMessage('[Auth] AMO_AUTH_CODE found in config. Attempting to get initial tokens.');
            try {
                $tokens = getNewTokens($authCodeFromEnv);
                $amoAuthCodeUsed = true;
                logMessage('[Auth] Successfully obtained tokens using AMO_AUTH_CODE. It is recommended to remove AMO_AUTH_CODE from .env now.');
            } catch (Exception $e) {
                logMessage('[Auth] Failed to get tokens using AMO_AUTH_CODE from config: ' . $e->getMessage());
            }
        }
    }

    if ($tokens) {
        try {
            logMessage('[Auth] Attempting to verify access token.');
            $response = httpClient(AMO_DOMAIN . '/api/v4/leads', [
                'headers' => ['Authorization: Bearer ' . $tokens['access_token']]
            ]);

            if ($response['statusCode'] === 401 && isset($tokens['refresh_token'])) {
                logMessage('[Auth] Access token expired or invalid (401). Attempting to refresh.');
                try {
                    $tokens = refreshTokens($tokens['refresh_token']);
                    logMessage('[Auth] Retrying API call with new refreshed access token.');
                    $response = httpClient(AMO_DOMAIN . '/api/v4/leads', [
                        'headers' => ['Authorization: Bearer ' . $tokens['access_token']]
                    ]);
                } catch (Exception $refreshError) {
                    logMessage('[Auth] Failed to refresh token: ' . $refreshError->getMessage());
                    $tokens = null;
                }
            }

            if ($tokens && $response['statusCode'] < 400) {
                logMessage('[Auth] ✅ Доступ к API AmoCRM подтвержден');
                return $tokens;
            } elseif ($tokens) {
                logMessage('[Auth] API AmoCRM request failed. Status: ' . $response['statusCode'] . '. Response: ' . $response['body']);
            }
        } catch (Exception $apiError) {
            logMessage('[Auth] Error during AmoCRM API access check: ' . $apiError->getMessage());
        }
    }

    $authInstructions = sprintf(
        "[Auth]\n" .
        "--------------------------------------------------------------------\n" .
        "ОШИБКА ДОСТУПА К AmoCRM или НЕОБХОДИМА АВТОРИЗАЦИЯ!\n" .
        "%s\n\n" .
        "Для работы необходимо получить НОВЫЙ код авторизации AmoCRM:\n" .
        "1. Перейдите по ссылке: %s\n" .
        "2. Разрешите доступ приложению.\n" .
        "3. После перенаправления на %s, скопируйте значение параметра 'code' из адресной строки браузера.\n" .
        "   Пример URL: %s/?code=ВАШ_КОД_АВТОРИЗАЦИИ&referer=...\n" .
        "4. Вставьте этот НОВЫЙ код в файл .env как AMO_AUTH_CODE=ВАШ_КОД_АВТОРИЗАЦИИ (или в config.php)\n" .
        "5. Перезапустите приложение. Старый код авторизации (если был) уже недействителен.\n" .
        "--------------------------------------------------------------------\n",
        $amoAuthCodeUsed ? 'Попытка использовать AMO_AUTH_CODE из конфигурации не удалась или полученные токены не работают.' : 'Действующие токены отсутствуют или невалидны.',
        getAuthUrl(),
        AMO_DOMAIN,
        AMO_DOMAIN
    );
    logMessage($authInstructions);
    return null;
}

function main(): void
{
    logMessage('[Main] Initial value of config.DEFAULT_SHEET_NAME: "' . (defined('DEFAULT_SHEET_NAME') ? DEFAULT_SHEET_NAME : 'NOT SET') . '"');
    
    logMessage("--- [Main] Starting execution at " . date('c') . " ---");
    $currentAccessToken = null;

    try {
        $amoTokens = checkAmoAccess();

        if ($amoTokens && !empty($amoTokens['access_token'])) {
            $currentAccessToken = $amoTokens['access_token'];
            logMessage("[Main] AmoCRM access confirmed.");

        } else {
            logMessage('[Main] Could not obtain/verify AmoCRM OAuth tokens. Auth instructions should have been printed by checkAmoAccess(). Skipping API-dependent operations that require OAuth.');
        }

        if (defined('GOOGLE_DRIVE_FILE_ID_EXCEL2AMO') && GOOGLE_DRIVE_FILE_ID_EXCEL2AMO &&
            defined('DEFAULT_SHEET_NAME') && DEFAULT_SHEET_NAME &&
            defined('GOOGLE_KEY_FILE') && file_exists(GOOGLE_KEY_FILE)) {
            if ($currentAccessToken) {
                logMessage("[Main] Running: Excel -> AmoCRM Sync (excel2amo) with current OAuth token...");
                startExcelSheetSync($currentAccessToken);
            } elseif (defined('AMO_TOKEN') && AMO_TOKEN) {
                logMessage("[Main] Running: Excel -> AmoCRM Sync (excel2amo) with AMO_TOKEN from config (OAuth token not available)...");
                startExcelSheetSync(null);
            } else {
                logMessage("[Main] No AmoCRM token (OAuth or direct) available for Excel -> AmoCRM Sync, skipping this part.");
            }
        } else {
            logMessage("[Main] Prerequisites for Excel -> AmoCRM Sync (excel2amo) not met, skipping this part.");
        }

    } catch (Exception $error) {
        logMessage("[Main] Error during execution: " . $error->getMessage() . PHP_EOL . $error->getTraceAsString());
    }

    logMessage("--- [Main] Execution finished at " . date('c') . " ---");
}

try {
    main();
} catch (Throwable $e) { // Catch Throwable to include Errors as well in PHP 7+
    logMessage('[Main] Critical error in main execution: ' . $e->getMessage() . PHP_EOL . $e->getTraceAsString());
    exit(1);
}

?>