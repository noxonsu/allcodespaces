<?php

declare(strict_types=1);

// Устанавливаем production окружение по умолчанию
if (!getenv('ENVIRONMENT')) {
    putenv('ENVIRONMENT=production');
}

// Включаем необходимые файлы
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/lib/amo_auth_utils.php';
require_once __DIR__ . '/lib/request_utils.php';

// Функция для проверки работоспособности токенов
function checkTokensValidity($tokensPath) {
    if (!file_exists($tokensPath)) {
        return ['status' => 'missing', 'message' => 'Файл токенов не найден'];
    }
    
    $tokensData = json_decode(file_get_contents($tokensPath), true);
    if (!$tokensData) {
        return ['status' => 'invalid', 'message' => 'Невозможно прочитать файл токенов'];
    }
    
    if (!isset($tokensData['access_token'])) {
        return ['status' => 'invalid', 'message' => 'Access token не найден в файле'];
    }
    
    // Проверяем срок действия
    if (isset($tokensData['expires_at']) && time() > $tokensData['expires_at']) {
        return ['status' => 'expired', 'message' => 'Токены истекли', 'data' => $tokensData];
    }
    
    // Проверяем доступ к API
    try {
        $testUrl = AMO_API_URL_BASE . '/account';
        $response = httpClient($testUrl, [
            'headers' => ['Authorization: Bearer ' . $tokensData['access_token']],
            'timeout' => 10
        ]);
        
        if ($response['statusCode'] === 200) {
            $accountData = json_decode($response['body'], true);
            return [
                'status' => 'valid', 
                'message' => 'Токены работают корректно',
                'data' => $tokensData,
                'account' => $accountData
            ];
        } elseif ($response['statusCode'] === 401) {
            return ['status' => 'unauthorized', 'message' => 'Токены недействительны (401 Unauthorized)', 'data' => $tokensData];
        } else {
            return ['status' => 'error', 'message' => 'Ошибка API: ' . $response['statusCode'] . ' - ' . $response['body'], 'data' => $tokensData];
        }
        
    } catch (Exception $e) {
        return ['status' => 'error', 'message' => 'Ошибка при проверке API: ' . $e->getMessage(), 'data' => $tokensData];
    }
}

// Функция для отображения HTML страницы
function renderPage($title, $content, $includeScript = false) {
    $script = '';
    if ($includeScript) {
        $script = '<script>
            function closePopup() {
                if (window.opener) {
                    window.opener.postMessage("auth_complete", "*");
                    window.close();
                } else {
                    window.location.href = window.location.origin + window.location.pathname;
                }
            }
        </script>';
    }
    
    return '<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>' . htmlspecialchars($title) . '</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px; 
            background: #f5f5f5; 
        }
        .container { 
            background: white; 
            padding: 30px; 
            border-radius: 10px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .btn { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #007cba; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 10px 5px; 
            border: none;
            cursor: pointer;
            font-size: 16px;
        }
        .btn:hover { background: #005a87; }
        .btn-success { background: #28a745; }
        .btn-success:hover { background: #1e7e34; }
        .status { 
            padding: 15px; 
            border-radius: 5px; 
            margin: 15px 0; 
        }
        .status.success { 
            background: #d4edda; 
            color: #155724; 
            border: 1px solid #c3e6cb; 
        }
        .status.error { 
            background: #f8d7da; 
            color: #721c24; 
            border: 1px solid #f5c6cb; 
        }
        .status.info { 
            background: #d1ecf1; 
            color: #0c5460; 
            border: 1px solid #bee5eb; 
        }
        .code-block {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 10px;
            font-family: monospace;
            margin: 10px 0;
            overflow-x: auto;
        }
        h1 { color: #333; margin-bottom: 20px; }
        h2 { color: #666; margin-top: 30px; }
        .env-name { 
            float: right; 
            background: ' . (getenv('ENVIRONMENT') === 'production' ? '#dc3545' : '#ffc107') . '; 
            color: white; 
            padding: 5px 10px; 
            border-radius: 3px; 
            font-size: 12px; 
        }
    </style>
    ' . $script . '
</head>
<body>
    <div class="container">
        <span class="env-name">' . strtoupper(getenv('ENVIRONMENT') ?: 'production') . '</span>
        <h1>' . htmlspecialchars($title) . '</h1>
        ' . $content . '
    </div>
</body>
</html>';
}

// Получаем код авторизации из GET параметров
$authCode = $_GET['code'] ?? '';
$error = $_GET['error'] ?? '';
$errorDescription = $_GET['error_description'] ?? '';
$action = $_GET['action'] ?? '';

// Если запрошена проверка токенов
if ($action === 'check_tokens') {
    $tokensPath = DATA_DIR . '/amo_tokens.json';
    $checkResult = checkTokensValidity($tokensPath);
    
    logMessage('[OAuth] Проверка токенов: ' . $checkResult['status'] . ' - ' . $checkResult['message']);
    
    $statusClass = '';
    $statusIcon = '';
    switch ($checkResult['status']) {
        case 'valid':
            $statusClass = 'success';
            $statusIcon = '✅';
            break;
        case 'expired':
        case 'unauthorized':
            $statusClass = 'error';
            $statusIcon = '❌';
            break;
        case 'missing':
        case 'invalid':
            $statusClass = 'error';
            $statusIcon = '❌';
            break;
        default:
            $statusClass = 'error';
            $statusIcon = '⚠️';
    }
    
    $content = '<div class="status ' . $statusClass . '">
        <h2>' . $statusIcon . ' Результат проверки токенов</h2>
        <p><strong>Статус:</strong> ' . htmlspecialchars($checkResult['status']) . '</p>
        <p><strong>Сообщение:</strong> ' . htmlspecialchars($checkResult['message']) . '</p>';
    
    if (isset($checkResult['account'])) {
        $account = $checkResult['account'];
        $content .= '<h3>📋 Информация об аккаунте</h3>
            <p><strong>Название:</strong> ' . htmlspecialchars($account['name'] ?? 'неизвестно') . '</p>
            <p><strong>Поддомен:</strong> ' . htmlspecialchars($account['subdomain'] ?? 'неизвестно') . '</p>
            <p><strong>ID:</strong> ' . htmlspecialchars($account['id'] ?? 'неизвестно') . '</p>';
    }
    
    if (isset($checkResult['data'])) {
        $data = $checkResult['data'];
        $content .= '<h3>🔑 Информация о токенах</h3>
            <p><strong>Access Token:</strong> ' . substr($data['access_token'] ?? '', 0, 50) . '...</p>
            <p><strong>Refresh Token:</strong> ' . substr($data['refresh_token'] ?? '', 0, 50) . '...</p>';
        
        if (isset($data['expires_at'])) {
            $expiresAt = date('Y-m-d H:i:s', $data['expires_at']);
            $isExpired = time() > $data['expires_at'];
            $content .= '<p><strong>Срок действия:</strong> ' . $expiresAt . ' ' . 
                       ($isExpired ? '<span style="color: red;">(истекли)</span>' : '<span style="color: green;">(действительны)</span>') . '</p>';
        }
    }
    
    $content .= '</div>';
    
    // Добавляем рекомендации по действиям
    if ($checkResult['status'] === 'expired' || $checkResult['status'] === 'unauthorized') {
        $content .= '<div class="status info">
            <h3>🔄 Рекомендуемые действия</h3>
            <p>Токены необходимо обновить. Вы можете:</p>
            <ul>
                <li>Использовать существующий refresh token (если доступен)</li>
                <li>Провести новую авторизацию</li>
            </ul>
        </div>';
    }
    
    $content .= '<a href="?" class="btn">🏠 На главную</a>
                <a href="?action=check_tokens" class="btn">🔄 Проверить снова</a>';
    
    if ($checkResult['status'] !== 'valid') {
        $content .= '<a href="?action=auth" class="btn">🔑 Новая авторизация</a>';
    }
    
    echo renderPage('Проверка токенов AmoCRM', $content);
    exit;
}

// Если есть ошибка OAuth
if ($error) {
    $content = '<div class="status error">
        <h2>❌ Ошибка авторизации</h2>
        <p><strong>Ошибка:</strong> ' . htmlspecialchars($error) . '</p>';
    
    if ($errorDescription) {
        $content .= '<p><strong>Описание:</strong> ' . htmlspecialchars($errorDescription) . '</p>';
    }
    
    $content .= '<p>Попробуйте авторизоваться снова:</p>
        <a href="?action=auth" class="btn">🔑 Повторить авторизацию</a>
    </div>';
    
    echo renderPage('Ошибка авторизации AmoCRM', $content);
    exit;
}

// Если пришел код авторизации
if ($authCode) {
    try {
        logMessage('[OAuth] Получен код авторизации: ' . substr($authCode, 0, 20) . '...');
        
        // Получаем токены
        $tokens = getNewTokens($authCode);
        
        // Проверяем доступ к API
        $testUrl = AMO_API_URL_BASE . '/account';
        
        $response = httpClient($testUrl, [
            'headers' => ['Authorization: Bearer ' . $tokens['access_token']],
            'timeout' => 15
        ]);
        
        if ($response['statusCode'] === 200) {
            $accountData = json_decode($response['body'], true);
            
            $content = '<div class="status success">
                <h2>✅ Авторизация успешна!</h2>
                <p><strong>Аккаунт:</strong> ' . htmlspecialchars($accountData['name'] ?? 'неизвестно') . '</p>
                <p><strong>Поддомен:</strong> ' . htmlspecialchars($accountData['subdomain'] ?? 'неизвестно') . '</p>
                <p><strong>ID аккаунта:</strong> ' . htmlspecialchars($accountData['id'] ?? 'неизвестно') . '</p>
                <p><strong>Окружение:</strong> ' . strtoupper(getenv('ENVIRONMENT') ?: 'production') . '</p>
            </div>
            
            <div class="status info">
                <h2>📋 Детали токенов</h2>
                <p><strong>Access Token:</strong> ' . substr($tokens['access_token'], 0, 50) . '...</p>
                <p><strong>Refresh Token:</strong> ' . substr($tokens['refresh_token'], 0, 50) . '...</p>
                <p><strong>Срок действия:</strong> ' . ($tokens['expires_in'] ?? 'неизвестно') . ' секунд</p>
                <p><strong>Файл токенов:</strong> ' . DATA_DIR . '/amo_tokens.json</p>
            </div>
            
            <div class="status info">
                <h2>🔄 Обновление .env файла</h2>
                <p>Рекомендуется обновить код авторизации в файле окружения:</p>
                <div class="code-block">AMO_AUTH_CODE=' . htmlspecialchars($authCode) . '</div>
                <p><em>Примечание: Код авторизации можно использовать только один раз. 
                Для повторной авторизации потребуется новый код.</em></p>
            </div>
            
            <button onclick="closePopup()" class="btn btn-success">✅ Готово</button>
            <a href="?" class="btn">🏠 На главную</a>';
            
            logMessage('[OAuth] Авторизация успешна для аккаунта: ' . ($accountData['subdomain'] ?? 'unknown'));
            
        } else {
            throw new Exception('Ошибка доступа к API: ' . $response['statusCode'] . ' - ' . $response['body']);
        }
        
    } catch (Exception $e) {
        logMessage('[OAuth] Ошибка обработки кода авторизации: ' . $e->getMessage());
        
        $content = '<div class="status error">
            <h2>❌ Ошибка получения токенов</h2>
            <p><strong>Сообщение:</strong> ' . htmlspecialchars($e->getMessage()) . '</p>
        </div>
        
        <div class="status info">
            <h2>🔍 Возможные причины</h2>
            <ul>
                <li>Код авторизации уже был использован ранее</li>
                <li>Код авторизации истек (срок действия ~10 минут)</li>
                <li>Неверные настройки интеграции</li>
                <li>Проблемы с сетевым подключением</li>
            </ul>
        </div>
        
        <a href="?action=auth" class="btn">🔑 Попробовать снова</a>';
    }
    
    echo renderPage('Результат авторизации AmoCRM', $content, true);
    exit;
}

// Если запрошена авторизация
if ($action === 'auth') {
    $authUrl = sprintf(
        'https://www.amocrm.ru/oauth?client_id=%s&response_type=code&redirect_uri=%s',
        AMO_INTEGRATION_ID,
        urlencode(AMO_REDIRECT_URI)
    );
    
    $content = '<div class="status info">
        <h2>🔑 Авторизация в AmoCRM</h2>
        <p>Вы будете перенаправлены на страницу авторизации AmoCRM.</p>
        <p><strong>Интеграция ID:</strong> ' . htmlspecialchars(AMO_INTEGRATION_ID) . '</p>
        <p><strong>Redirect URI:</strong> ' . htmlspecialchars(AMO_REDIRECT_URI) . '</p>
        <p><strong>Домен AmoCRM:</strong> ' . htmlspecialchars(AMO_DOMAIN) . '</p>
    </div>
    
    <a href="' . htmlspecialchars($authUrl) . '" class="btn" target="_blank">
        🚀 Авторизоваться в AmoCRM
    </a>
    
    <div class="status info" style="margin-top: 20px;">
        <h3>📝 Инструкции:</h3>
        <ol>
            <li>Нажмите кнопку выше для перехода к авторизации</li>
            <li>Войдите в свой аккаунт AmoCRM</li>
            <li>Разрешите доступ приложению</li>
            <li>Вы будете автоматически перенаправлены обратно</li>
        </ol>
    </div>';
    
    echo renderPage('Авторизация AmoCRM', $content);
    exit;
}

// Главная страница - проверяем текущее состояние
$currentAuthCode = getenv('AMO_AUTH_CODE') ?: '';
$tokensPath = DATA_DIR . '/amo_tokens.json';
$hasTokens = file_exists($tokensPath);
$tokensInfo = '';

if ($hasTokens) {
    // Проверяем токены
    $checkResult = checkTokensValidity($tokensPath);
    
    $statusClass = '';
    $statusIcon = '';
    switch ($checkResult['status']) {
        case 'valid':
            $statusClass = 'success';
            $statusIcon = '✅';
            break;
        case 'expired':
        case 'unauthorized':
            $statusClass = 'error';
            $statusIcon = '❌';
            break;
        case 'missing':
        case 'invalid':
            $statusClass = 'error';
            $statusIcon = '❌';
            break;
        default:
            $statusClass = 'error';
            $statusIcon = '⚠️';
    }
    
    $tokensInfo = '<div class="status ' . $statusClass . '">
        <h2>' . $statusIcon . ' Статус токенов</h2>
        <p><strong>Файл токенов:</strong> ' . htmlspecialchars($tokensPath) . '</p>
        <p><strong>Статус:</strong> ' . htmlspecialchars($checkResult['message']) . '</p>';
    
    if (isset($checkResult['data']) && isset($checkResult['data']['expires_at'])) {
        $expiresAt = date('Y-m-d H:i:s', $checkResult['data']['expires_at']);
        $isExpired = time() > $checkResult['data']['expires_at'];
        $tokensInfo .= '<p><strong>Срок действия:</strong> ' . $expiresAt . ' ' . 
                      ($isExpired ? '<span style="color: red;">(истекли)</span>' : '<span style="color: green;">(действительны)</span>') . '</p>';
    }
    
    if (isset($checkResult['account'])) {
        $account = $checkResult['account'];
        $tokensInfo .= '<p><strong>Аккаунт:</strong> ' . htmlspecialchars($account['name'] ?? 'неизвестно') . 
                      ' (' . htmlspecialchars($account['subdomain'] ?? 'неизвестно') . ')</p>';
    }
    
    $tokensInfo .= '</div>';
} else {
    $tokensInfo = '<div class="status error">
        <h2>❌ Токены не найдены</h2>
        <p>Файл токенов не существует: ' . htmlspecialchars($tokensPath) . '</p>
    </div>';
}

$authCodeInfo = '';
if ($currentAuthCode) {
    $authCodeInfo = '<div class="status info">
        <h2>🔑 Код авторизации найден</h2>
        <p><strong>Код:</strong> ' . substr($currentAuthCode, 0, 50) . '...</p>
        <p><em>Код найден в переменной окружения AMO_AUTH_CODE</em></p>
    </div>';
} else {
    $authCodeInfo = '<div class="status error">
        <h2>❌ Код авторизации не найден</h2>
        <p>Переменная AMO_AUTH_CODE пуста или не установлена в файле окружения</p>
    </div>';
}

$content = '<h2>📊 Текущее состояние</h2>
<div class="status info">
    <p><strong>Окружение:</strong> ' . strtoupper(getenv('ENVIRONMENT') ?: 'production') . '</p>
    <p><strong>AmoCRM домен:</strong> ' . htmlspecialchars(AMO_DOMAIN) . '</p>
    <p><strong>Integration ID:</strong> ' . htmlspecialchars(AMO_INTEGRATION_ID) . '</p>
    <p><strong>Redirect URI:</strong> ' . htmlspecialchars(AMO_REDIRECT_URI) . '</p>
</div>

' . $tokensInfo . '
' . $authCodeInfo . '

<h2>🚀 Действия</h2>
<a href="?action=auth" class="btn">🔑 Новая авторизация</a>';

if ($hasTokens) {
    $content .= '<a href="?action=check_tokens" class="btn">🔍 Проверить токены</a>';
}

if ($currentAuthCode) {
    $content .= '<a href="get_production_tokens.php" class="btn" target="_blank">🔄 Обновить токены из кода</a>';
}

$content .= '<div style="margin-top: 30px;">
    <h3>ℹ️ Справка</h3>
    <p><strong>OAuth URL для ручной авторизации:</strong></p>
    <div class="code-block">https://www.amocrm.ru/oauth?client_id=' . htmlspecialchars(AMO_INTEGRATION_ID) . '</div>
    
    <p><strong>Этапы авторизации:</strong></p>
    <ol>
        <li>Нажмите "Новая авторизация" для получения кода</li>
        <li>После успешной авторизации код будет обработан автоматически</li>
        <li>Токены будут сохранены в файл: <code>' . htmlspecialchars($tokensPath) . '</code></li>
        <li>При необходимости обновите AMO_AUTH_CODE в .env файле</li>
    </ol>
    
    <p><strong>Проверка токенов:</strong></p>
    <ul>
        <li>Кнопка "Проверить токены" выполняет реальный запрос к API AmoCRM</li>
        <li>Проверяется срок действия и доступность API</li>
        <li>Отображается информация об аккаунте при успешной проверке</li>
        <li>При ошибках предлагаются варианты решения</li>
    </ul>
</div>';

echo renderPage('OAuth авторизация AmoCRM', $content);
