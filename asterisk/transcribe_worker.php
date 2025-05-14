<?php

// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

require __DIR__ . '/vendor/autoload.php';

// --- Lock File Configuration ---
define('WORKER_LOCK_FILE', __DIR__ . '/transcribe_worker.lock');
// --- End Lock File Configuration ---

// --- Attempt to acquire lock ---
$lockFileHandle = fopen(WORKER_LOCK_FILE, 'c'); // 'c' mode: create if not exist, pointer at start.
if (!$lockFileHandle) {
    echo "ERROR: Cannot open/create lock file: " . WORKER_LOCK_FILE . PHP_EOL;
    exit(1);
}

if (!flock($lockFileHandle, LOCK_EX | LOCK_NB)) {
    echo "INFO: Transcribe worker is already running or lock file is held. Exiting." . PHP_EOL;
    fclose($lockFileHandle);
    exit(0);
}
// Lock acquired. Register shutdown function to release lock and unlink file.
register_shutdown_function(function() use ($lockFileHandle) {
    if ($lockFileHandle) {
        flock($lockFileHandle, LOCK_UN); // Release the lock
        fclose($lockFileHandle);        // Close the file handle
        @unlink(WORKER_LOCK_FILE);      // Attempt to delete the lock file
    }
});
// --- End Lock File Logic ---

// --- Configuration ---
$maxToProcessPerRun = 5; // Number of files to process in one execution
$language = 'ru';        // Language code for transcription (e.g., 'ru' for Russian)
$analyzeCallType = true; // Set to true to enable call type analysis
$analysisModel = 'gpt-4.1-mini'; // Model for call type analysis
$analysisSystemPrompt = "Ты — ассистент, который помогает классифицировать содержание телефонных звонков. Твоя задача — прочитать транскрипцию звонка и определить его основную цель или категорию. Это медицинские центры. Отвечай кратко, только категорией.";
$analysisUserPromptTemplate = "Проанализируй следующую транскрипцию телефонного разговора и определи его тип. Возможные типы: 'Жалоба', 'Успешная запись на прием/услугу', 'Неуспешная запись на прием/услугу', 'Консультация/Вопрос', 'Ошиблись номером', 'Спам/Нецелевой', 'Другое'. Если не уверен, выбери 'Другое'.\n\nТранскрипция:\n{transcription}";
// --- End Configuration ---

// Load .env variables
try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
    $dotenv->load();
} catch (Exception $e) {
    die('Could not load .env file: ' . $e->getMessage() . PHP_EOL);
}

$openaiApiKey = $_ENV['OPENAI_API_KEY'] ?? null;
if (!$openaiApiKey) {
    die('OPENAI_API_KEY is not set in your .env file.' . PHP_EOL);
}

$client = OpenAI::client($openaiApiKey);

$callsJsonPath = __DIR__ . '/calls_raw.json'; // Corrected path
$transcriptionsDir = __DIR__ . '/transcriptions'; // Directory to store .txt transcriptions
$analysisDir = __DIR__ . '/analysis';         // Directory to store .txt analysis results
$tempAudioDir = __DIR__ . '/temp_audio';     // Directory for temporary audio downloads

// Ensure directories exist and are writable
foreach ([$transcriptionsDir, $analysisDir, $tempAudioDir] as $dir) {
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true)) {
            die("Failed to create directory: {$dir}" . PHP_EOL);
        }
    } elseif (!is_writable($dir)) {
        die("Directory is not writable: {$dir}" . PHP_EOL);
    }
}

if (!file_exists($callsJsonPath)) {
    die("calls.json not found at {$callsJsonPath}." . PHP_EOL);
}

$jsonContent = file_get_contents($callsJsonPath);
$data = json_decode($jsonContent, true);

if (json_last_error() !== JSON_ERROR_NONE || !isset($data['processed_logical_sessions']) || !is_array($data['processed_logical_sessions'])) {
    die("Error decoding {$callsJsonPath} or invalid format." . PHP_EOL);
}

$allCalls = $data['processed_logical_sessions'];
$processedCount = 0;
$skippedCount = 0;

echo "Starting transcription process (" . date('Y-m-d H:i:s') . ")..." . PHP_EOL;
echo "Max files to process this run: {$maxToProcessPerRun}" . PHP_EOL;

foreach ($allCalls as $call) {
    if ($processedCount >= $maxToProcessPerRun) {
        echo "Reached processing limit for this run." . PHP_EOL;
        break;
    }

    try {
        $uniqueId = $call['session_master_id'] ?? null;
        if (!$uniqueId) {
            echo "  ERROR: session_master_id not found for a call. Skipping." . PHP_EOL;
            $skippedCount++; // Increment skipped count
            continue;
        }

        $recordingFilenameFromCall = $call['recording_filename'] ?? null;
        $downloadUrl = $call['download_url'] ?? null;
        $transcriptionFilePath = $transcriptionsDir . '/' . $uniqueId . '.txt';
        $analysisFilePath = $analysisDir . '/' . $uniqueId . '.txt';

        // Determine the base filename for the temporary audio file, ensuring it has an extension.
        $baseFilenameForTemp = $uniqueId . '.wav'; // Default filename with .wav extension

        if ($downloadUrl) {
            parse_str(parse_url($downloadUrl, PHP_URL_QUERY), $queryParams);
            if (isset($queryParams['file']) && !empty($queryParams['file'])) {
                $filenameFromUrl = basename(urldecode($queryParams['file']));
                if (strpos($filenameFromUrl, '.') !== false) {
                    $baseFilenameForTemp = $uniqueId . '_' . $filenameFromUrl;
                } else {
                    // If filename from URL has no extension, append .wav
                    $baseFilenameForTemp = $uniqueId . '_' . $filenameFromUrl . '.wav';
                }
            }
        } elseif (!empty($recordingFilenameFromCall)) {
            // Fallback to recording_filename if download URL didn't yield a specific filename
            $filenameFromCallData = basename($recordingFilenameFromCall);
            if (strpos($filenameFromCallData, '.') !== false) {
                $baseFilenameForTemp = $uniqueId . '_' . $filenameFromCallData;
            } else {
                $baseFilenameForTemp = $uniqueId . '_' . $filenameFromCallData . '.wav';
            }
        }
        
        $tempAudioFilename = $baseFilenameForTemp;
        $tempAudioFilePath = $tempAudioDir . '/' . $tempAudioFilename;

        // For display purposes in logs
        $displayNameForLog = $recordingFilenameFromCall ?? ($downloadUrl ?? $uniqueId);


        if (file_exists($transcriptionFilePath) && (!$analyzeCallType || file_exists($analysisFilePath))) {
            continue;
        }

        echo "INFO: Processing call ID: {$uniqueId}, File: {$displayNameForLog}" . PHP_EOL;

        // 1. Download audio file
        echo "  Downloading {$downloadUrl}..." . PHP_EOL;
        
        $ch = curl_init($downloadUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Skip SSL verification - use with caution!
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // Also skip hostname verification
        $audioContent = curl_exec($ch);

        if (curl_errno($ch)) {
            echo "  ERROR: cURL error downloading audio for {$uniqueId} from {$downloadUrl}: " . curl_error($ch) . PHP_EOL;
            $skippedCount++;
            continue;
        }

        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($httpCode != 200) {
            echo "  ERROR: HTTP error downloading audio for {$uniqueId} from {$downloadUrl}: " . $httpCode . " - " . $audioContent . PHP_EOL;
            $skippedCount++;
            continue;
        }

        curl_close($ch);

        if ($audioContent === false) {
            echo "  ERROR: Failed to download audio for {$uniqueId} from {$downloadUrl}. Check URL and network." . PHP_EOL;
            $skippedCount++;
            continue;
        }

        if (file_put_contents($tempAudioFilePath, $audioContent) === false) {
            echo "  ERROR: Failed to save downloaded audio to {$tempAudioFilePath} for {$uniqueId}." . PHP_EOL;
            $skippedCount++;
            continue;
        }
        echo "  Downloaded successfully to {$tempAudioFilePath}." . PHP_EOL;

        // 2. Transcribe audio
        if (!file_exists($tempAudioFilePath) || filesize($tempAudioFilePath) === 0) {
            echo "  ERROR: Downloaded audio file {$tempAudioFilePath} is missing or empty. Skipping transcription." . PHP_EOL;
            if (file_exists($tempAudioFilePath)) {
                unlink($tempAudioFilePath);
            }
            $skippedCount++;
            continue;
        }

        echo "  Transcribing {$tempAudioFilePath}..." . PHP_EOL;
        $transcribedText = null;
        try {
            // Check if transcription already exists, if so, load it
            if (file_exists($transcriptionFilePath)) {
                echo "  INFO: Transcription file already exists. Loading for analysis: {$transcriptionFilePath}" . PHP_EOL;
                $transcribedText = file_get_contents($transcriptionFilePath);
                if ($transcribedText === false) {
                    echo "  ERROR: Failed to read existing transcription file {$transcriptionFilePath}." . PHP_EOL;
                    $transcribedText = null; // Ensure it's null if read failed
                }
            }
            
            if ($transcribedText === null || empty(trim($transcribedText)) || trim($transcribedText) === "[No transcription available or audio was silent]") {
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
                    file_put_contents($transcriptionFilePath, "[No transcription available or audio was silent]");
                    $transcribedText = "[No transcription available or audio was silent]"; // Ensure this is set for analysis step
                }
            }

            // 2.5 Analyze call type if enabled and transcription is available
            if ($analyzeCallType && !empty(trim($transcribedText)) && trim($transcribedText) !== "[No transcription available or audio was silent]") {
                if (file_exists($analysisFilePath)) {
                    echo "  INFO: Analysis file already exists. Skipping analysis: {$analysisFilePath}" . PHP_EOL;
                } else {
                    echo "  Analyzing call type for {$uniqueId}..." . PHP_EOL;
                    $userPrompt = str_replace('{transcription}', $transcribedText, $analysisUserPromptTemplate);
                    try {
                        $analysisResponse = $client->chat()->create([ // Corrected method call
                            'model' => $analysisModel,
                            'messages' => [
                                ['role' => 'system', 'content' => $analysisSystemPrompt],
                                ['role' => 'user', 'content' => $userPrompt]
                            ],
                            'temperature' => 0.3, // Lower temperature for more deterministic category
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
                            file_put_contents($analysisFilePath, "Другое (пустой ответ)"); // Save placeholder
                        }
                    } catch (OpenAI\Exceptions\ErrorException $e) {
                        echo "  ERROR: OpenAI API Error during analysis for {$displayNameForLog}: " . $e->getMessage() . PHP_EOL;
                        file_put_contents($analysisFilePath, "Ошибка анализа: " . $e->getMessage());
                    } catch (Exception $e) {
                        echo "  ERROR: Unexpected error during analysis for {$displayNameForLog}: " . get_class($e) . " - " . $e->getMessage() . PHP_EOL;
                        file_put_contents($analysisFilePath, "Ошибка анализа (неожиданная): " . $e->getMessage());
                    }
                }
            } elseif ($analyzeCallType && (empty(trim($transcribedText)) || trim($transcribedText) === "[No transcription available or audio was silent]")) {
                echo "  INFO: Skipping analysis for {$uniqueId} due to empty or placeholder transcription." . PHP_EOL;
                if (!file_exists($analysisFilePath)) {
                    file_put_contents($analysisFilePath, "Нет данных для анализа");
                }
            }
            
            $processedCount++;

        } catch (OpenAI\Exceptions\ErrorException $e) {
            echo "  ERROR: OpenAI API Error for {$displayNameForLog}: " . $e->getMessage() . PHP_EOL;
            $skippedCount++;
        } catch (Exception $e) {
            echo "  ERROR: Unexpected error transcribing {$displayNameForLog}: " . get_class($e) . " - " . $e->getMessage() . PHP_EOL;
            $skippedCount++;
        } finally {
            // 3. Clean up downloaded audio file
            if (file_exists($tempAudioFilePath)) {
                unlink($tempAudioFilePath);
            }
        }
        
    } catch (Exception $e) {
        $currentCallIdForError = $uniqueId ?? (isset($call['session_master_id']) ? $call['session_master_id'] : 'unknown');
        echo "  ERROR: Processing call {$currentCallIdForError} failed: " . $e->getMessage() . PHP_EOL;
        $skippedCount++; // Ensure skipped count is incremented for general errors in the outer try-catch
    }
}

echo "Transcription process finished. Newly transcribed: {$processedCount}. Skipped/Errors: {$skippedCount}." . PHP_EOL;

?>