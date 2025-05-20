<?php

define('SCRIPT_LOG_FILE', __DIR__ . '/logs/amo2us.log');
//
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/driveutils.php';
require_once __DIR__ . '/logger.php';

set_time_limit(40);

// Google Shee df ts API classes
use Google_Service_Sheets;
use Google_Service_Sheets_ValueRange;
use Google_Service_Sheets_BatchUpdateSpreadsheetRequest;
use Google_Service_Sheets_Request;
use Google_Service_Sheets_AddSheetRequest;
use Google_Service_Sheets_SheetProperties;

// Имя файла для хранения ID обработанных сделок
define('PROCESSED_DEALS_FILE', __DIR__ . '/blocked_webhook_deals.txt');
// Имя файла для блокировки одновременного выполнения
define('LOCK_FILE', __DIR__ . '/amo2excel.lock');

/**
 * Проверяет, была ли уже обработана сделка с данным ID.
 * @param string|int $dealId ID сделки
 * @return bool True, если сделка уже обработана, иначе false.
 */
function isDealProcessed($dealId) {
    if (!file_exists(PROCESSED_DEALS_FILE)) {
        return false;
    }
    // Убедимся, что файл доступен для чтения
    if (!is_readable(PROCESSED_DEALS_FILE)) {
        logError("Файл " . PROCESSED_DEALS_FILE . " не доступен для чтения.");
        // В этом случае, чтобы избежать дублирования, лучше считать, что обработка невозможна / сделка могла быть обработана
        // Либо можно вернуть false и рискнуть дублем, если это временная проблема с правами
        // Для безопасности, возможно, стоит вернуть true или генерировать исключение.
        // Пока вернем false, но это место для потенциального улучшения обработки ошибок.
        return false;
    }
    $processed_ids = file(PROCESSED_DEALS_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($processed_ids === false) {
        logError("Не удалось прочитать файл " . PROCESSED_DEALS_FILE);
        return false; // Ошибка чтения, действуем так, как будто не обработано
    }
    return in_array((string)$dealId, $processed_ids);
}

/**
 * Помечает сделку как обработанную, добавляя ее ID в файл.
 * @param string|int $dealId ID сделки
 * @return bool True в случае успеха, false в случае ошибки.
 */
function markDealAsProcessed($dealId) {
    $result = file_put_contents(PROCESSED_DEALS_FILE, (string)$dealId . PHP_EOL, FILE_APPEND | LOCK_EX);
    if ($result === false) {
        logError("Не удалось записать ID сделки $dealId в файл " . PROCESSED_DEALS_FILE);
        return false;
    }
    logDebug("Сделка $dealId добавлена в " . PROCESSED_DEALS_FILE);
    return true;
}

/**
 * Добавляет данные сделки в Google Spreadsheet.
 * НЕ УДАЛЯЕТ существующие строки. Только добавляет новую, если такой еще нет.
 * @param string $dealNumber Номер сделки
 * @param string $paymentLink Ссылка на оплату
 * @return bool Успешность операции (true, если запись добавлена или уже существовала)
 */
function pushToGoogleSheet($dealNumber, $paymentLink) {
    // GOOGLE_DRIVE_FILE_ID_AMO2EXCEL is now treated as SPREADSHEET_ID
    if (!GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
        logError('Ошибка в pushToGoogleSheet: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL (Spreadsheet ID) не сконфигурирован.');
        return false;
    }
    if (!DEFAULT_SHEET_NAME) {
        logError('Ошибка в pushToGoogleSheet: DEFAULT_SHEET_NAME не сконфигурирован.');
        return false;
    }

    $driveService = getDriveService(); // Assuming this returns Google_Service_Drive
    if (!$driveService) {
        logError('Не удалось получить Google Drive сервис для pushToGoogleSheet');
        return false;
    }

    $spreadsheetId = GOOGLE_DRIVE_FILE_ID_AMO2EXCEL;

    // Verify that the file ID is for a Google Sheet
    try {
        $fileMetadata = $driveService->files->get($spreadsheetId, ['fields' => 'mimeType, name']);
        $mimeType = $fileMetadata->getMimeType();
        $fileName = $fileMetadata->getName();

        if ($mimeType !== 'application/vnd.google-apps.spreadsheet') {
            logError("Ошибка в pushToGoogleSheet: Файл '$fileName' (ID: $spreadsheetId) не является Google таблицей (MIME тип: $mimeType). Пожалуйста, убедитесь, что GOOGLE_DRIVE_FILE_ID_AMO2EXCEL указывает на Google Sheet.");
            return false;
        }
        logDebug("[pushToGoogleSheet] Файл '$fileName' (ID: $spreadsheetId) подтвержден как Google Sheet (MIME тип: $mimeType).");

    } catch (Exception $e) {
        logError("Ошибка при проверке типа файла (ID: $spreadsheetId) через Google Drive API: " . $e->getMessage());
        // logError("Trace: " . $e->getTraceAsString()); // Uncomment for detailed Drive API call debugging
        return false;
    }
    
    try {
        $client = $driveService->getClient(); // Get the Google_Client from Drive Service
        $sheetsService = new Google_Service_Sheets($client);
        
        $spreadsheetId = GOOGLE_DRIVE_FILE_ID_AMO2EXCEL;
        $sheetName = DEFAULT_SHEET_NAME;
        logDebug("[pushToGoogleSheet] Используем имя листа: \"$sheetName\" в таблице ID: $spreadsheetId");

        // 1. Убедиться, что лист существует, если нет - создать
        $spreadsheet = $sheetsService->spreadsheets->get($spreadsheetId);
        $sheetExists = false;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() == $sheetName) {
                $sheetExists = true;
                break;
            }
        }

        if (!$sheetExists) {
            logDebug("[pushToGoogleSheet] Лист \"$sheetName\" не найден. Создаем новый лист.");
            $addSheetRequest = new Google_Service_Sheets_AddSheetRequest([
                'properties' => [
                    'title' => $sheetName
                ]
            ]);
            $batchUpdateRequest = new Google_Service_Sheets_BatchUpdateSpreadsheetRequest([
                'requests' => [$addSheetRequest]
            ]);
            $sheetsService->spreadsheets->batchUpdate($spreadsheetId, $batchUpdateRequest);
            logMessage("[pushToGoogleSheet] Лист \"$sheetName\" успешно создан.");
        } else {
            logDebug("[pushToGoogleSheet] Лист \"$sheetName\" найден.");
        }

        // 2. Прочитать существующие данные (колонки A и B) для проверки дубликатов и необходимости заголовков
        $rangeRead = $sheetName . '!A:B';
        $response = $sheetsService->spreadsheets_values->get($spreadsheetId, $rangeRead);
        $currentValues = $response->getValues(); // Это массив массивов строк, или null если пусто

        $dealNumberStr = (string)$dealNumber;
        $recordExists = false;
        if (!empty($currentValues)) {
            foreach ($currentValues as $rowIndex => $row) {
                // Строка может быть неполной, проверяем наличие элементов
                $cellDealNumber = isset($row[0]) ? (string)$row[0] : null;
                $cellPaymentLink = isset($row[1]) ? (string)$row[1] : null;
                if ($cellDealNumber === $dealNumberStr && $cellPaymentLink === $paymentLink) {
                    $recordExists = true;
                    logMessage("Сделка $dealNumberStr с таким же URL '$paymentLink' уже существует в Google Sheet на строке " . ($rowIndex + 1) . ". Пропускаем добавление.");
                    break;
                }
            }
        }

        if ($recordExists) {
            return true; // Запись уже существует, ничего не делаем
        }

        // 3. Если лист пустой (или был только что создан), добавить заголовки
        if (empty($currentValues)) {
            logDebug("[pushToGoogleSheet] Лист \"$sheetName\" пуст или не содержит данных в колонках A:B. Добавляем заголовки.");
            $headerData = [["Deal Number", "Payment Link"]];
            $body = new Google_Service_Sheets_ValueRange(['values' => $headerData]);
            // Используем append, чтобы он сам нашел первую строку (A1)
            $sheetsService->spreadsheets_values->append($spreadsheetId, $sheetName . "!A1", $body, ['valueInputOption' => 'USER_ENTERED']);
            logDebug("[pushToGoogleSheet] Заголовки добавлены.");
        }
        
        // 4. Добавить новую строку с данными
        logMessage("[pushToGoogleSheet] Добавляем новую запись для сделки $dealNumberStr");
        $newData = [[$dealNumberStr, $paymentLink]];
        $body = new Google_Service_Sheets_ValueRange(['values' => $newData]);
        // append найдет следующую пустую строку
        $result = $sheetsService->spreadsheets_values->append($spreadsheetId, $sheetName, $body, ['valueInputOption' => 'USER_ENTERED']);

        if ($result->getUpdates()->getUpdatedCells() > 0) {
            logMessage("Добавлена запись для ID сделки $dealNumber в Google Sheet: $spreadsheetId (лист: $sheetName)");
            return true;
        } else {
            logError("Ошибка при добавлении данных в Google Sheet для сделки $dealNumber. Ответ API не показал обновленных ячеек.");
            return false;
        }

    } catch (Exception $e) {
        logError("Ошибка в pushToGoogleSheet для ID сделки $dealNumber (Spreadsheet ID: " . (defined('GOOGLE_DRIVE_FILE_ID_AMO2EXCEL') ? GOOGLE_DRIVE_FILE_ID_AMO2EXCEL : 'не определен') . "): " . $e->getMessage());
        logError("Trace: " . $e->getTraceAsString());
        return false;
    }
}


/**
 * Обрабатывает входящие данные вебхука из AmoCRM
 */
function handleAmoWebhook() {
    
    // --- Lock file mechanism ---
    if (file_exists(LOCK_FILE)) {
        logError('Lock file exists. Another instance is running. Exiting.');
        header('HTTP/1.1 429 Too Many Requests');
        echo json_encode(['status' => 'locked', 'message' => 'Another process is already running. Please try again later.']);
        exit;
    }

    // Create lock file
    if (false === touch(LOCK_FILE)) {
        logError('Could not create lock file. Exiting to prevent concurrent runs.');
        // Potentially send a 500 error, as this is a server-side issue
        header('HTTP/1.1 500 Internal Server Error');
        echo json_encode(['status' => 'error', 'message' => 'Failed to create lock file.']);
        exit;
    }

    // Ensure lock file is removed on script exit
    register_shutdown_function(function() {
        if (file_exists(LOCK_FILE)) {
            unlink(LOCK_FILE);
            logDebug('Lock file removed.');
        }
    });
    // --- End Lock file mechanism ---

    header('HTTP/1.1 200 OK');
    header('Content-Type: application/json');

    logMessage('Webhook received from AmoCRM');

    // Get webhook data directly from POST
    $webhookData = $_POST;
    logDebug('Webhook data: ' . json_encode($webhookData, JSON_UNESCAPED_UNICODE));

    // Initialize variables
    $dealId = null;
    $paymentUrl = null;

    // Check for lead add or update events
    if (isset($webhookData['leads']['add']) || isset($webhookData['leads']['update'])) {
        // Get lead data from either add or update event
        $lead = isset($webhookData['leads']['add'])
            ? $webhookData['leads']['add'][0]
            : $webhookData['leads']['update'][0];

        // Extract deal ID
        $dealId = isset($lead['id']) ? (string)$lead['id'] : null;

        // Extract payment URL from custom field (id=752625)
        if (isset($lead['custom_fields'])) {
            foreach ($lead['custom_fields'] as $field) {
                if ((string)$field['id'] == '752625' && isset($field['values'][0]['value'])) {
                    $paymentUrl = (string)$field['values'][0]['value'];
                    break;
                }
            }
        }
    }

    // Process data if both values are present
    if ($dealId && $paymentUrl) {
        logMessage("Processing webhook - Deal ID: $dealId, Payment URL: $paymentUrl");

        if (isDealProcessed($dealId)) {
            logMessage("Deal ID $dealId has already been processed (found in " . PROCESSED_DEALS_FILE . "). Skipping.");
            echo json_encode([
                'status' => 'skipped',
                'message' => "Deal ID $dealId already processed and blocked."
            ]);
            return;
        }

        // Check if Google Sheet ID is configured
        if (!GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
            logError("Skipping push to Google Sheet: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL not configured. Deal ID: $dealId");
            echo json_encode(['status' => 'error', 'message' => 'Google Spreadsheet ID not configured']);
            return;
        }

        $result = pushToGoogleSheet($dealId, $paymentUrl);

        if ($result) {
            if (!markDealAsProcessed($dealId)) {
                logError("CRITICAL: Deal ID $dealId was processed for Google Sheet, but FAILED to be marked in " . PROCESSED_DEALS_FILE);
            }
        }

        echo json_encode([
            'status' => $result ? 'success' : 'error',
            'message' => $result ? 'Data successfully ensured in Google Sheet' : 'Failed to process data for Google Sheet'
        ]);

    } else {
        $logMsg = "Missing required data - ";
        if (!$dealId) $logMsg .= "Deal ID not found. ";
        if (!$paymentUrl) $logMsg .= "Payment URL not found (expected in custom field 752625).";
        logError($logMsg);
        logDebug("Webhook data where data was missing: " . json_encode($webhookData, JSON_UNESCAPED_UNICODE));
        echo json_encode(['status' => 'error', 'message' => 'Missing required data (deal ID or payment URL).']);
    }
}

// Only run handleAmoWebhook if this file is called directly via HTTP
if (php_sapi_name() !== 'cli' && basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    handleAmoWebhook();
}