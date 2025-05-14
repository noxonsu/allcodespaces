<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/driveutils.php';
require_once __DIR__ . '/logger.php';

set_time_limit(40); // Немного увеличил на всякий случай

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

// Имя файла для хранения ID обработанных сделок
define('PROCESSED_DEALS_FILE', __DIR__ . '/blocked_webhook_deals.txt');

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
 * Добавляет данные сделки в Excel файл на Google Drive
 * НЕ УДАЛЯЕТ существующие строки. Только добавляет новую, если такой еще нет.
 * @param string $dealNumber Номер сделки
 * @param string $paymentLink Ссылка на оплату
 * @return bool Успешность операции (true, если запись добавлена или уже существовала)
 */
function pushToExcelSheet($dealNumber, $paymentLink) {
    if (!GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
        logError('Ошибка в pushToExcelSheet: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL не сконфигурирован.');
        return false;
    }
    if (!DEFAULT_SHEET_NAME) {
        logError('Ошибка в pushToExcelSheet: DEFAULT_SHEET_NAME не сконфигурирован.');
        return false;
    }

    $drive = getDriveService();
    if (!$drive) {
        logError('Не удалось аутентифицироваться с Google Drive для pushToExcelSheet');
        return false;
    }

    $tempFile = null; // Инициализируем здесь для finally блока
    try {
        $sheetName = DEFAULT_SHEET_NAME;
        logDebug("[pushToExcelSheet] Используем имя листа из конфигурации: \"$sheetName\"");
        $fileId = GOOGLE_DRIVE_FILE_ID_AMO2EXCEL;

        $file = $drive->files->get($fileId, ['fields' => 'name']);
        $excelFileName = $file->getName();
        logDebug("[pushToExcelSheet] Оригинальное имя файла: $excelFileName");

        $fileContent = downloadFileFromDrive($drive, $fileId, 'amo2excel');
        if (!$fileContent) {
            logError("[КРИТИЧЕСКАЯ ОШИБКА] Не удалось скачать Excel файл с Google Drive с ID: $fileId. Номер сделки $dealNumber.");
            return false;
        }

        $tempFile = tempnam(sys_get_temp_dir(), 'excel_');
        if ($tempFile === false) {
             logError("[КРИТИЧЕСКАЯ ОШИБКА] Не удалось создать временный файл. Номер сделки $dealNumber.");
             return false;
        }
        file_put_contents($tempFile, $fileContent);

        logDebug("[Amo2Excel] Загрузка Excel файла из: " . $tempFile);
        $spreadsheet = IOFactory::load($tempFile);
        logDebug("[pushToExcelSheet] Имена листов в книге: " . json_encode($spreadsheet->getSheetNames()));

        $sheet = null;
        if ($spreadsheet->sheetNameExists($sheetName)) {
            logDebug("[pushToExcelSheet] Лист \"$sheetName\" найден.");
            $sheet = $spreadsheet->getSheetByName($sheetName);
        } else {
            logDebug("[pushToExcelSheet] Лист \"$sheetName\" не найден. Создаем новый лист.");
            $sheet = $spreadsheet->createSheet();
            $sheet->setTitle($sheetName);
        }

        $dealNumberStr = (string)$dealNumber;
        // Calculate $highestRow based on column A content
        // Iterate up to the highest row known to have any data in column A
        $maxPotentialRow = $sheet->getHighestDataRow('A');
        $highestRow = 0; // Initialize to 0, meaning no qualifying rows found yet

        for ($r = 1; $r <= $maxPotentialRow; $r++) {
            $cellValue = $sheet->getCell('A' . $r)->getValue();
            // Check if the cell value in column A, when trimmed, has at least 3 characters
            if ($cellValue !== null && strlen(trim((string)$cellValue)) >= 3) {
            $highestRow = $r; // Update to this row number, as it's the latest qualifying row found
            }
        }
        // $highestRow now stores the index of the last row with at least 3 chars in column A,
        // or 0 if no such row was found (e.g., empty sheet or all A cells have < 3 chars).

        // Проверка на существующую запись (ID + URL)
        // Это вторичная проверка (основная через blocked_webhook_deals.txt),
        // на случай, если ID еще не в blocked_webhook_deals.txt, но данные уже есть в Excel.
        $recordExists = false;
        for ($row = 1; $row <= $highestRow; ++$row) {
            // Используем getFormattedValue для надежности, если в ячейке формула
            $cellDealNumber = $sheet->getCell('A' . $row)->getValue(); // или getFormattedValue()
            $cellPaymentLink = $sheet->getCell('B' . $row)->getValue(); // или getFormattedValue()
            if ((string)$cellDealNumber === $dealNumberStr && (string)$cellPaymentLink === $paymentLink) {
                $recordExists = true;
                logMessage("Сделка $dealNumberStr с таким же URL '$paymentLink' уже существует в Excel на строке $row. Пропускаем добавление.");
                break;
            }
        }

        if ($recordExists) {
            // Запись уже существует, ничего не делаем с Excel, возвращаем true,
            // чтобы dealId был добавлен в blocked_webhook_deals.txt
            return true;
        }

        // Определяем следующую строку для записи
        $nextRow;
        $isNewSheet = ($highestRow == 0 || ($highestRow == 1 && $sheet->getCell('A1')->getValue() === null));

        if ($isNewSheet) {
            logDebug("[pushToExcelSheet] Лист \"$sheetName\" пуст или не содержит заголовков. Добавляем заголовки.");
            $sheet->setCellValue('A1', "Deal Number");
            $sheet->setCellValue('B1', "Payment Link");
            $nextRow = 2; // Данные будем писать во вторую строку
        } else {
            $nextRow = $highestRow + 1;
        }

        // Добавляем новую строку
        logMessage("[pushToExcelSheet] Добавляем новую запись для сделки $dealNumberStr в строку $nextRow");
        $sheet->setCellValue('A' . $nextRow, $dealNumberStr);
        $sheet->setCellValue('B' . $nextRow, $paymentLink);

        $writer = new Xlsx($spreadsheet);
        $writer->save($tempFile);

        $updatedContent = file_get_contents($tempFile);
        $result = uploadFileToDrive($drive, $fileId, $updatedContent, $excelFileName);

        if ($result) {
            logMessage("Добавлена запись для ID сделки $dealNumber и загружена на Google Drive: $fileId");
            return true;
        } else {
            logError("Ошибка при загрузке обновленного файла на Google Drive для сделки $dealNumber");
            return false;
        }

    } catch (Exception $e) {
        logError("Ошибка в pushToExcelSheet для ID сделки $dealNumber (Drive ID: " . (defined('GOOGLE_DRIVE_FILE_ID_AMO2EXCEL') ? GOOGLE_DRIVE_FILE_ID_AMO2EXCEL : 'не определен') . "): " . $e->getMessage());
        logError($e->getTraceAsString());
        return false;
    } finally {
        if (isset($tempFile) && file_exists($tempFile)) {
            unlink($tempFile);
            logDebug("[pushToExcelSheet] Временный файл $tempFile удален.");
        }
    }
}


/**
 * Обрабатывает входящие данные вебхука из AmoCRM
 */
function handleAmoWebhook() {
    header('HTTP/1.1 200 OK');
    header('Content-Type: application/json');

    logMessage('Webhook received from AmoCRM');

    // Get webhook data directly from POST
    $webhookData = $_POST;
    logDebug('Webhook data: ' . json_encode($webhookData, JSON_UNESCAPED_UNICODE)); // Добавил JSON_UNESCAPED_UNICODE для лучшего логирования

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
        $dealId = isset($lead['id']) ? (string)$lead['id'] : null; // Приводим к строке сразу

        // Extract payment URL from custom field (id=752625)
        if (isset($lead['custom_fields'])) {
            foreach ($lead['custom_fields'] as $field) {
                // ID кастомного поля может быть строкой или числом в JSON, приводим к строке для сравнения
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

        // --- НОВАЯ ЛОГИКА: Проверка, обработана ли сделка ---
        if (isDealProcessed($dealId)) {
            logMessage("Deal ID $dealId has already been processed (found in " . PROCESSED_DEALS_FILE . "). Skipping.");
            echo json_encode([
                'status' => 'skipped',
                'message' => "Deal ID $dealId already processed and blocked."
            ]);
            return;
        }
        // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

        if (!GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
            logError("Skipping push to Excel: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL not configured. Deal ID: $dealId");
            echo json_encode(['status' => 'error', 'message' => 'Google Drive file ID not configured']);
            return;
        }

        $result = pushToExcelSheet($dealId, $paymentUrl);

        if ($result) { // $result === true означает, что данные в Excel (либо уже были, либо добавлены)
            // Помечаем сделку как обработанную только после успешного "обеспечения наличия" в Excel
            if (!markDealAsProcessed($dealId)) {
                // Если не удалось пометить, это проблема, но Excel уже обновлен (или был в порядке)
                // Можно добавить специальное логирование или обработку для этого случая
                logError("CRITICAL: Deal ID $dealId was processed for Excel, but FAILED to be marked in " . PROCESSED_DEALS_FILE . ". Risk of future duplicate processing attempt!");
            }
        }

        echo json_encode([
            'status' => $result ? 'success' : 'error',
            'message' => $result ? 'Data successfully ensured in Excel' : 'Failed to process data for Excel'
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

// Если этот скрипт вызывается напрямую как вебхук-обработчик
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    handleAmoWebhook();
}