<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/driveutils.php';
require_once __DIR__ . '/logger.php';
set_time_limit(35);
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Добавляет данные сделки в Excel файл на Google Drive
 * @param string $dealNumber Номер сделки
 * @param string $paymentLink Ссылка на оплату
 * @return bool Успешность операции
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

    // Получаем сервис Google Drive
    $drive = getDriveService();
    if (!$drive) {
        logError('Не удалось аутентифицироваться с Google Drive для pushToExcelSheet');
        return false;
    }

    try {
        $sheetName = DEFAULT_SHEET_NAME;
        logDebug("[pushToExcelSheet] Используем имя листа из конфигурации: \"$sheetName\"");

        $fileId = GOOGLE_DRIVE_FILE_ID_AMO2EXCEL;
        
        // Получаем информацию о файле, включая оригинальное имя
        try {
            $file = $drive->files->get($fileId, ['fields' => 'name']);
            $excelFileName = $file->getName();
            logDebug("[pushToExcelSheet] Оригинальное имя файла: $excelFileName");
        } catch (Exception $e) {
            logError("Не удалось получить информацию о файле: " . $e->getMessage());
            $excelFileName = "template.xlsx"; // Fallback имя файла
        }

        // Скачиваем файл с Google Drive
        $fileContent = downloadFileFromDrive($drive, $fileId, 'amo2excel');
        
        // Если не удалось скачать файл
        if (!$fileContent) {
            logError("[КРИТИЧЕСКАЯ ОШИБКА] Не удалось скачать Excel файл с Google Drive с ID: $fileId");
            logError("Убедитесь, что идентификатор файла корректен и сервисный аккаунт имеет права 'Editor'");
            logError("Пропускаем операцию для номера сделки $dealNumber.");
            return false;
        }

        // Сохраняем временный файл
        $tempFile = tempnam(sys_get_temp_dir(), 'excel_');
        file_put_contents($tempFile, $fileContent);

        // START --- Add this debugging block ---
        if (!isset($tempFile)) {
            logError("[Amo2Excel] \$tempFile is not set before IOFactory::load(). This is a critical error in logic.");
            return false; // Or handle error appropriately
        }

        logDebug("[Amo2Excel] Attempting to load Excel file from local path: " . $tempFile);

        if (file_exists($tempFile)) {
            logDebug("[Amo2Excel] File check: File exists at " . $tempFile);
            if (!is_readable($tempFile)) {
                logError("[Amo2Excel] File check: File exists but is NOT READABLE at " . $tempFile);
            }
        } else {
            logError("[Amo2Excel] File check: File DOES NOT EXIST at " . $tempFile);
            // Consider adding more details here:
            // - How was $tempFile determined?
            // - Did the download from Google Drive succeed? Log any errors from the download process.
            return false; // Or handle error appropriately, as IOFactory::load() will fail
        }
        // END --- Add this debugging block ---

        // Загружаем Excel файл
        $spreadsheet = IOFactory::load($tempFile);
        logDebug("[pushToExcelSheet] Имена листов в книге: " . json_encode($spreadsheet->getSheetNames()));

        // Получаем или создаем лист
        if ($spreadsheet->sheetNameExists($sheetName)) {
            logDebug("[pushToExcelSheet] Лист \"$sheetName\" найден. Извлекаем данные.");
            $sheet = $spreadsheet->getSheetByName($sheetName);
            $data = $sheet->toArray();

            // Если таблица пуста, добавляем заголовки
            if (empty($data)) {
                logDebug("[pushToExcelSheet] Лист \"$sheetName\" был пуст. Инициализируем данные с заголовками.");
                $data = [["Deal Number", "Payment Link"]];
            }
        } else {
            logDebug("[pushToExcelSheet] Лист \"$sheetName\" не найден. Создаем новый лист.");
            $sheet = $spreadsheet->createSheet();
            $sheet->setTitle($sheetName);
            $data = [["Deal Number", "Payment Link"]];
        }

        // Удаляем пустые строки и строки без цифр в первой колонке
        $cleanData = [$data[0]]; // Сохраняем заголовок
        $existingDeals = [];
        $lastNonEmptyIndex = 0;
        $removedRows = 0;

        for ($i = 1; $i < count($data); $i++) {
            // Проверяем что первая колонка содержит только цифры
            $firstCol = trim((string)$data[$i][0]);
            if (!empty($firstCol) && ctype_digit($firstCol)) {
                $cleanData[] = $data[$i];
                $existingDeals[$firstCol] = [
                    'index' => count($cleanData) - 1,
                    'url' => $data[$i][1]
                ];
                $lastNonEmptyIndex = count($cleanData) - 1;
            } else if (!empty($data[$i][0]) || !empty($data[$i][1])) {
                $removedRows++;
                logDebug("[pushToExcelSheet] Удалена строка $i. Значение первой колонки: '" . $firstCol . "'");
            }
        }

        if ($removedRows > 0) {
            logMessage("[pushToExcelSheet] Удалено $removedRows строк, не соответствующих формату (первая колонка должна содержать только цифры)");
        }

        $dealNumberStr = (string)$dealNumber;
        logDebug("[pushToExcelSheet] Проверка сделки $dealNumberStr и URL: $paymentLink");

        // Проверяем существование сделки и URL
        if (isset($existingDeals[$dealNumberStr])) {
            if ($existingDeals[$dealNumberStr]['url'] === $paymentLink) {
                logMessage("Сделка $dealNumberStr с таким же URL уже существует. Пропускаем.");
                unlink($tempFile);
                return false;
            }
        }

        // Добавляем новую строку сразу после последней непустой
        $newRow = [$dealNumberStr, $paymentLink];
        array_splice($cleanData, $lastNonEmptyIndex + 1, 0, [$newRow]);

        // Очищаем лист и записываем обновленные данные
        $sheet->fromArray($cleanData, null, 'A1');

        // Сохраняем обновленный файл
        $writer = new Xlsx($spreadsheet);
        $writer->save($tempFile);

        // Загружаем файл обратно на Google Drive
        $updatedContent = file_get_contents($tempFile);
        $result = uploadFileToDrive($drive, $fileId, $updatedContent, $excelFileName);
        
        unlink($tempFile); // Удаляем временный файл
        
        if ($result) {
            logMessage("Добавлена запись ID сделки $dealNumber и загружена на Google Drive: $fileId");
            return true;
        } else {
            logError("Ошибка при загрузке обновленного файла на Google Drive");
            return false;
        }

    } catch (Exception $e) {
        logError("Ошибка в pushToExcelSheet для ID сделки $dealNumber (Drive ID: " . GOOGLE_DRIVE_FILE_ID_AMO2EXCEL . "): " . $e->getMessage());
        logError($e->getTraceAsString());
        return false;
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
    logDebug('Webhook data: ' . json_encode($webhookData));
    
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
        $dealId = isset($lead['id']) ? $lead['id'] : null;

        // Extract payment URL from custom field (id=752625)
        if (isset($lead['custom_fields'])) {
            foreach ($lead['custom_fields'] as $field) {
                if ($field['id'] == '752625' && isset($field['values'][0]['value'])) {
                    $paymentUrl = $field['values'][0]['value'];
                    break;
                }
            }
        }
    }
    
    // Process data if both values are present
    if ($dealId && $paymentUrl) {
        logMessage("Processing webhook - Deal ID: $dealId, Payment URL: $paymentUrl");
        
        if (!GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
            logError("Skipping push to Excel: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL not configured.");
            echo json_encode(['status' => 'error', 'message' => 'Google Drive file ID not configured']);
            return;
        }
        
        $result = pushToExcelSheet($dealId, $paymentUrl);
        echo json_encode([
            'status' => $result ? 'success' : 'error',
            'message' => $result ? 'Data successfully pushed to Excel' : 'Failed to push data to Excel'
        ]);
    } else {
        logError("Missing required data - Deal ID: " . ($dealId ? $dealId : 'not found') . 
                 ", Payment URL: " . ($paymentUrl ? 'found' : 'not found'));
        echo json_encode(['status' => 'error', 'message' => 'Missing required data']);
    }
}

// Если этот скрипт вызывается напрямую как вебхук-обработчик
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    handleAmoWebhook();
}
