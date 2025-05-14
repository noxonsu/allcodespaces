<?php

// --- КОНФИГУРАЦИЯ ---
$baseUrl = "https://sip.qazna24.kz/admin/config.php";
$loginPageUrl = $baseUrl . "?display=cdr";
$csvExportUrl = $baseUrl . "?display=cdr";

$cookieFile = __DIR__ . '/cookie.txt';
$csvFileDefault = __DIR__ . '/export.csv';
$scannedCallsFile = __DIR__ . '/scanned_calls.txt';

$username = 's.noxon';
$passwordLiteral = 'd4S3g4j9Vp%#%T';

$loginPostData = "username=" . urlencode($username) . "&password=" . str_replace(
    ['%', '#'],
    ['%25', '%23'],
    $passwordLiteral
);

$csvPostData = "order=calldate&startday=13&startmonth=05&startyear=2025&starthour=00&startmin=00&endday=13&endmonth=05&endyear=2025&endhour=23&endmin=59&need_csv=true&limit=5000&cnum=&cnum_mod=begins_with&cnam=&cnam_mod=begins_with&outbound_cnum=&outbound_cnum_mod=begins_with&did=&did_mod=begins_with&dst=&dst_mod=begins_with&dst_cnam=&dst_cnam_mod=begins_with&userfield=&userfield_mod=begins_with&accountcode=&accountcode_mod=begins_with&dur_min=&dur_max=&disposition=all&sort=DESC&group=day";

$recordingsDir = __DIR__ . '/downloaded_recordings';
$recordingUrlTemplate = "https://sip.qazna24.kz/admin/config.php?display=cdr&action=download_audio&cdr_file=";
$csvIdColumnName = 'uniqueid';
$csvRealFilenameColumnName = 'recordingfile';
$csvDispositionColumnName = 'disposition';
$csvBillsecColumnName = 'billsec';
$minDurationForDownload = 1;

$maxFilesPerRun = 5;
$curlFileDownloadTimeout = 120;
// ---------------------------------------------------------------------

// !!! ВАЖНО: Оставляем вывод как текст для отладки. ЗАКОММЕНТИРУЙТЕ ПОСЛЕ ОТЛАДКИ!
header('Content-Type: text/plain; charset=utf-8');
// ob_start(); // Если все остальное не поможет, можно раскомментировать

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
set_time_limit(0); 
date_default_timezone_set('Asia/Almaty');

function script_log($message) {
    $cleaned_message = preg_replace('/[\x00-\x1F\x7F]/', ' ', $message);
    if (strlen($cleaned_message) > 5000) {
        $cleaned_message = substr($cleaned_message, 0, 5000) . '... [TRUNCATED]';
    }
    echo "[" . date("Y-m-d H:i:s") . "] " . $cleaned_message . "\n";
    flush();
}

// --- ФУНКЦИЯ ПРОВЕРКИ ВАЛИДНОСТИ СЕССИИ ---
function checkResponseForValidSession($httpCode, $body, $loggedInUsernameToCheck) {
    if ($httpCode == 200 && $body !== null) {
        $loginFormAbsent = stripos($body, 'name="username"') === false && stripos($body, 'name="password"') === false && stripos($body, 'type="password"') === false && stripos($body, "id=\"login") === false;
        $logoutLinkPresent = stripos($body, 'action=logout') !== false || stripos($body, 'href="logout') !== false || stripos($body, '>Выход<') !== false || stripos($body, '>Logout<') !== false;
        $usernameIsOnPage = stripos($body, htmlspecialchars($loggedInUsernameToCheck, ENT_QUOTES)) !== false;
        if ($loginFormAbsent && ($logoutLinkPresent || $usernameIsOnPage)) return true;
        if (stripos($body, 'Call Detail Records') !== false || stripos($body, 'Детализация звонков') !== false) return true;
    }
    return false;
}

// --- УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ cURL ЗАПРОСОВ ---
function executeCurl($url, $isPostRequest = false, $postFields = null, $cookieFile, $manageCookieJar = false, &$responseHeadersOutputString = null, $isDownloadRequest = false) {
    global $curlFileDownloadTimeout;
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);

    if ($isPostRequest) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
    }
    $headers = [
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language: en-US,en;q=0.9", "Cache-Control: max-age=0", "Connection: keep-alive",
        "Origin: https://sip.qazna24.kz", "Referer: https://sip.qazna24.kz/admin/config.php?display=cdr",
        "Sec-Fetch-Dest: document", "Sec-Fetch-Mode: navigate", "Sec-Fetch-Site: same-origin", "Sec-Fetch-User: ?1",
        "Upgrade-Insecure-Requests: 1", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "sec-ch-ua: \"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
        "sec-ch-ua-mobile: ?0", "sec-ch-ua-platform: \"Windows\""
    ];
    if ($isPostRequest) $headers[] = "Content-Type: application/x-www-form-urlencoded";
    
    if ($isDownloadRequest) {
        $acceptKey = array_search("Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", $headers);
        if ($acceptKey !== false) $headers[$acceptKey] = "Accept: audio/wav,audio/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5";
        $headersToRemove = ["Sec-Fetch-Dest: document", "Sec-Fetch-Mode: navigate", "Sec-Fetch-User: ?1", "Upgrade-Insecure-Requests: 1"];
        foreach ($headersToRemove as $htr) { $k = array_search($htr, $headers); if ($k !== false) unset($headers[$k]); }
        $headers = array_values($headers);
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $collectedHeaders = '';
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $headerLine) use (&$collectedHeaders) {
        $collectedHeaders .= $headerLine;
        return strlen($headerLine);
    });
    
    $verboseLogHandle = null;

    // Always return the transfer as a string
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    if (!$isDownloadRequest) {
        // Enable VERBOSE and STDERR only for non-download requests
        $verboseLogHandle = fopen('php://temp', 'w+');
        curl_setopt($ch, CURLOPT_VERBOSE, true);
        curl_setopt($ch, CURLOPT_STDERR, $verboseLogHandle);
    } else {
        // Ensure VERBOSE is off for download requests to prevent binary in logs
        curl_setopt($ch, CURLOPT_VERBOSE, false);
    }

    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 10);
    curl_setopt($ch, CURLOPT_TIMEOUT, ($isDownloadRequest ? $curlFileDownloadTimeout : 60)); // Adjust timeout
    if (file_exists($cookieFile)) curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
    if ($manageCookieJar) curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);

    $curlExecResult = curl_exec($ch); // This is now the body (or false on failure)
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $contentTypeHeader = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $curlErrno = curl_errno($ch);
    $curlError = curl_error($ch);
    
    if ($verboseLogHandle !== null) { // Will only be true if !$isDownloadRequest
        rewind($verboseLogHandle);
        $verboseLogContent = stream_get_contents($verboseLogHandle);
        fclose($verboseLogHandle);
        if (!empty($verboseLogContent)) {
             script_log("cURL Verbose Log for " . $url . ": " . $verboseLogContent);
        }
    }
    
    if ($responseHeadersOutputString !== null) {
        $responseHeadersOutputString = $collectedHeaders;
    }

    if ($curlErrno) {
        curl_close($ch);
        script_log('Ошибка cURL для URL ' . $url . ': ' . $curlError);
        return ['httpCode' => 0, 'body' => null, 'headers' => $collectedHeaders, 'finalUrl' => $url, 'success' => false, 'contentType' => null, 'curlError' => $curlError];
    }
    curl_close($ch);

    // Success means cURL operation itself didn't error and HTTP status is 200.
    // The caller is responsible for checking the body content, especially for downloads.
    $success = ($httpCode == 200);

    return ['httpCode' => $httpCode, 'body' => $curlExecResult, 'headers' => $collectedHeaders, 'finalUrl' => $finalUrl, 'contentType' => $contentTypeHeader, 'success' => $success, 'curlError' => null];
}

// --- Остальной код скрипта (логин, CSV, основной цикл скачивания) ---
$processedCallIds = [];
if (file_exists($scannedCallsFile)) {
    $lines = file($scannedCallsFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines !== false) {
        $processedCallIds = array_fill_keys($lines, true);
        script_log("Загружено " . count($processedCallIds) . " ID ранее обработанных звонков из '" . basename($scannedCallsFile) . "'.");
    }
}

$loggedIn = false; $attemptedLoginThisRun = false; $actualCsvFilename = $csvFileDefault;
if (!file_exists($actualCsvFilename)) {
    $potentialCsvs = glob(__DIR__ . '/cdr__*.csv');
    if (!empty($potentialCsvs)) {
        usort($potentialCsvs, function($a, $b) { return filemtime($b) - filemtime($a); });
        $actualCsvFilename = $potentialCsvs[0];
        script_log("Используется существующий CSV файл: '" . basename($actualCsvFilename) . "'");
    }
}

if (file_exists($cookieFile)) {
    script_log("Проверка существующей сессии из файла '" . basename($cookieFile) . "'...");
    $sessionCheckH = ''; 
    $sessionCheckResult = executeCurl($loginPageUrl, false, null, $cookieFile, true, $sessionCheckH);
    if (checkResponseForValidSession($sessionCheckResult['httpCode'], $sessionCheckResult['body'], $username)) {
        script_log("Сессия действительна.");
        $loggedIn = true;
    } else {
        script_log("Сессия недействительна. HTTP: ".$sessionCheckResult['httpCode'].". Попытка нового входа.");
        if (file_exists($cookieFile)) unlink($cookieFile);
    }
} else {
    script_log("Файл cookie '" . basename($cookieFile) . "' не найден. Будет предпринята попытка входа.");
}

if (!$loggedIn) {
    script_log("Попытка входа пользователя '" . $username . "'...");
    $attemptedLoginThisRun = true;
    $loginH = '';
    $loginResult = executeCurl($loginPageUrl, true, $loginPostData, $cookieFile, true, $loginH); 
    if (checkResponseForValidSession($loginResult['httpCode'], $loginResult['body'], $username)) {
        script_log("Вход успешен.");
        $loggedIn = true;
    } else {
        script_log("Ошибка входа. HTTP: " . $loginResult['httpCode'] . " URL: " . $loginResult['finalUrl']);
    }
}

$csvNeedsExport = true;
if (file_exists($actualCsvFilename)) {
    $csvFileAge = time() - filemtime($actualCsvFilename);
    if ($csvFileAge < 3600) {
        script_log("CSV файл '" . basename($actualCsvFilename) . "' свежий (возраст: " . round($csvFileAge/60) . " мин), экспорт не требуется.");
        $csvNeedsExport = false;
    } else {
        script_log("CSV файл '" . basename($actualCsvFilename) . "' устарел (возраст: " . round($csvFileAge/60) . " мин), будет экспортирован заново.");
    }
} else {
    script_log("CSV файл '" . basename($actualCsvFilename) . "' не найден, требуется экспорт.");
}

if ($loggedIn && $csvNeedsExport) {
    script_log("Экспорт таблицы CSV..."); $csvH = '';
    $csvResult = executeCurl($csvExportUrl, true, $csvPostData, $cookieFile, true, $csvH); 
    if ($csvResult['httpCode'] == 200) {
        $isCsv = false; $filenameToSave = $csvFileDefault;
        if (!empty($csvResult['headers'])) {
            if (preg_match('/Content-Type: (text\/csv|application\/csv|application\/vnd\.ms-excel|application\/octet-stream)/i', $csvResult['headers'])) $isCsv = true;
            if (preg_match('/Content-Disposition:.*?filename="?([^"]+)"?/i', $csvResult['headers'], $matches)) {
                $suggestedFilename = trim($matches[1], "\"' \r\n\t"); if (!empty($suggestedFilename)) $filenameToSave = __DIR__ . '/' . basename($suggestedFilename);
            }
        }
        if (!$isCsv && !empty($csvResult['body']) && (strpos($csvResult['body'], ',') !== false || strpos($csvResult['body'], ';') !== false) && strpos($csvResult['body'], "\n") !== false) $isCsv = true;

        if ($isCsv && !empty($csvResult['body'])) {
            $actualCsvFilename = $filenameToSave;
            $bytesWritten = file_put_contents($actualCsvFilename, $csvResult['body']);
            if ($bytesWritten !== false) script_log("CSV экспортирован: '" . basename($actualCsvFilename) . "' (" . $bytesWritten . " байт).");
            else { script_log("КРИТ. ОШИБКА: Не удалось записать CSV '" . basename($actualCsvFilename) . "'."); $loggedIn = false; }
        } else {
            script_log("Ошибка экспорта CSV: HTTP 200, но не CSV или тело пустое. Content-Type: " . ($csvResult['contentType'] ?? 'N/A'));
            $loggedIn = false;
        }
    } else {
        script_log("Ошибка при запросе экспорта CSV. HTTP: " . $csvResult['httpCode']);
        $loggedIn = false;
    }
}


$totalUniqueFiles = 0;

if ($loggedIn && file_exists($actualCsvFilename)) {
    script_log("Обработка CSV '" . basename($actualCsvFilename) . "' для скачивания записей...");
    if (!is_dir($recordingsDir)) {
        if (mkdir($recordingsDir, 0775, true)) script_log("Создана директория: '" . basename($recordingsDir) . "'");
        else { script_log("КРИТ. ОШИБКА: Не удалось создать директорию '" . basename($recordingsDir) . "'."); exit; }
    }
    
    $csvFileHandle = fopen($actualCsvFilename, "r");
    if ($csvFileHandle === false) { script_log("КРИТ. ОШИБКА: Не удалось открыть CSV '" . basename($actualCsvFilename) . "'."); exit; }
    $header = fgetcsv($csvFileHandle);
    if ($header === false) { script_log("КРИТ. ОШИБКА: Не удалось прочитать заголовки из CSV."); fclose($csvFileHandle); exit; }
    if (isset($header[0]) && strpos($header[0], "\xEF\xBB\xBF") === 0) $header[0] = substr($header[0], 3);
    
    $idColumnIndex = array_search($csvIdColumnName, $header);
    $realFilenameColumnIndex = array_search($csvRealFilenameColumnName, $header);
    $dispositionColumnIndex = array_search($csvDispositionColumnName, $header);
    $billsecColumnIndex = array_search($csvBillsecColumnName, $header);
    
    if ($idColumnIndex === false) { script_log("КРИТ. ОШИБКА: Столбец ID ('" . $csvIdColumnName . "') не найден. Заголовки: " . implode(", ", $header)); fclose($csvFileHandle); exit; }
    if ($realFilenameColumnIndex === false) { script_log("ПРЕДУПРЕЖДЕНИЕ: Столбец имени файла ('" . $csvRealFilenameColumnName . "') не найден. Имена файлов будут формироваться на основе ID.");
    } else { script_log("Столбец имени файла ('" . $csvRealFilenameColumnName . "') инд: " . $realFilenameColumnIndex); }
    script_log("Столбец ID ('" . $csvIdColumnName . "') инд: " . $idColumnIndex);
    if ($dispositionColumnIndex === false) { script_log("ПРЕДУПРЕЖДЕНИЕ: Столбец статуса ('" . $csvDispositionColumnName . "') не найден. Фильтрация по статусу не будет применяться.");
    } else { script_log("Столбец статуса ('" . $csvDispositionColumnName . "') инд: " . $dispositionColumnIndex); }
    if ($billsecColumnIndex === false) { script_log("ПРЕДУПРЕЖДЕНИЕ: Столбец длительности ('" . $csvBillsecColumnName . "') не найден. Фильтрация по длительности не будет применяться.");
    } else { script_log("Столбец длительности ('" . $csvBillsecColumnName . "') инд: " . $billsecColumnIndex); }

    $tempCsvHandle = fopen($actualCsvFilename, "r");
    if ($tempCsvHandle) {
        fgetcsv($tempCsvHandle); 
        $uniqueIdsInCsv = [];
        while (($tempRow = fgetcsv($tempCsvHandle)) !== false) {
            if (isset($tempRow[$idColumnIndex]) && !empty(trim($tempRow[$idColumnIndex]))) {
                $uniqueIdsInCsv[trim($tempRow[$idColumnIndex])] = true;
            }
        }
        fclose($tempCsvHandle);
        $totalUniqueFiles = count($uniqueIdsInCsv);
        script_log("Найдено уникальных ID в текущем CSV: " . $totalUniqueFiles);
    } else {
        script_log("ПРЕДУПРЕЖДЕНИЕ: Не удалось переоткрыть CSV для подсчета totalUniqueFiles. Статистика может быть неточной.");
    }

    $filesProcessedThisRun = 0;
    $downloadCount = 0;
    $skippedExistingCount = 0;
    $skippedProcessedPreRunCount = 0;
    $skippedByFilterCount = 0;
    $errorCount = 0;
    $rowIndex = 0;

    while (($row = fgetcsv($csvFileHandle)) !== false) {
        $rowIndex++;
        
        if (!isset($row[$idColumnIndex])) {
            script_log("[Строка CSV " . $rowIndex . "] Пропуск: отсутствует значение в столбце ID.");
            continue;
        }
        $fileIdToDownload = trim($row[$idColumnIndex]);
        
        $actualRecordingFilename = ($realFilenameColumnIndex !== false && isset($row[$realFilenameColumnIndex])) ? trim($row[$realFilenameColumnIndex]) : '';
        if (empty($actualRecordingFilename)) $actualRecordingFilename = $fileIdToDownload . ".wav";
        
        if (empty($fileIdToDownload)) {
            script_log("[Строка CSV " . $rowIndex . "] Пропуск: пустой ID.");
            continue;
        }

        if (isset($processedCallIds[$fileIdToDownload])) {
            $skippedProcessedPreRunCount++;
            continue; 
        }

        $localFilePath = $recordingsDir . DIRECTORY_SEPARATOR . basename($actualRecordingFilename);
        if (file_exists($localFilePath) && filesize($localFilePath) > 100) {
            script_log("[Строка CSV " . $rowIndex . "] Пропуск ID '" . $fileIdToDownload . "': файл '" . basename($localFilePath) . "' уже существует локально и имеет достаточный размер.");
            file_put_contents($scannedCallsFile, $fileIdToDownload . PHP_EOL, FILE_APPEND | LOCK_EX);
            $processedCallIds[$fileIdToDownload] = true;
            $skippedExistingCount++;
            continue;
        }
        
        $disposition = ($dispositionColumnIndex !== false && isset($row[$dispositionColumnIndex])) ? strtoupper(trim($row[$dispositionColumnIndex])) : '';
        $billsec = ($billsecColumnIndex !== false && isset($row[$billsecColumnIndex])) ? (int)trim($row[$billsecColumnIndex]) : 0;

        $passesFilter = true;
        $filterReason = "";

        if ($dispositionColumnIndex !== false) {
            if ($disposition !== 'ANSWERED') {
                $passesFilter = false;
                $filterReason = "статус '" . ($disposition ?: 'N/A') . "' (не ANSWERED)";
            } elseif ($billsecColumnIndex !== false && $billsec < $minDurationForDownload) { 
                $passesFilter = false;
                $filterReason = "статус ANSWERED, но длительность " . $billsec . " сек (меньше " . $minDurationForDownload . " сек)";
            }
        }

        if (!$passesFilter) {
            script_log("[Строка CSV " . $rowIndex . "] ID '" . $fileIdToDownload . "' пропущен фильтром: " . $filterReason);
            file_put_contents($scannedCallsFile, $fileIdToDownload . PHP_EOL, FILE_APPEND | LOCK_EX);
            $processedCallIds[$fileIdToDownload] = true;
            $skippedByFilterCount++;
            continue;
        }

        if ($filesProcessedThisRun >= $maxFilesPerRun) {
            script_log("Достигнут лимит ($maxFilesPerRun) новых файлов для скачивания за этот запуск. Остальные будут обработаны в следующих запусках.");
            break;
        }

        $filesProcessedThisRun++;
        script_log("[#" . $filesProcessedThisRun . "/" . $maxFilesPerRun . "][Стр. CSV " . $rowIndex . "] Скачивание ID '" . $fileIdToDownload . "' (файл: '" . basename($actualRecordingFilename) . "')");

        $downloadResponseHeaders = '';
        // Call executeCurl with isDownloadRequest = true
        $downloadResult = executeCurl(
            $recordingUrlTemplate . urlencode($fileIdToDownload),
            false, // isPostRequest
            null,  // postFields
            $cookieFile,
            false, // manageCookieJar
            $downloadResponseHeaders,
            true   // isDownloadRequest
        );

        $currentFilePathAfterDownload = $localFilePath;
        $fileWrittenSuccessfully = false;

        if ($downloadResult['success'] && $downloadResult['httpCode'] == 200) {
            if ($downloadResult['body'] !== false && $downloadResult['body'] !== null && strlen($downloadResult['body']) > 0) {
                $fileHandleForCurlDownload = fopen($localFilePath, 'w');
                if ($fileHandleForCurlDownload) {
                    $bytesWritten = fwrite($fileHandleForCurlDownload, $downloadResult['body']);
                    fclose($fileHandleForCurlDownload);
                    if ($bytesWritten === strlen($downloadResult['body'])) {
                        $fileWrittenSuccessfully = true;
                    } else {
                        script_log("  ОШИБКА: Не удалось полностью записать тело ответа в файл '" . basename($localFilePath) . "'. Записано: $bytesWritten, Ожидалось: " . strlen($downloadResult['body']));
                        if (file_exists($localFilePath)) @unlink($localFilePath); // Clean up partial file
                    }
                } else {
                    script_log("  ОШИБКА открытия лок. файла '" . basename($localFilePath) . "' для записи.");
                }
            } else {
                // HTTP 200 but body is empty or false, treat as error for download
                script_log("  ОШИБКА: HTTP 200 для ID '" . $fileIdToDownload . "', но тело ответа пустое или недействительное.");
            }
        } else {
            // executeCurl indicated failure (non-200 HTTP code or cURL error)
            $logMessage = "  ОШИБКА скачивания ID '" . $fileIdToDownload . "'. HTTP код: " . $downloadResult['httpCode'];
            if ($downloadResult['curlError']) {
                $logMessage .= ". Ошибка cURL: " . $downloadResult['curlError'];
            } else {
                $logMessage .= ". Тело получено: " . ($downloadResult['body'] ? 'да, длина ' . strlen($downloadResult['body']) : 'нет/пусто');
            }
            script_log($logMessage);
        }
        
        if ($fileWrittenSuccessfully) {
            clearstatcache(true, $currentFilePathAfterDownload); 
            if (!file_exists($currentFilePathAfterDownload) || filesize($currentFilePathAfterDownload) == 0) {
                script_log("  ОШИБКА: Файл '" . basename($currentFilePathAfterDownload) . "' (ID: ".$fileIdToDownload.") не существует или пустой ПОСЛЕ предполагаемой успешной записи (HTTP 200). Размер: ".(file_exists($currentFilePathAfterDownload) ? filesize($currentFilePathAfterDownload) : 'не существует')." байт.");
                if (file_exists($currentFilePathAfterDownload)) @unlink($currentFilePathAfterDownload); // Should not happen if fwrite was ok
                $errorCount++;
            } else {
                $isAudio = false; $expectedContentTypes = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'application/octet-stream', 'audio/x-gsm'];
                $contentTypeToCheck = strtolower(explode(';', $downloadResult['contentType'] ?? '')[0]);
                if ($contentTypeToCheck && in_array($contentTypeToCheck, $expectedContentTypes)) $isAudio = true;
                
                if (!empty($downloadResponseHeaders) && preg_match('/Content-Disposition:.*?filename="?([^"]+)"?/i', $downloadResponseHeaders, $matchesDisp)) {
                    $filenameFromHeader = trim($matchesDisp[1], "\"' \r\n\t");
                    if (!empty($filenameFromHeader) && basename($filenameFromHeader) !== basename($currentFilePathAfterDownload)) {
                        $potentialNewPath = $recordingsDir . DIRECTORY_SEPARATOR . basename($filenameFromHeader);
                        if (!file_exists($potentialNewPath)) {
                            if (rename($currentFilePathAfterDownload, $potentialNewPath)) {
                                script_log("  Файл переименован в: '" . basename($potentialNewPath) . "' согласно Content-Disposition.");
                                $currentFilePathAfterDownload = $potentialNewPath;
                            } else { 
                                script_log("  ВНИМАНИЕ: Не удалось переименовать '" . basename($currentFilePathAfterDownload) . "' в '" . basename($potentialNewPath) . "'. Ошибка: " . (error_get_last()['message'] ?? 'N/A'));
                            }
                        } else if ($potentialNewPath !== $currentFilePathAfterDownload) {
                            script_log("  ВНИМАНИЕ: Файл '" . basename($potentialNewPath) . "' для переименования уже существует. Используется оригинальное имя.");
                        }
                    }
                }
                clearstatcache(true, $currentFilePathAfterDownload); 
                if ($isAudio || filesize($currentFilePathAfterDownload) > 1024) { // Check actual file size after rename
                    script_log("  УСПЕХ: ID '" . $fileIdToDownload . "'. Тип: " . ($downloadResult['contentType'] ?? 'N/A') . ". Сохранен как: " . basename($currentFilePathAfterDownload) . " (" . filesize($currentFilePathAfterDownload) . " байт).");
                    $downloadCount++;
                } else {
                    script_log("  ВНИМАНИЕ: ID '" . $fileIdToDownload . "' записан (HTTP 200), но Тип ('" . ($downloadResult['contentType'] ?? 'N/A') . "') не аудио ИЛИ размер мал (" . filesize($currentFilePathAfterDownload) . " байт). Считаем ошибкой.");
                    if (file_exists($currentFilePathAfterDownload)) @unlink($currentFilePathAfterDownload);
                    $errorCount++;
                }
            }
        } else { // fileWrittenSuccessfully is false
            // Error already logged by previous blocks. Increment error count.
            // Ensure file is cleaned up if it exists (e.g. empty file from failed fopen or partial write)
            if (file_exists($localFilePath)) {
                 @unlink($localFilePath);
            }
            $errorCount++;
        }
        
        file_put_contents($scannedCallsFile, $fileIdToDownload . PHP_EOL, FILE_APPEND | LOCK_EX);
        $processedCallIds[$fileIdToDownload] = true;

        if ($filesProcessedThisRun < $maxFilesPerRun && $totalUniqueFiles > 20) {
            usleep(500000); 
        }
    }
    @fclose($csvFileHandle); // Добавляем @ для подавления ошибки, если он уже был закрыт или невалиден
    
    script_log("\n--- Статистика обработки файлов за этот запуск ---");
    script_log("Обработано новых уникальных ID для скачивания: " . $filesProcessedThisRun);
    script_log("Успешно скачано: " . $downloadCount);
    script_log("Пропущено (уже существовали локально): " . $skippedExistingCount);
    script_log("Пропущено (уже были в " . basename($scannedCallsFile) . " до начала этого цикла): " . $skippedProcessedPreRunCount);
    script_log("Пропущено фильтром (статус/длительность): " . $skippedByFilterCount);
    script_log("Ошибок при скачивании (включая пустые файлы при HTTP 200): " . $errorCount);
    
    $remainingInCsvNotYetScanned = 0;
    if (file_exists($actualCsvFilename)) { // Проверяем, что CSV файл все еще доступен
        $tempCsvHandleForRemaining = fopen($actualCsvFilename, "r");
        if ($tempCsvHandleForRemaining) {
            fgetcsv($tempCsvHandleForRemaining); 
            while (($tempRowData = fgetcsv($tempCsvHandleForRemaining)) !== false) {
                if (isset($tempRowData[$idColumnIndex])) {
                    $currentIdInLoop = trim($tempRowData[$idColumnIndex]); 
                    if (!empty($currentIdInLoop) && !isset($processedCallIds[$currentIdInLoop])) {
                        $remainingInCsvNotYetScanned++;
                    }
                }
            }
            @fclose($tempCsvHandleForRemaining);
        }
    }
    script_log("Приблизительно осталось необработанных ID в текущем CSV (еще не в " . basename($scannedCallsFile)."): " . $remainingInCsvNotYetScanned);

} elseif (!$loggedIn) { 
    script_log("Вход не выполнен, скачивание записей пропущено.");
} elseif (!file_exists($actualCsvFilename)) { 
    script_log("CSV файл '" . basename($actualCsvFilename) . "' не найден, скачивание записей пропущено."); 
}

script_log("Скрипт завершил работу.");
// if (ob_get_level() > 0) ob_end_flush(); // Если раскомментировали ob_start()
?>