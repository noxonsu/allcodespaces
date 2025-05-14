<?php

// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

require __DIR__ . '/vendor/autoload.php';

// --- Configuration ---
$maxToProcessPerRun = 5; // Number of files to process in one execution
$language = 'ru';        // Language code for transcription (e.g., 'ru' for Russian)
$analyzeCallType = true; // Set to true to enable call type analysis
$analysisModel = 'gpt-4.1-mini'; // Model for call type analysis
$analysisSystemPrompt = "Ты — ассистент, который помогает классифицировать содержание телефонных звонков. Твоя задача — прочитать транскрипцию звонка и определить его основную цель или категорию. Это медицинские центры. Отвечай кратко, только категорией.";
$analysisUserPromptTemplate = "Проанализируй следующую транскрипцию телефонного разговора и определи его тип. Возможные типы: 'Жалоба', 'Запись на прием/услугу', 'Консультация/Вопрос', 'Ошиблись номером', 'Спам/Нецелевой', 'Другое'. Если не уверен, выбери 'Другое'.\n\nТранскрипция:\n{transcription}";
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

$callsJsonPath = __DIR__ . '/calls.json';
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

if (json_last_error() !== JSON_ERROR_NONE || !isset($data['calls']) || !is_array($data['calls'])) {
    die("Error decoding calls.json or invalid format." . PHP_EOL);
}

$allCalls = $data['calls'];
$processedCount = 0;
$skippedCount = 0;

echo "Starting transcription process (" . date('Y-m-d H:i:s') . ")..." . PHP_EOL;
echo "Max files to process this run: {$maxToProcessPerRun}" . PHP_EOL;

foreach ($allCalls as $call) {
    if ($processedCount >= $maxToProcessPerRun) {
        echo "Reached processing limit for this run." . PHP_EOL;
        break;
    }

    if (!isset($call['uniqueid'], $call['recording_filename'], $call['download_url'])) {
        echo "Skipping call due to missing uniqueid, recording_filename, or download_url." . PHP_EOL;
        $skippedCount++;
        continue;
    }

    $uniqueId = $call['uniqueid'];
    $originalRecordingFilename = $call['recording_filename']; // Original filename from JSON
    $downloadUrl = $call['download_url'];
    $transcriptionFilePath = $transcriptionsDir . '/' . $uniqueId . '.txt';
    $analysisFilePath = $analysisDir . '/' . $uniqueId . '.txt';

    // Use a temporary filename based on uniqueid to avoid conflicts if original names are not unique
    $tempAudioFilename = $uniqueId . '_' . basename($originalRecordingFilename);
    $tempAudioFilePath = $tempAudioDir . '/' . $tempAudioFilename;


    if (file_exists($transcriptionFilePath) && (!$analyzeCallType || file_exists($analysisFilePath))) {
        // Skip if transcription exists AND (analysis is disabled OR analysis file also exists)
        // echo "INFO: Transcription and/or analysis already exists for {$uniqueId}. Skipping." . PHP_EOL;
        continue;
    }

    echo "INFO: Processing call ID: {$uniqueId}, File: {$originalRecordingFilename}" . PHP_EOL;

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
                // 'response_format' => 'text', // Default is json, which includes 'text'
            ]);
            $transcribedText = $response->text;

            if (!empty(trim($transcribedText))) {
                if (file_put_contents($transcriptionFilePath, $transcribedText) === false) {
                    echo "  ERROR: Failed to save transcription to {$transcriptionFilePath}." . PHP_EOL;
                } else {
                    echo "  Transcription saved to {$transcriptionFilePath}" . PHP_EOL;
                }
            } else {
                echo "  WARN: Received empty transcription for {$originalRecordingFilename}. Saving placeholder." . PHP_EOL;
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
                    $analysisResponse = $client->chat()->completions()->create([
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
                        echo "  WARN: Received empty analysis for {$originalRecordingFilename}." . PHP_EOL;
                        file_put_contents($analysisFilePath, "Другое (пустой ответ)"); // Save placeholder
                    }
                } catch (OpenAI\Exceptions\ErrorException $e) {
                    echo "  ERROR: OpenAI API Error during analysis for {$originalRecordingFilename}: " . $e->getMessage() . PHP_EOL;
                    // Save error to analysis file to prevent re-processing
                     file_put_contents($analysisFilePath, "Ошибка анализа: " . $e->getMessage());
                } catch (Exception $e) {
                    echo "  ERROR: Unexpected error during analysis for {$originalRecordingFilename}: " . get_class($e) . " - " . $e->getMessage() . PHP_EOL;
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
        echo "  ERROR: OpenAI API Error for {$originalRecordingFilename}: " . $e->getMessage() . PHP_EOL;
        // Consider logging more details: $e->getHttpStatusCode(), $e->getError()
        $skippedCount++;
    } catch (Exception $e) {
        echo "  ERROR: Unexpected error transcribing {$originalRecordingFilename}: " . get_class($e) . " - " . $e->getMessage() . PHP_EOL;
        $skippedCount++;
    } finally {
        // 3. Clean up downloaded audio file
        if (file_exists($tempAudioFilePath)) {
            unlink($tempAudioFilePath);
            // echo "  Deleted temporary audio file {$tempAudioFilePath}." . PHP_EOL;
        }
    }
    
    // Optional: Add a small delay to be nice to the API, especially if processing many files
    // if ($processedCount < $maxToProcessPerRun) sleep(1); 
}

echo "Transcription process finished. Newly transcribed: {$processedCount}. Skipped/Errors: {$skippedCount}." . PHP_EOL;

?>