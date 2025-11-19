<?php

declare(strict_types=1);

// Assume these files are in the same directory or adjust paths accordingly
// require_once __DIR__ . '/../logger.php'; // Logger should be included where these functions are used
// require_once __DIR__ . '/../config.php'; // Config should be included where these functions are used
require_once __DIR__ . '/request_utils.php'; // Include httpClient from here

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
                // Переименовываем неверный файл токенов
                $backupPath = str_replace('.json', '~.json', AMO_TOKENS_PATH);
                if (file_exists(AMO_TOKENS_PATH)) {
                    if (rename(AMO_TOKENS_PATH, $backupPath)) {
                        logMessage('[Auth] Неверный файл токенов переименован в: ' . $backupPath);
                    } else {
                        logMessage('[Auth] Не удалось переименовать файл токенов');
                    }
                }
                $tokens = null;
            }
        } catch (Exception $apiError) {
            logMessage('[Auth] Error during AmoCRM API access check: ' . $apiError->getMessage());
            // Переименовываем файл токенов при ошибке API
            if ($tokens) {
                $backupPath = str_replace('.json', '~.json', AMO_TOKENS_PATH);
                if (file_exists(AMO_TOKENS_PATH)) {
                    if (rename(AMO_TOKENS_PATH, $backupPath)) {
                        logMessage('[Auth] Файл токенов переименован из-за ошибки API в: ' . $backupPath);
                    } else {
                        logMessage('[Auth] Не удалось переименовать файл токенов');
                    }
                }
                $tokens = null;
            }
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
