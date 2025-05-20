<?php

// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Include Composer autoloader
require_once __DIR__ . '/vendor/autoload.php';

// Set appropriate headers
header('Content-Type: text/plain; charset=UTF-8');

// --- Lock File Configuration ---
if (!defined('WORKER_LOCK_FILE')) {
    define('WORKER_LOCK_FILE', __DIR__ . '/transcribe_worker.lock');
}
// --- End Lock File Configuration ---

// --- Attempt to acquire lock ---
$lockFileHandle = fopen(WORKER_LOCK_FILE, 'c');
if (!$lockFileHandle) {
    echo "ERROR: Cannot open/create lock file: " . WORKER_LOCK_FILE . PHP_EOL;
    exit(1);
}

if (!flock($lockFileHandle, LOCK_EX | LOCK_NB)) {
    echo "INFO: Transcribe worker is already running. Exiting." . PHP_EOL;
    fclose($lockFileHandle);
    exit(0);
}
// Lock acquired. Register shutdown function to release lock and unlink file.
register_shutdown_function(function() use ($lockFileHandle) {
    if ($lockFileHandle) {
        flock($lockFileHandle, LOCK_UN);
        fclose($lockFileHandle);
        @unlink(WORKER_LOCK_FILE);
    }
});
// --- End Lock File Logic ---

// --- Configuration ---
$maxToProcessPerRun = 5;
$language = 'ru';
$analyzeCallType = true;
$analysisModel = 'gpt-4.1-мини'; // Убедитесь, что имя модели корректно
$analysisSystemPrompt = "Ты — ассистент, который помогает классифицировать содержание телефонных звонков. Твоя задача — прочитать транскрипцию звонка и определить его основную цель или категорию. Это медицинские центры. Отвечай кратко, только категорией.";
$analysisUserPromptTemplate = "Проанализируй следующую транскрипцию телефонного разговора и определи его тип. Возможные типы: 'Жалоба', 'Успешная запись на прием/услугу', 'Неуспешная запись на прием/услугу', 'Консультация/Вопрос', 'Ошиблись номером', 'Спам/Нецелевой', 'Другое'. Если не уверен, выбери 'Другое'.\n\nТранскрипция:\n";
// --- End Configuration ---

// Load .env variables
try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
    $dotenv->load();
} catch (Exception $e) {
    echo ('Could not load .env file: ' . $e->getMessage() . PHP_EOL);
    exit(1); // Exiting as API key is crucial
}

$openaiApiKey = $_ENV['OPENAI_API_KEY'] ?? null;
if (!$openaiApiKey) {
    echo ('OPENAI_API_KEY is not set in your .env file.' . PHP_EOL);
    exit(1);
}

$secretKeyForCdrExport = $_ENV['SECRET_KEY'] ?? null; // Fetch secret key for CDR export
if (!$secretKeyForCdrExport) {
    echo ('SECRET_KEY is not set in your .env file for CDR export.' . PHP_EOL);
    exit(1);
}

$client = OpenAI::client($openaiApiKey);

// $callsJsonPath = __DIR__ . '/calls.json'; // Removed: No longer reading from local file
$cdrExportUrl = 'https://sip.qazna24.kz/admin/asterisk_cdr_export/?action=get_cdr_stats&secretKey=' . urlencode($secretKeyForCdrExport); // Added secretKey

$transcriptionsDir = __DIR__ . '/transcriptions';
$analysisDir = __DIR__ . '/analysis';
$tempAudioDir = __DIR__ . '/temp_audio';

foreach ([$transcriptionsDir, $analysisDir, $tempAudioDir] as $dir) {
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true)) {
            echo ("Failed to create directory: {$dir}" . PHP_EOL);
            exit(1);
        }
    } elseif (!is_writable($dir)) {
        echo ("Directory is not writable: {$dir}" . PHP_EOL);
        exit(1);
    }
}

// Fetch data from URL instead of local file
echo "INFO: Fetching call data from {$cdrExportUrl}..." . PHP_EOL;
$ch = curl_init($cdrExportUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Consider security implications
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // Consider security implications
$jsonContent = curl_exec($ch);
$curlError = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($curlError) {
    echo "ERROR: cURL error fetching call data from {$cdrExportUrl}: " . $curlError . PHP_EOL;
    exit(1);
}
if ($httpCode != 200) {
    echo "ERROR: HTTP error {$httpCode} fetching call data from {$cdrExportUrl}. Response: " . substr($jsonContent, 0, 500) . PHP_EOL;
    exit(1);
}
if ($jsonContent === false || empty($jsonContent)) {
    echo "ERROR: Failed to fetch or empty response from {$cdrExportUrl}." . PHP_EOL;
    exit(1);
}

echo "INFO: Call data fetched successfully." . PHP_EOL;
$data = json_decode($jsonContent, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    echo "ERROR: Decoding JSON response from {$cdrExportUrl}: " . json_last_error_msg() . PHP_EOL;
    exit(1);
}

if (!isset($data['processed_logical_sessions']) || !is_array($data['processed_logical_sessions'])) {
    echo "ERROR: Fetched data from {$cdrExportUrl} has invalid format or 'processed_logical_sessions' is missing/not an array." . PHP_EOL;
    exit(1);
}

$allCalls = $data['processed_logical_sessions'];

if (empty($allCalls)) {
    echo "INFO: No calls to process from {$cdrExportUrl}. Exiting." . PHP_EOL;
    exit(0);
}

$processedCount = 0;
$skippedCount = 0;

echo "Starting transcription process (" . date('Y-m-d H:i:s') . ")..." . PHP_EOL;
echo "Max files to process this run: {$maxToProcessPerRun}" . PHP_EOL;

foreach ($allCalls as $call) {
    if ($processedCount >= $maxToProcessPerRun) {
        echo "Reached processing limit for this run." . PHP_EOL;
        break;
    }

    $uniqueId = null; // Initialize for safety in catch block
    try {
        $uniqueId = $call['session_master_id'] ?? null;
        if (!$uniqueId) {
            echo " ERROR: session_master_id not found for a call. Skipping." . PHP_EOL;
            $skippedCount++;
            continue;
        }

        // Используем 'recording_file' из нового формата
        $recordingFilenameFromCall = $call['recording_file'] ?? null;
        $downloadUrl = $call['download_url'] ?? null;

        if (!$downloadUrl && !$recordingFilenameFromCall) {
            echo " ERROR: No download_url or recording_file for call ID: {$uniqueId}. Skipping." . PHP_EOL;
            $skippedCount++;
            continue;
        }
        // Если нет URL для скачивания, но есть имя файла, и мы не знаем, как его получить - пропускаем.
        // В данном случае download_url является приоритетным для получения аудио.
        if (!$downloadUrl) {
            echo " ERROR: No download_url for call ID: {$uniqueId} (recording_file: {$recordingFilenameFromCall}). Skipping." . PHP_EOL;
            $skippedCount++;
            continue;
        }


        $transcriptionFilePath = $transcriptionsDir . '/' . $uniqueId . '.txt';
        $analysisFilePath = $analysisDir . '/' . $uniqueId . '.txt';

        $baseFilenameForTemp = $uniqueId . '.wav'; // Default
        if ($downloadUrl) {
            parse_str(parse_url($downloadUrl, PHP_URL_QUERY), $queryParams);
            if (isset($queryParams['file']) && !empty($queryParams['file'])) {
                $filenameFromUrl = basename(urldecode($queryParams['file']));
                // Используем имя файла из URL, если оно есть, и добавляем префикс ID сессии для уникальности во временной папке
                if (strpos($filenameFromUrl, '.') !== false) {
                    $baseFilenameForTemp = $uniqueId . '_' . $filenameFromUrl;
                } else {
                    $baseFilenameForTemp = $uniqueId . '_' . $filenameFromUrl . '.wav';
                }
            }
        } elseif (!empty($recordingFilenameFromCall)) { // Этот блок теперь менее вероятен если downloadUrl обязателен
            $filenameFromCallData = basename($recordingFilenameFromCall);
            if (strpos($filenameFromCallData, '.') !== false) {
                $baseFilenameForTemp = $uniqueId . '_' . $filenameFromCallData;
            } else {
                $baseFilenameForTemp = $uniqueId . '_' . $filenameFromCallData . '.wav';
            }
        }
        
        $tempAudioFilename = $baseFilenameForTemp;
        $tempAudioFilePath = $tempAudioDir . '/' . $tempAudioFilename;
        $displayNameForLog = $recordingFilenameFromCall ?? ($downloadUrl ?? $uniqueId);

        if (file_exists($transcriptionFilePath) && (!$analyzeCallType || file_exists($analysisFilePath))) {
            // echo " INFO: Already processed: {$uniqueId}. Skipping." . PHP_EOL; // Можно раскомментировать для детального лога
            continue;
        }

        echo "INFO: Processing call ID: {$uniqueId}, File: {$displayNameForLog}" . PHP_EOL;

        echo "  Downloading {$downloadUrl}..." . PHP_EOL;
        
        $ch = curl_init($downloadUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // На случай редиректов
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Внимание: небезопасно для production
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // Внимание: небезопасно для production
        $audioContent = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($curlError) {
            echo "  ERROR: cURL error downloading audio for {$uniqueId}: " . $curlError . PHP_EOL;
            $skippedCount++;
            continue;
        }
        if ($httpCode != 200) {
            echo "  ERROR: HTTP error {$httpCode} downloading audio for {$uniqueId}. Response: " . substr($audioContent, 0, 200) . PHP_EOL;
            $skippedCount++;
            continue;
        }
        if ($audioContent === false || empty($audioContent)) {
            echo "  ERROR: Failed to download or empty audio content for {$uniqueId}." . PHP_EOL;
            $skippedCount++;
            continue;
        }

        if (file_put_contents($tempAudioFilePath, $audioContent) === false) {
            echo "  ERROR: Failed to save downloaded audio to {$tempAudioFilePath}." . PHP_EOL;
            $skippedCount++;
            continue;
        }
        echo "  Downloaded successfully to {$tempAudioFilePath}." . PHP_EOL;

        if (filesize($tempAudioFilePath) === 0) {
            echo "  ERROR: Downloaded audio file {$tempAudioFilePath} is empty. Skipping." . PHP_EOL;
            unlink($tempAudioFilePath);
            $skippedCount++;
            continue;
        }
        
        $transcribedText = null;
        // Транскрипция
        if (file_exists($transcriptionFilePath)) {
            echo "  INFO: Transcription file already exists. Loading: {$transcriptionFilePath}" . PHP_EOL;
            $transcribedText = file_get_contents($transcriptionFilePath);
            if ($transcribedText === false) {
                echo "  ERROR: Failed to read existing transcription {$transcriptionFilePath}." . PHP_EOL;
                $transcribedText = null;
            }
        }

        if ($transcribedText === null || empty(trim($transcribedText)) || trim($transcribedText) === "[Транскрипция недоступна или аудио было тихим]") {
            echo "  Transcribing {$tempAudioFilePath}..." . PHP_EOL;
            try {
                $response = $client->audio()->transcribe([
                    'model' => 'whisper-1',
                    'file' => fopen($tempAudioFilePath, 'r'),
                    'language' => $language,
                ]);
                $transcribedText = $response->text;

                if (!empty(trim($transcribedText))) {
                    if (file_put_contents($transcriptionFilePath, $transcribedText) === false) {
                        echo "  ERROR: Failed to save transcription to {$transcriptionFilePath}." . PHP_EOL;
                    } else {
                        echo "  Transcription saved to {$transcriptionFilePath}" . PHP_EOL;
                    }
                } else {
                    echo "  WARN: Received empty transcription for {$displayNameForLog}. Saving placeholder." . PHP_EOL;
                    $transcribedText = "[Транскрипция недоступна или аудио было тихим]";
                    file_put_contents($transcriptionFilePath, $transcribedText);
                }
            } catch (OpenAI\Exceptions\ErrorException $e) { // Более конкретный тип исключения для OpenAI
                echo "  ERROR: OpenAI API Error during transcription for {$displayNameForLog}: " . $e->getMessage() . PHP_EOL;
                $skippedCount++;
                if (file_exists($tempAudioFilePath)) unlink($tempAudioFilePath);
                continue; // Пропустить этот звонок
            } catch (Exception $e) { // Общее исключение
                echo "  ERROR: Unexpected error transcribing {$displayNameForLog}: " . get_class($e) . " - " . $e->getMessage() . PHP_EOL;
                $skippedCount++;
                if (file_exists($tempAudioFilePath)) unlink($tempAudioFilePath);
                continue; // Пропустить этот звонок
            }
        }

        // Анализ типа звонка
        if ($analyzeCallType && !empty(trim($transcribedText)) && trim($transcribedText) !== "[Транскрипция недоступна или аудио было тихим]") {
            if (file_exists($analysisFilePath)) {
                echo "  INFO: Analysis file already exists. Skipping analysis: {$analysisFilePath}" . PHP_EOL;
            } else {
                echo "  Analyzing call type for {$uniqueId}..." . PHP_EOL;
                $userPrompt = $analysisUserPromptTemplate . $transcribedText;
                try {
                    $analysisResponse = $client->chat()->create([
                        'model' => $analysisModel,
                        'messages' => [
                            ['role' => 'system', 'content' => $analysisSystemPrompt],
                            ['role' => 'user', 'content' => $userPrompt]
                        ],
                        'temperature' => 0.3,
                    ]);
                    $analyzedCallType = trim($analysisResponse->choices[0]->message->content);

                    if (!empty($analyzedCallType)) {
                        if (file_put_contents($analysisFilePath, $analyzedCallType) === false) {
                            echo "  ERROR: Failed to save analysis to {$analysisFilePath}." . PHP_EOL;
                        } else {
                            echo "  Analysis saved to {$analysisFilePath}: {$analyzedCallType}" . PHP_EOL;
                        }
                    } else {
                        echo "  WARN: Received empty analysis for {$displayNameForLog}." . PHP_EOL;
                        file_put_contents($analysisFilePath, "Другое (пустой ответ)");
                    }
                } catch (OpenAI\Exceptions\ErrorException $e) {
                    echo "  ERROR: OpenAI API Error during analysis for {$displayNameForLog}: " . $e->getMessage() . PHP_EOL;
                    file_put_contents($analysisFilePath, "Ошибка анализа: " . $e->getMessage());
                } catch (Exception $e) {
                    echo "  ERROR: Unexpected error during analysis for {$displayNameForLog}: " . get_class($e) . " - " . $e->getMessage() . PHP_EOL;
                    file_put_contents($analysisFilePath, "Ошибка анализа (неожиданная): " . $e->getMessage());
                }
            }
        } elseif ($analyzeCallType && (empty(trim($transcribedText)) || trim($transcribedText) === "[Транскрипция недоступна или аудио было тихим]")) {
            echo "  INFO: Skipping analysis for {$uniqueId} due to empty/placeholder transcription." . PHP_EOL;
            if (!file_exists($analysisFilePath)) {
                file_put_contents($analysisFilePath, "Нет данных для анализа");
            }
        }
        
        $processedCount++;

    } catch (Exception $e) { // Общий обработчик ошибок для цикла по звонку
        $currentCallIdForError = $uniqueId ?? (isset($call['session_master_id']) ? $call['session_master_id'] : 'unknown_call_in_loop');
        echo "  ERROR: Processing call {$currentCallIdForError} failed globally: " . $e->getMessage() . PHP_EOL;
        // Записываем stack trace для более детальной отладки, если нужно
        // error_log("Stack trace for call {$currentCallIdForError}: " . $e->getTraceAsString());
        $skippedCount++;
    } finally {
        // Очистка временного аудиофайла
        if (isset($tempAudioFilePath) && file_exists($tempAudioFilePath)) {
            unlink($tempAudioFilePath);
        }
    }
}

echo "Transcription process finished. Processed/Updated: {$processedCount}. Skipped/Errors: {$skippedCount}." . PHP_EOL;

?>