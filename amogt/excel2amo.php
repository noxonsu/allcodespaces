<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/config.php'; // Defines AMO_TOKEN, GOOGLE_DRIVE_FILE_ID_EXCEL2AMO etc.
require_once __DIR__ . '/driveutils.php';
require_once __DIR__ . '/logger.php'; // Include the logger

// Define the specific log file for this script
define('SCRIPT_LOG_FILE', __DIR__ . '/logs/excel2amo.log');

use PhpOffice\PhpSpreadsheet\IOFactory;
$hideSensetiveData = false; // Added to hide sensitive data in logs
// Глобальная переменная для хранения определений пользовательских полей AmoCRM
$amoCustomFieldsDefinitions = null;
$currentAccessToken = null;
$blockedDealNumbersCache = []; // Renamed from $blockedDealIdsCache. Stores deal numbers from Excel.
define('BLOCKED_DEALS_FILE', __DIR__ . '/blocked_deals.txt'); // File stores deal numbers from Excel

/**
 * Loads blocked deal NUMBERS from the cache file into memory.
 */
function loadBlockedDealNumbers() { // Renamed from loadBlockedDealIds
    global $blockedDealNumbersCache;
    if (!file_exists(BLOCKED_DEALS_FILE)) {
        $blockedDealNumbersCache = [];
        logMessage("[Cache] Blocked deals file not found. Initializing empty cache.");
        return;
    }
    $content = file_get_contents(BLOCKED_DEALS_FILE);
    if ($content === false) {
        logMessage("[Cache] Failed to read blocked deals file: " . BLOCKED_DEALS_FILE);
        $blockedDealNumbersCache = [];
        return;
    }
    $ids = explode(PHP_EOL, trim($content));
    // Filter out empty lines and ensure IDs are trimmed (these are deal numbers from Excel)
    $blockedDealNumbersCache = array_values(array_filter(array_map('trim', $ids), function($id) {
        return !empty($id) && is_numeric($id); // Assuming deal numbers from Excel are numeric
    }));
    logMessage("[Cache] Loaded " . count($blockedDealNumbersCache) . " blocked deal NUMBERS from cache file: " . BLOCKED_DEALS_FILE);
}

/**
 * Adds a deal NUMBER (from Excel) to the blocked list cache and file.
 * @param string|int $dealNumber The NUMBER of the deal (from Excel) to block.
 * @return bool True on success, false on failure to write to file.
 */
function addBlockedDealNumber($dealNumber) { // Renamed from addBlockedDealId
    global $blockedDealNumbersCache;
    $dealNumber = trim((string)$dealNumber); 
    if (!in_array($dealNumber, $blockedDealNumbersCache)) {
        $blockedDealNumbersCache[] = $dealNumber;
        // Append to file with a newline
        if (file_put_contents(BLOCKED_DEALS_FILE, $dealNumber . PHP_EOL, FILE_APPEND | LOCK_EX) === false) {
            logMessage("[Cache] Failed to write deal NUMBER $dealNumber to blocked deals file: " . BLOCKED_DEALS_FILE);
            return false;
        }
        logMessage("[Cache] Added deal NUMBER $dealNumber to blocked deals cache and file.");
        return true;
    }
    logMessage("[Cache] Deal NUMBER $dealNumber is already in the blocked cache.");
    return true; 
}

/**
 * Получает и обрабатывает определения пользовательских полей AmoCRM
 * @param string $accessToken Токен доступа AmoCRM
 * @return bool Успех операции
 */
function fetchAndProcessAmoCustomFieldDefinitions($accessToken = null) {
    global $amoCustomFieldsDefinitions;
    
    $tokenToUse = $accessToken ?: AMO_TOKEN;
    if (!$tokenToUse) {
        logMessage('[AmoCF] Невозможно получить определения пользовательских полей AmoCRM: токен API недоступен.');
        return false;
    }
    
    try {
        logMessage('[AmoCF] Получение определений пользовательских полей AmoCRM...');
        
        $ch = curl_init(AMO_API_URL_BASE . '/leads/custom_fields');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $tokenToUse
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30); // Added cURL timeout

        logMessage('[AmoCF] Выполнение cURL запроса для /leads/custom_fields...');
        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        logMessage("[AmoCF] cURL запрос выполнен. HTTP код: $httpCode. cURL ошибка (если есть): " . ($curlError ?: 'Нет'));

        if ($curlError) {
            logMessage("[AmoCF] cURL ошибка при получении пользовательских полей: " . $curlError);
            return false;
        }
        
        if ($httpCode !== 200) {
            logMessage("[AmoCF] HTTP ошибка при получении пользовательских полей: $httpCode. Длина ответа: " . strlen($response));
            return false;
        }
        
        logMessage('[AmoCF] Ответ получен успешно (HTTP 200). Длина ответа: ' . strlen($response));
        
        // Сохраняем исходные данные полей в файл
        logMessage('[AmoCF] Попытка сохранить ответ в amo_fields.txt...');
        if (file_put_contents('amo_fields.txt', $response) === false) {
            logMessage('[AmoCF] КРИТИЧЕСКАЯ ОШИБКА: Не удалось записать определения полей в amo_fields.txt.');
            // return false; // Decide if this is fatal
        } else {
            logMessage('[AmoCF] Определения пользовательских полей AmoCRM успешно сохранены в amo_fields.txt');
        }
        
        logMessage('[AmoCF] Попытка декодировать JSON из ответа...');
        $data = json_decode($response, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            logMessage('[AmoCF] Ошибка декодирования JSON: ' . json_last_error_msg() . '. Ответ (первые 500 символов): ' . substr($response, 0, 500));
            return false;
        }
        logMessage('[AmoCF] JSON успешно декодирован.');
        
        if (isset($data['_embedded']['custom_fields'])) {
            logMessage('[AmoCF] Ключ _embedded.custom_fields найден в данных. Обработка полей...');
            $amoCustomFieldsDefinitions = [];
            foreach ($data['_embedded']['custom_fields'] as $field) {
                $amoCustomFieldsDefinitions[$field['name']] = $field;
            }
            logMessage('[AmoCF] Успешно получены и обработаны определения пользовательских полей AmoCRM. Количество полей: ' . count($amoCustomFieldsDefinitions));
            return true;
        } else {
            logMessage('[AmoCF] Не удалось получить определения пользовательских полей: ключ _embedded.custom_fields отсутствует или некорректен. Структура данных (ключи верхнего уровня): ' . implode(', ', array_keys($data ?: [])));
            return false;
        }
    } catch (Exception $e) {
        logMessage('[AmoCF] ИСКЛЮЧЕНИЕ при получении определений пользовательских полей AmoCRM: ' . $e->getMessage() . ' Trace: ' . substr($e->getTraceAsString(), 0, 1000));
        return false;
    }
}

/**
 * Fetches and saves pipeline information from AmoCRM
 * @param string $accessToken Active access token
 * @return bool Success status
 */
function fetchAndSavePipelineInfo($accessToken = null) {
    $tokenToUse = $accessToken ?: AMO_TOKEN;
    if (!$tokenToUse) {
        logMessage("[Pipeline] Error: No API token available");
        return false;
    }

    try {
        $ch = curl_init(AMO_API_URL_BASE . '/leads/pipelines');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $tokenToUse
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            logMessage("[Pipeline] HTTP error $httpCode when fetching pipelines");
            return false;
        }
        
        // Save raw response to pipelines.json
        if (file_put_contents(__DIR__ . '/pipelines.json', $response) === false) {
            logMessage("[Pipeline] Failed to save pipelines.json");
            return false;
        }
        
        logMessage("[Pipeline] Successfully saved pipeline information to pipelines.json");
        return true;
    } catch (Exception $e) {
        logMessage("[Pipeline] Error fetching pipeline info: " . $e->getMessage());
        return false;
    }
}

/**
 * Обновляет сделку в AmoCRM
 * @param string $dealNumber Номер сделки
 * @param array $data Данные для обновления
 * @return bool Успех операции
 */
function updateAmoDeal($dealNumber, $data) {
    global $amoCustomFieldsDefinitions;
    global $AMO_CUSTOM_FIELD_NAMES;
    global $currentAccessToken;
    global $blockedDealNumbersCache; // Use renamed global variable
    global $hideSensetiveData;
    
    $dataLog = $hideSensetiveData ? '[Data Redacted]' : json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    logMessage("[AmoDeal] Начало обновления сделки $dealNumber. Данные: " . $dataLog);

    // Check cache first using $dealNumber (from Excel)
    // Skip check for deal number 17243700
    if ($dealNumber !== '17243700' && in_array(trim((string)$dealNumber), $blockedDealNumbersCache)) {
        logMessage("[AmoDeal] Сделка с номером $dealNumber заблокирована для обновления (найдена в кэше по номеру). Пропускаем API запрос.");
        return false; 
    }
    
    // Add deal number to blocked list immediately after passing initial cache check,
    // to ensure it's marked as "attempted" for this and future runs.
    // This addresses the "only one attempt" requirement.
    // The '17243700' deal is exempt from this blocking logic.
    if ($dealNumber !== '17243700') {
        addBlockedDealNumber($dealNumber);
    }
    
    $tokenToUse = $currentAccessToken ?: AMO_TOKEN;
    if (!$tokenToUse) {
        logMessage("[AmoDeal] Ошибка обновления сделки $dealNumber: токен API AmoCRM недоступен.");
        return false;
    }
    
    if (!$amoCustomFieldsDefinitions) {
        logMessage("[AmoDeal] Ошибка обновления сделки $dealNumber: определения пользовательских полей AmoCRM не загружены. Попытка загрузить...");
        // Попытка загрузить их, если отсутствуют
        $loaded = fetchAndProcessAmoCustomFieldDefinitions($tokenToUse);
        if (!$loaded) {
            logMessage("[AmoDeal] Прерываем обновление для сделки $dealNumber, так как не удалось загрузить определения пользовательских полей.");
            return false;
        }
        logMessage("[AmoDeal] Определения пользовательских полей AmoCRM успешно загружены для сделки $dealNumber.");
    }
    
    try {
        // Поиск сделки по номеру
        logMessage("[AmoDeal] Поиск сделки $dealNumber в AmoCRM...");
        $ch = curl_init(AMO_API_URL_BASE . '/leads?query=' . urlencode($dealNumber));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $tokenToUse
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            logMessage("[AmoDeal] HTTP ошибка при поиске сделки $dealNumber: код $httpCode");
            return false;
        }
        
        $responseData = json_decode($response, true);
        $deals = isset($responseData['_embedded']['leads']) ? $responseData['_embedded']['leads'] : [];
        
        if (empty($deals)) {
            logMessage("[AmoDeal] Сделка $dealNumber не найдена в AmoCRM");
            return false;
        }
        
        $dealToUpdate = $deals[0];
        $dealId = $dealToUpdate['id']; // This is Amo's internal ID
        logMessage("[AmoDeal] Сделка $dealNumber найдена в AmoCRM (ID: $dealId)");

        // --- ЛОГИКА ПРОВЕРКИ СТАТУСА ---
        logMessage("[AmoDeal] Проверка текущего статуса сделки $dealNumber (ID: $dealId)...");
        $statusAmoFieldNameKey = 'status';
        // Corrected name for status field lookup from config, then potentially from workaround
        $statusConfigName = $AMO_CUSTOM_FIELD_NAMES[$statusAmoFieldNameKey] ?? null;
        $statusAmoFieldName = $statusConfigName;

        // Apply workaround for status field name if needed
        if ($statusConfigName) {
            $correctedAmoFieldNamesForStatus = [
                'Статус' => 'Статус оплаты ChatGPT' 
            ];
            if (isset($correctedAmoFieldNamesForStatus[$statusConfigName])) {
                $statusAmoFieldName = $correctedAmoFieldNamesForStatus[$statusConfigName];
                if ($statusConfigName !== $statusAmoFieldName) {
                    logMessage("[AmoDeal] Info: Adjusted AmoCRM field name for status check from '$statusConfigName' to '$statusAmoFieldName' (Deal: $dealNumber).");
                }
            }
        }

        if (!$statusAmoFieldName) {
            logMessage("[AmoDeal] Предупреждение: имя поля AmoCRM для '$statusAmoFieldNameKey' (ожидаемое: '$statusConfigName') не настроено или не скорректировано. Проверка статуса пропущена.");
        } else {
            $statusFieldDefinition = $amoCustomFieldsDefinitions[$statusAmoFieldName] ?? null;
            if (!$statusFieldDefinition) {
                logMessage("[AmoDeal] Предупреждение: определение пользовательского поля '$statusAmoFieldName' (для ключа '$statusAmoFieldNameKey') не найдено. Проверка статуса пропущена.");
            } elseif (!empty($dealToUpdate['custom_fields_values'])) {
                $statusFieldId = $statusFieldDefinition['id'];
                $currentStatusCustomField = null;
                foreach ($dealToUpdate['custom_fields_values'] as $cf) {
                    if ($cf['field_id'] == $statusFieldId) {
                        $currentStatusCustomField = $cf;
                        break;
                    }
                }
                
                $currentStatusStringValue = null;
                if (!empty($currentStatusCustomField['values'][0])) {
                    $statusValueObject = $currentStatusCustomField['values'][0];
                    if (isset($statusValueObject['enum'])) {
                        $currentStatusStringValue = trim((string)$statusValueObject['enum']);
                    } elseif (isset($statusValueObject['enum_id']) && 
                             in_array($statusFieldDefinition['type'], ['select', 'multiselect', 'radiobutton']) && 
                             !empty($statusFieldDefinition['enums'])) {
                        foreach ($statusFieldDefinition['enums'] as $enum) {
                            if ($enum['id'] == $statusValueObject['enum_id']) {
                                $currentStatusStringValue = trim((string)$enum['value']);
                                break;
                            }
                        }
                    } elseif (isset($statusValueObject['value'])) {
                        $currentStatusStringValue = trim((string)$statusValueObject['value']);
                    }
                }
                
                if ($currentStatusStringValue !== null && $currentStatusStringValue !== "") {
                    logMessage("[AmoDeal] Текущий статус сделки $dealNumber (ID: $dealId) - \"$currentStatusStringValue\" (не пустой). Обновление из листа заблокировано.");
                    // The call to addBlockedDealNumber was here, it's now moved to the beginning of the function.
                    return false;
                } else {
                    logMessage("[AmoDeal] Текущий статус сделки $dealNumber (ID: $dealId) пустой. Обновление из листа и смена этапа разрешены.");
                }
            } else {
                logMessage("[AmoDeal] У сделки $dealNumber (ID: $dealId) нет custom_fields_values. Статус считается пустым.");
            }
        }
        // --- КОНЕЦ ЛОГИКИ ПРОВЕРКИ СТАТУСА ---

        // --- STATUS UPDATE PREPARATION ---
        // We'll set status to "Финальный Операторский" in the main pipeline
        $mainPipelineId = 8824470; // ID of "Воронка" pipeline
        $finalOperatorStatusId = 73606602; // ID of "Финальный Операторский" status
        
        // Prepare the payload with pipeline_id and status_id
        $currentUnixTimestamp = time();
        $customFieldsPayload = [];
        
        logMessage("[AmoDeal] Подготовка payload для обновления сделки $dealNumber (ID: $dealId)...");
        
        // Функция для добавления пользовательского поля в payload
        $addCustomFieldIfValid = function($internalFieldName, $sheetValue) use ($dealNumber, $amoCustomFieldsDefinitions, $AMO_CUSTOM_FIELD_NAMES, $currentUnixTimestamp, &$customFieldsPayload) {
            $amoFieldName = $AMO_CUSTOM_FIELD_NAMES[$internalFieldName] ?? null;

            // Temporary workaround for known field name mismatches from config.php
            // Ideally, $AMO_CUSTOM_FIELD_NAMES in config.php should use the exact names from AmoCRM API.
            if ($amoFieldName) { // Only apply correction if a name was found in config
                $correctedAmoFieldNames = [
                    'Валюта' => 'Валюта (выдано)',             // Expected API name for ID 637241
                    'Почта' => 'Комментарий (для списания)', // Expected API name for ID 719899
                    'Статус' => 'Статус оплаты ChatGPT'       // Expected API name for ID 752627
                    // Add other known mismatches here if necessary
                ];
                if (isset($correctedAmoFieldNames[$amoFieldName])) {
                    $originalAmoFieldName = $amoFieldName;
                    $amoFieldName = $correctedAmoFieldNames[$amoFieldName];
                    logMessage("[AmoDeal] Info: Adjusted AmoCRM field name from '$originalAmoFieldName' to '$amoFieldName' for internal key '$internalFieldName' (Deal: $dealNumber). Consider updating config.php.");
                }
            }
            
            if (!$amoFieldName) {
                logMessage("[AmoDeal] Предупреждение: нет имени поля AmoCRM для внутреннего ключа \"$internalFieldName\". Пропускаем для сделки $dealNumber.");
                return;
            }
            
            $fieldDefinition = $amoCustomFieldsDefinitions[$amoFieldName] ?? null;
            if (!$fieldDefinition) {
                logMessage("[AmoDeal] Предупреждение: пользовательское поле \"$amoFieldName\" отсутствует в определениях AmoCRM. Пропускаем для сделки $dealNumber.");
                return;
            }
            
            // Trim sheetValue once at the beginning if it's a string
            if (is_string($sheetValue)) {
                $sheetValue = trim($sheetValue);
            }

            // Universal pre-check for empty values after trimming. Skip silently.
            if ($sheetValue === null || $sheetValue === '') {
                return;
            }

            // Specific handling for currency: convert to uppercase after ensuring it's not empty.
            // This is done before type-specific logic. Comparison for 'select' types is case-insensitive.
            if ($internalFieldName === 'currency' && is_string($sheetValue)) {
                $sheetValue = strtoupper($sheetValue);
            }
            
            $fieldId = $fieldDefinition['id'];
            $valuePayloadFragment = null; // This will hold the specific part like {'value': ...} or {'enum_id': ...}
            
            // Type-specific processing based on $fieldDefinition['type']
            switch ($fieldDefinition['type']) {
                case 'select':
                case 'multiselect':
                case 'radiobutton':
                    $enumFound = false;
                    if (!empty($fieldDefinition['enums'])) {
                        foreach ($fieldDefinition['enums'] as $enum) {
                            // Compare consistently (e.g., both lowercased)
                            if (strtolower((string)$enum['value']) === strtolower((string)$sheetValue)) {
                                $valuePayloadFragment = ['enum_id' => $enum['id']];
                                $enumFound = true;
                                break;
                            }
                        }
                    }
                    if (!$enumFound) {
                        logMessage("[AmoDeal] Предупреждение: не найдено enum для поля \"$amoFieldName\" (ID: $fieldId, тип: {$fieldDefinition['type']}) значение \"$sheetValue\" для сделки $dealNumber. Пропускаем.");
                        return;
                    }
                    break;

                case 'date':
                    $timestampValue = null;
                    // Check if $sheetValue is a date string (not purely numeric)
                    if (is_string($sheetValue) && !preg_match('/^\d+$/', $sheetValue)) {
                        $parsedDate = strtotime($sheetValue);
                        // For 'withdrawal_date', if parsing fails, default to currentUnixTimestamp.
                        // For other 'date' fields, if parsing fails, $timestampValue remains null and an error is logged.
                        $timestampValue = $parsedDate !== false ? $parsedDate : ($internalFieldName === 'withdrawal_date' ? $currentUnixTimestamp : null);
                    } elseif (is_numeric($sheetValue)) { // If $sheetValue is already a timestamp or Excel numeric date
                        $timestampValue = (int)$sheetValue;
                    } elseif ($internalFieldName === 'withdrawal_date') { 
                        // This specific fallback for withdrawal_date ensures it gets $currentUnixTimestamp
                        // if $sheetValue was not a string to parse or a direct numeric timestamp initially
                        // (e.g. if $currentUnixTimestamp was passed directly and is not caught by is_numeric if it's not simple int/float)
                        // However, $currentUnixTimestamp is typically an integer, so is_numeric should catch it.
                        // This line primarily handles the explicit call: addCustomFieldIfValid('withdrawal_date', $currentUnixTimestamp);
                        $timestampValue = $currentUnixTimestamp;
                    }
                    
                    if ($timestampValue === null) {
                        logMessage("[AmoDeal] Предупреждение: недопустимая дата \"$sheetValue\" для \"$amoFieldName\" (ID: $fieldId, тип: date) для сделки $dealNumber. Пропускаем.");
                        return;
                    }
                    $valuePayloadFragment = ['value' => $timestampValue];
                    break;

                case 'numeric':
                    // This handles fields like 'payment_term' (ID 721463).
                    // It would also handle 'amount_issued' or 'card' IF their AmoCRM field definition type were 'numeric'.
                    $numValue = null; 
                    if (is_string($sheetValue)) {
                        $cleanedString = str_replace(',', '.', $sheetValue); 
                        if (is_numeric($cleanedString)) {
                            $numValue = (float)$cleanedString;
                        }
                    } elseif (is_numeric($sheetValue)) {
                        $numValue = (float)$sheetValue;
                    }
                    
                    if ($numValue === null || is_nan($numValue)) {
                        logMessage("[AmoDeal] Предупреждение: не числовое значение \"$sheetValue\" для \"$amoFieldName\" (ID: $fieldId, тип: numeric) для сделки $dealNumber. Пропускаем.");
                        return;
                    }
                    $valuePayloadFragment = ['value' => $numValue];
                    break;
                
                case 'text':
                case 'textarea':
                case 'url':
                // Add other text-like types here if they need explicit handling but should still result in a string value.
                default: // Default handling for text-based fields or any types not explicitly cased above.
                    // This correctly processes:
                    // 'amount_issued' (e.g., ID 637237, type text) as string.
                    // 'card' (e.g., ID 637413, type text) as string.
                    // 'email' (e.g., ID 719899, type textarea) as string.
                    // 'paid_service' (e.g., ID 637415, type text) as string.
                    $valuePayloadFragment = ['value' => (string)$sheetValue]; // Ensure value is explicitly cast to string
                    break;
            }
            
            // If $valuePayloadFragment is still null here, it means a case was not handled or an issue occurred.
            // However, explicit returns within switch cases should prevent reaching here with null if processing failed.
            if ($valuePayloadFragment === null) {
                logMessage("[AmoDeal] Предупреждение: не удалось сформировать payload fragment для поля \"$amoFieldName\" (тип: {$fieldDefinition['type']}) со значением \"$sheetValue\" для сделки $dealNumber. Пропускаем (непредвиденный случай).");
                return;
            }
            
            $customFieldsPayload[] = ['field_id' => $fieldId, 'values' => [$valuePayloadFragment]];
        };
        
        $addCustomFieldIfValid('amount_issued', $data['amount']);
        $addCustomFieldIfValid('currency', $data['currency']);
        $addCustomFieldIfValid('card', $data['card']);
        $addCustomFieldIfValid('email', $data['email']);
        $addCustomFieldIfValid('status', $data['status']);
        
        // Статические значения
        $addCustomFieldIfValid('withdrawal_account', 'Mastercard Prepaid');
        $addCustomFieldIfValid('withdrawal_date', $currentUnixTimestamp);
        $addCustomFieldIfValid('administrator', 'Бот');
        $addCustomFieldIfValid('paid_service', 'chatgpt');
        $addCustomFieldIfValid('payment_term', '1');
        
        if (empty($customFieldsPayload)) {
            logMessage("[AmoDeal] Нет действительных пользовательских полей для обновления сделки $dealNumber (ID: $dealId). Пропускаем PATCH.");
            return false;
        }
        
        // Подготовка данных для обновления
        $updatePayload = json_encode([
            'id' => $dealId,
            'pipeline_id' => $mainPipelineId,
            'status_id' => $finalOperatorStatusId,
            'custom_fields_values' => $customFieldsPayload
        ]);
        
        $payloadLog = $hideSensetiveData ? '[Payload Redacted]' : $updatePayload;
        logMessage("[AmoDeal] Попытка обновить сделку ID $dealId с payload: " . $payloadLog);
        logMessage("[AmoDeal] Выполнение PATCH запроса для обновления сделки $dealNumber (ID: $dealId)...");
        
        // Выполняем запрос PATCH для обновления сделки
        $ch = curl_init(AMO_API_URL_BASE . '/leads/' . $dealId);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $updatePayload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $tokenToUse,
            'Content-Type: application/json'
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode >= 200 && $httpCode < 300) {
            logMessage("[AmoDeal] ✅ Успешно обновлена сделка $dealNumber (ID: $dealId) в AmoCRM");
            return true;
        } else {
            logMessage("[AmoDeal] ❌ Ошибка при обновлении сделки $dealNumber (ID: $dealId). HTTP код: $httpCode");
            logMessage("[AmoDeal] ❌ Ответ: $response");
            return false;
        }
        
    } catch (Exception $e) {
        logMessage("[AmoDeal] ❌ Исключение при обновлении сделки $dealNumber: " . $e->getMessage());
        return false;
    }
}

/**
 * Синхронизирует данные из Excel в AmoCRM
 * @param string $accessToken Токен доступа AmoCRM
 * @return bool Успех операции
 */
function syncFromExcelSheet($accessToken = null) {
    global $currentAccessToken;
    global $amoCustomFieldsDefinitions;
    
    logMessage('[ExcelSync] Starting syncFromExcelSheet function...'); // Added

    if (!GOOGLE_DRIVE_FILE_ID_EXCEL2AMO) {
        logMessage('[ExcelSync] Невозможно выполнить синхронизацию из Excel на Drive: GOOGLE_DRIVE_FILE_ID_EXCEL2AMO не настроен.'); // Added
        return false;
    }
    
    if (!DEFAULT_SHEET_NAME) {
        logMessage('[ExcelSync] Невозможно выполнить синхронизацию из Excel на Drive: DEFAULT_SHEET_NAME не настроен.'); // Added
        return false;
    }
    
    $tokenToUse = $accessToken ?: AMO_TOKEN;
    if (!$tokenToUse) {
        logMessage('[ExcelSync] Невозможно выполнить синхронизацию из Excel на Drive: токен API AmoCRM недоступен.'); // Added
        return false;
    }
    
    if (!$amoCustomFieldsDefinitions) {
        logMessage('[ExcelSync] Определения пользовательских полей не загружены. Попытка загрузить...'); // Added
        $success = fetchAndProcessAmoCustomFieldDefinitions($tokenToUse);
        if (!$success) {
            logMessage("[ExcelSync] Не удалось загрузить определения пользовательских полей при попытке синхронизации. Прерываем цикл синхронизации."); // Added
            return false;
        }
        logMessage('[ExcelSync] Определения пользовательских полей успешно загружены.'); // Added
    }
    
    logMessage('[ExcelSync] Попытка получить сервис Google Drive...'); // Added
    // Получаем сервис Google Drive
    $drive = getDriveService();
    if (!$drive) {
        logMessage('[ExcelSync] Не удалось аутентифицироваться с Google Drive для syncFromExcelSheet.'); // Added
        return false;
    }
    logMessage('[ExcelSync] Сервис Google Drive успешно получен.'); // Added
    
    try {
        $fileId = GOOGLE_DRIVE_FILE_ID_EXCEL2AMO;
        $sheetName = DEFAULT_SHEET_NAME;
        
        logMessage("[ExcelSync] Попытка скачать файл с Drive ID: $fileId..."); // Added
        // Скачиваем файл с Google Drive
        $fileContent = downloadFileFromDrive($drive, $fileId, 'excel2amo');
        
        if (!$fileContent) {
            logMessage("[ExcelSync] Excel файл не найден на Drive или не удалось скачать для ID $fileId. Пропускаем синхронизацию."); // Added
            return false;
        }
        logMessage("[ExcelSync] Файл успешно скачан с Drive. Длина контента: " . strlen($fileContent)); // Added
        
        // Сохраняем во временный файл для обработки
        $tempFile = tempnam(sys_get_temp_dir(), 'excel_');
        logMessage("[ExcelSync] Временный файл создан: $tempFile"); // Added
        file_put_contents($tempFile, $fileContent);
        
        logMessage("[ExcelSync] Попытка загрузить Excel файл ($tempFile) с помощью IOFactory..."); // Added
        // Загружаем Excel файл
        $spreadsheet = IOFactory::load($tempFile);
        logMessage("[ExcelSync] Excel файл успешно загружен в PhpSpreadsheet."); // Added
        
        // Проверяем наличие нужного листа
        logMessage("[ExcelSync] Проверка наличия листа \"$sheetName\"..."); // Added
        if (!$spreadsheet->sheetNameExists($sheetName)) {
            logMessage("[ExcelSync] Лист \"$sheetName\" не найден в Excel файле с Drive ID: $fileId. Пропускаем синхронизацию."); // Added
            unlink($tempFile); // Удаляем временный файл
            logMessage("[ExcelSync] Временный файл $tempFile удален."); // Added
            return false;
        }
        logMessage("[ExcelSync] Лист \"$sheetName\" найден."); // Added
        
        // Получаем данные листа
        $worksheet = $spreadsheet->getSheetByName($sheetName);
        $data = $worksheet->toArray();
        logMessage("[ExcelSync] Данные из листа \"$sheetName\" извлечены. Количество строк (включая заголовок): " . count($data)); // Added
        
        // Удаляем временный файл
        unlink($tempFile);
        logMessage("[ExcelSync] Временный файл $tempFile удален."); // Added
        
        if (count($data) <= 1) { // Только заголовок или пустой лист
            logMessage("[ExcelSync] Нет данных для обработки в Excel (Drive ID: $fileId, Лист: $sheetName). Найдено строк: " . count($data)); // Added
            return true; // Успешно, но нет данных для обработки
        }
        
        logMessage("[ExcelSync] Найдено " . (count($data) - 1) . " строк данных (исключая заголовок) для обработки."); // Added
        
        // Обрабатываем строки (пропускаем заголовок)
        for ($i = 1; $i < count($data); $i++) {
            
            
            $dealNumber = isset($data[$i][0]) ? trim((string)$data[$i][0]) : null;
            
            // Skip empty dealNumber without logging
            if (!$dealNumber) {
                continue;
            }
            
            logMessage("[ExcelSync] Обработка строки " . ($i + 1) . ". Номер сделки из ячейки A: '$dealNumber'");
            
            updateAmoDeal($dealNumber, [
                'amount' => $data[$i][2] ?? null, // C: Сумма
                'currency' => $data[$i][3] ?? null, // D: Валюта
                'email' => $data[$i][4] ?? null, // E: Почта
                'card' => $data[$i][5] ?? null, // F: Карта
                'status' => $data[$i][6] ?? null // G: Статус
            ]);
        }
        
        logMessage("[ExcelSync] Завершение функции syncFromExcelSheet."); // Added
        return true;
        
    } catch (Exception $e) {
        logMessage("[ExcelSync] ИСКЛЮЧЕНИЕ в syncFromExcelSheet: " . $e->getMessage() . " Trace: " . substr($e->getTraceAsString(), 0, 1000)); // Added
        if (isset($tempFile) && file_exists($tempFile)) { // Ensure temp file is cleaned up on error
            unlink($tempFile);
            logMessage("[ExcelSync] Временный файл $tempFile удален после исключения.");
        }
        return false;
    }
}

/**
 * Запускает синхронизацию из Excel в AmoCRM
 * @param string $accessToken Токен доступа AmoCRM
 * @return bool Успех операции
 */
function startExcelSheetSync($accessToken = null) {
    global $currentAccessToken;
    
    logMessage('[Excel2Amo] Initializing blocked deals cache...'); 
    loadBlockedDealNumbers();

    if (!GOOGLE_DRIVE_FILE_ID_EXCEL2AMO) {
        logMessage('[Excel2Amo] Excel (Drive) в AmoCRM синхронизация не запущена: GOOGLE_DRIVE_FILE_ID_EXCEL2AMO не настроен.');
        return false;
    }
    
    if ($accessToken) {
        $currentAccessToken = $accessToken;
        // Comment out pipeline info fetching since we already know the IDs
        // if (!fetchAndSavePipelineInfo($accessToken)) {
        //     logMessage('[Excel2Amo] Warning: Failed to fetch pipeline information, but continuing...');
        // }
        logMessage('[Excel2Amo] Запуск синхронизации Excel Sheet (с Drive) в AmoCRM с использованием предоставленного OAuth токена доступа...');
    } elseif (AMO_TOKEN) {
        $currentAccessToken = null; // будет использоваться AMO_TOKEN
        logMessage('[Excel2Amo] Запуск синхронизации Excel Sheet (с Drive) в AmoCRM с использованием AMO_TOKEN из .env, так как OAuth токен не предоставлен.');
    } else {
        logMessage('[Excel2Amo] Невозможно запустить синхронизацию Excel Sheet (с Drive) в AmoCRM: токен доступа AmoCRM недоступен.');
        return false;
    }
    
    $definitionsLoaded = fetchAndProcessAmoCustomFieldDefinitions($currentAccessToken ?: AMO_TOKEN);
    if (!$definitionsLoaded) {
        logMessage('[Excel2Amo] Прерывание синхронизации Excel Sheet (с Drive) в AmoCRM из-за ошибки при получении определений пользовательских полей.');
        return false;
    }
    
    logMessage('[Excel2Amo] Первичная проверка Excel Sheet (с Drive) на наличие новых строк для синхронизации в AmoCRM...'); // Changed from custom_log
    return syncFromExcelSheet($currentAccessToken);
}

// Если этот скрипт вызывается напрямую (например через cron)
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    // Получаем токен доступа из файла или напрямую
    $tokenData = file_exists(AMO_TOKENS_PATH) ? json_decode(file_get_contents(AMO_TOKENS_PATH), true) : null;
    $accessToken = $tokenData && isset($tokenData['access_token']) ? $tokenData['access_token'] : AMO_TOKEN;
    
    // Запускаем синхронизацию
    startExcelSheetSync($accessToken);
}
