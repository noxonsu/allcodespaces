<?php

// Enable error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

//show all errors 
session_start();

// Handle logout action
if (isset($_GET['logout'])) {
    session_unset(); // Unset all session variables
    session_destroy(); // Destroy the session
    header("Location: " . $_SERVER['PHP_SELF']); // Redirect to the same page (will show login form)
    exit;
}

require __DIR__ . '/vendor/autoload.php';

try {
    // This usage is correct for vlucas/phpdotenv
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
    $dotenv->load();
} catch (Exception $e) {
    die('Could not load .env file. Please ensure it exists and is readable. Error: ' . $e->getMessage());
}


// --- Google Sheets Configuration ---
$googleSheetId = $_ENV['GOOGLE_SHEET_ID'] ?? null;
if (!$googleSheetId) {
    die('GOOGLE_SHEET_ID is not set in your .env file.');
}
$googleCredentialsPath = __DIR__ . '/my-project-1337-458418-4b4c595d74d5.json'; // Path to your service account JSON
$operatorSheetName = 'Федоровка'; // As per your screenshot
$passwordCell = $operatorSheetName . '!F2';
$operatorDataRange = $operatorSheetName . '!A2:C'; // Start from row 2 to skip header

// --- Google API Client Function ---
function getGoogleServiceClient($credentialsPath) {
    $client = new Google\Client();
    $client->setApplicationName('Call Center Dashboard');
    $client->setAuthConfig($credentialsPath);
    $client->setScopes([Google\Service\Sheets::SPREADSHEETS_READONLY]);
    return new Google\Service\Sheets($client);
}

function fetchFromGoogleSheet($service, $sheetId, $range) {
    try {
        $response = $service->spreadsheets_values->get($sheetId, $range);
        return $response->getValues();
    } catch (Exception $e) {
        error_log('Google Sheets API Error fetching range ' . $range . ': ' . $e->getMessage());
        return null;
    }
}

// --- Password Protection ---
$accessPassword = null;
if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    try {
        $service = getGoogleServiceClient($googleCredentialsPath);
        $passwordData = fetchFromGoogleSheet($service, $googleSheetId, $passwordCell);
        if ($passwordData && isset($passwordData[0][0])) {
            $accessPassword = trim($passwordData[0][0]);
        } else {
            die("Could not fetch password from Google Sheet at cell " . $passwordCell . ". Check sheet and permissions.");
        }
    } catch (Exception $e) {
        die("Error initializing Google Sheets service for password check: " . $e->getMessage());
    }

    $passwordError = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
        if (hash_equals($accessPassword, $_POST['password'])) { // Use hash_equals for timing attack resistance
            $_SESSION['authenticated'] = true;
            header("Location: " . $_SERVER['PHP_SELF']); // Redirect to clear POST data
            exit;
        } else {
            $passwordError = "Неверный пароль.";
        }
    }

    // Display password form
    ?>
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><title>Вход</title>
        <link rel="stylesheet" href="dashboard.css">
        <style>
            body { display: flex; justify-content: center; align-items: center; height: 100vh; }
            .login-form { padding: 20px; border: 1px solid #ccc; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .login-form input { margin-bottom: 10px; padding: 8px; width: 200px; }
            .login-form button { padding: 10px 15px; }
            .error { color: red; margin-bottom: 10px; }
        </style>
    </head>
    <body>
        <div class="login-form">
            <h2>Введите пароль для доступа</h2>
            <form method="POST" action="">
                <?php if ($passwordError): ?><p class="error"><?php echo $passwordError; ?></p><?php endif; ?>
                <input type="password" name="password" placeholder="Пароль" required><br>
                <button type="submit">Войти</button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit; // Stop further script execution
}


// --- Fetch Operator Config from Google Sheets (if authenticated) ---
$operatorConfigData = [];
try {
    $service = getGoogleServiceClient($googleCredentialsPath);
    $sheetData = fetchFromGoogleSheet($service, $googleSheetId, $operatorDataRange);

    if ($sheetData) {
        foreach ($sheetData as $row) {
            if (count($row) >= 3 && !empty(trim($row[0]))) { // Ensure FIO, Queue, Department exist and FIO is not empty
                $operatorConfigData[] = [
                    'fio' => trim($row[0]),
                    'queue' => trim($row[1]),
                    'department' => trim($row[2]),
                ];
            }
        }
    }
} catch (Exception $e) {
    // Log error but continue with empty or fallback data if needed
    error_log("Error fetching operator data from Google Sheets: " . $e->getMessage());
}


if (empty($operatorConfigData)) {
    // Fallback or error message if Google Sheets data retrieval fails or sheet is empty
    $errorMessage = "Не удалось загрузить конфигурацию операторов из Google Sheets ({$operatorSheetName}) или таблица пуста. Фильтрация по операторам и отделам может быть неполной.";
    echo "<p style='color:red; text-align:center;'>{$errorMessage}</p>";
    error_log($errorMessage); // Log this error
    // No fallback data will be used. The script will proceed with an empty $operatorConfigData.
}

// --- Fetch Call Logs from URL ---
$callLogData = [];
$callLogURL = 'https://sip.qazna24.kz/admin/dashboard/';

// Debug function
function debugLog($message) {
    error_log("[DEBUG] " . $message);
    echo "<script>console.log(\"[DEBUG] " . htmlspecialchars($message) . "\");</script>"; // Output to browser console
}

debugLog("Attempting to fetch call logs from: " . $callLogURL);

try {
    $ch = curl_init($callLogURL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Skip SSL verification - use with caution!
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // Also skip hostname verification
    $jsonContent = curl_exec($ch);

    if (curl_errno($ch)) {
        throw new Exception(curl_error($ch));
    }

    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($httpCode != 200) {
        throw new Exception("HTTP Error: " . $httpCode . " - " . $jsonContent); // Include response body in error message
    }

    curl_close($ch);

    if ($jsonContent === false) {
        throw new Exception('Failed to fetch data from URL.');
    }

    // Check if we have valid content
    if (!empty($jsonContent)) {
        $decodedData = json_decode($jsonContent, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $jsonError = 'Error decoding JSON: ' . json_last_error_msg();
            echo '<div class="error-message">' . $jsonError . '</div>';
            error_log($jsonError); // Log JSON decoding error
            debugLog($jsonError);
        } else {
            // Make sure the data is in the expected format (array of arrays)
            if (!is_array($decodedData)) {
                $formatError = 'JSON does not contain a valid JSON array';
                echo '<div class="error-message">' . $formatError . '</div>';
                error_log($formatError);
                debugLog($formatError);
            } elseif (!isset($decodedData['calls']) || !is_array($decodedData['calls'])) {
                $formatError = 'JSON does not contain a "calls" key with an array value';
                echo '<div class="error-message">' . $formatError . '</div>';
                error_log($formatError);
                debugLog($formatError);
            }
            elseif (count($decodedData['calls']) > 0 && !is_array($decodedData['calls'][0])) {
                $formatError = 'JSON["calls"] does not contain a valid array of call records';
                echo '<div class="error-message">' . $formatError . '</div>';
                error_log($formatError); // Log format error
                debugLog($formatError);
            }
            else {
                $callLogData = $decodedData['calls'];
                error_log("Successfully loaded " . count($callLogData) . " call records from URL");
                debugLog("Successfully loaded " . count($callLogData) . " call records from URL");
            }
        }
    } else {
        $emptyFileError = 'Fetched JSON is empty';
        echo '<div class="error-message">' . $emptyFileError . '</div>';
        error_log($emptyFileError); // Log empty file error
        debugLog($emptyFileError);
    }
} catch (Exception $e) {
    $fetchError = 'Error fetching or processing JSON: ' . $e->getMessage();
    echo '<div class="error-message">' . $fetchError . '</div>';
    error_log($fetchError); // Log the error
    debugLog($fetchError);
}

// --- End Fetch Call Logs from URL ---

// --- Helper Functions ---
function getUniqueValues($array, $key) {
    $values = [];
    foreach ($array as $item) {
        if (isset($item[$key]) && !in_array($item[$key], $values)) {
            $values[] = $item[$key];
        }
    }
    sort($values);
    return $values;
}

function formatDuration($seconds) {
    $min = floor($seconds / 60);
    $sec = $seconds % 60;
    return sprintf('%02d:%02d', $min, $sec);
}

// --- Get Filter Values ---
$selectedFio = isset($_GET['fio']) ? $_GET['fio'] : '';
$selectedQueue = isset($_GET['queue']) ? $_GET['queue'] : '';
$selectedDepartment = isset($_GET['department']) ? $_GET['department'] : '';

// --- Populate Filter Options ---
$fioOptions = getUniqueValues($operatorConfigData, 'fio');
$departmentOptions = getUniqueValues($operatorConfigData, 'department');

// Combine queues from operator config and call logs for a comprehensive list
$queuesFromConfig = getUniqueValues($operatorConfigData, 'queue');
$queuesFromCalls = getUniqueValues($callLogData, 'destination');
$queueOptions = array_unique(array_merge($queuesFromConfig, $queuesFromCalls));
sort($queueOptions);
error_log("Filter options populated: FIOs=" . count($fioOptions) . ", Departments=" . count($departmentOptions) . ", Queues=" . count($queueOptions));
error_log("Initial call log count: " . count($callLogData));


// --- Filter Logic ---
$filteredCalls = $callLogData;
error_log("Selected filters: FIO='{$selectedFio}', Queue='{$selectedQueue}', Department='{$selectedDepartment}'");

// Determine relevant queues based on FIO or Department selection
$queuesToFilterBy = [];

if ($selectedFio) {
    foreach ($operatorConfigData as $op) {
        if ($op['fio'] === $selectedFio) {
            $queuesToFilterBy[] = $op['queue'];
        }
    }
    if (!empty($queuesToFilterBy)) {
        $filteredCalls = array_filter($filteredCalls, function ($call) use ($queuesToFilterBy) {
            return isset($call['destination']) && in_array($call['destination'], $queuesToFilterBy);
        });
        error_log("Filtered by FIO '{$selectedFio}'. Queues to filter by: " . implode(', ', $queuesToFilterBy) . ". Result count: " . count($filteredCalls));
    } else {
        // If FIO is selected but no queues found for them, show no calls for this specific filter
         $filteredCalls = [];
         error_log("No queues found for selected FIO '{$selectedFio}'. Result count: 0");
    }
}

if ($selectedDepartment) {
    $departmentQueues = [];
    foreach ($operatorConfigData as $op) {
        if ($op['department'] === $selectedDepartment) {
            $departmentQueues[] = $op['queue'];
        }
    }
     if (!empty($departmentQueues)) {
        // If a FIO filter was already applied, filter within those results
        // Otherwise, filter the main call list
        $baseForDepartmentFilter = ($selectedFio && !empty($queuesToFilterBy)) ? $filteredCalls : $callLogData;
        error_log("Base for department filter count: " . count($baseForDepartmentFilter));
        
        $filteredCalls = array_filter($baseForDepartmentFilter, function ($call) use ($departmentQueues) {
            return isset($call['destination']) && in_array($call['destination'], $departmentQueues);
        });
        error_log("Filtered by Department '{$selectedDepartment}'. Queues to filter by: " . implode(', ', $departmentQueues) . ". Result count: " . count($filteredCalls));
    } else {
         // If Department is selected but no queues found for it
        $filteredCalls = [];
        error_log("No queues found for selected Department '{$selectedDepartment}'. Result count: 0");
    }
}


// Direct queue filter (applied last or if no FIO/Dept queue restrictions)
if ($selectedQueue) {
    $initialCountBeforeQueueFilter = count($filteredCalls);
    $filteredCalls = array_filter($filteredCalls, function ($call) use ($selectedQueue) {
        return isset($call['destination']) && $call['destination'] === $selectedQueue;
    });
    error_log("Filtered by Queue '{$selectedQueue}'. Initial count: {$initialCountBeforeQueueFilter}. Result count: " . count($filteredCalls));
}

?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Статистика Колл-Центра: <?php echo htmlspecialchars($operatorSheetName); ?></title>
    <link rel="stylesheet" href="dashboard.css">
    <style>
        .logout-button {
            position: absolute;
            top: 10px;
            right: 10px;
            padding: 8px 15px;
            background-color: #f44336;
            color: white;
            border: none;
            border-radius: 4px;
            text-decoration: none;
            font-size: 14px;
        }
        .logout-button:hover {
            background-color: #d32f2f;
        }
    </style>
</head>
<body>
    <a href="?logout=true" class="logout-button">Выход</a>
    <div class="container">
        <h1>Статистика Колл-Центра: <?php echo htmlspecialchars($operatorSheetName); ?></h1>

        <form method="GET" action="index.php" class="filters">
            <div class="filter-group">
                <label for="fio-filter">ФИО Оператора:</label>
                <select id="fio-filter" name="fio" onchange="this.form.submit()">
                    <option value="">Все операторы</option>
                    <?php foreach ($fioOptions as $fio): ?>
                        <option value="<?php echo htmlspecialchars($fio); ?>" <?php echo ($selectedFio === $fio) ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($fio); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="filter-group">
                <label for="queue-filter">Очередь:</label>
                <select id="queue-filter" name="queue" onchange="this.form.submit()">
                    <option value="">Все очереди</option>
                    <?php foreach ($queueOptions as $queue): ?>
                        <option value="<?php echo htmlspecialchars($queue); ?>" <?php echo ($selectedQueue === $queue) ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($queue); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="filter-group">
                <label for="department-filter">Отдел:</label>
                <select id="department-filter" name="department" onchange="this.form.submit()">
                    <option value="">Все отделы</option>
                    <?php foreach ($departmentOptions as $department): ?>
                        <option value="<?php echo htmlspecialchars($department); ?>" <?php echo ($selectedDepartment === $department) ? 'selected' : ''; ?>>
                            <?php echo htmlspecialchars($department); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <noscript><button type="submit">Применить фильтры</button></noscript>
        </form>

        <table id="calls-table">
            <thead>
                <tr>
                    <th>Дата звонка</th>
                    <th>Кто звонил (номер)</th>
                    <th>Кто звонил (имя)</th>
                    <th>Куда звонил (очередь)</th>
                    <th>Длительность (общая)</th>
                    <th>Длительность (тарифиц.)</th>
                    <th>Статус</th>
                    <th>Запись</th>
                    <th>Транскрипция</th>
                    <th>Анализ звонка</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($filteredCalls)): ?>
                    <tr>
                        <td colspan="10" style="text-align: center;">Нет данных для отображения по выбранным фильтрам.</td>
                        <?php error_log("No data to display for current filters: FIO='{$selectedFio}', Queue='{$selectedQueue}', Department='{$selectedDepartment}'"); ?>
                    </tr>
                <?php else: ?>
                    <?php 
                    $displayedCallCount = 0;
                    foreach ($filteredCalls as $call): 
                        if (is_array($call) && isset($call['uniqueid'])): // Make sure each call is an array and has uniqueid
                        $displayedCallCount++;
                        $uniqueId = $call['uniqueid'];
                        $transcriptionFileDiskPath = __DIR__ . '/transcriptions/' . $uniqueId . '.txt';
                        $transcriptionFileWebPath = 'transcriptions/' . $uniqueId . '.txt';
                        $analysisFileDiskPath = __DIR__ . '/analysis/' . $uniqueId . '.txt';
                    ?>
                        <tr>
                            <td><?php echo isset($call['calldate']) ? htmlspecialchars($call['calldate']) : 'N/A'; ?></td>
                            <td><?php echo isset($call['callerid_num']) ? htmlspecialchars($call['callerid_num']) : 'N/A'; ?></td>
                            <td><?php echo isset($call['callerid_name']) ? htmlspecialchars(str_replace('"', '', $call['callerid_name'])) : 'N/A'; ?></td>
                            <td><?php echo isset($call['destination']) ? htmlspecialchars($call['destination']) : 'N/A'; ?></td>
                            <td><?php echo isset($call['duration_total_sec']) ? formatDuration($call['duration_total_sec']) : '00:00'; ?></td>
                            <td><?php echo isset($call['duration_billed_sec']) ? formatDuration($call['duration_billed_sec']) : '00:00'; ?></td>
                            <td><?php echo isset($call['status']) ? htmlspecialchars($call['status']) : 'N/A'; ?></td>
                            <td>
                                <?php if (isset($call['download_url']) && !empty($call['download_url'])): ?>
                                    <a href="<?php echo htmlspecialchars($call['download_url']); ?>" target="_blank">
                                        <?php echo isset($call['recording_filename']) && !empty($call['recording_filename']) ? htmlspecialchars($call['recording_filename']) : 'Скачать'; ?>
                                    </a>
                                <?php else: ?>
                                    <?php echo isset($call['recording_filename']) && !empty($call['recording_filename']) ? htmlspecialchars($call['recording_filename']) : 'N/A'; ?>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if (file_exists($transcriptionFileDiskPath) && filesize($transcriptionFileDiskPath) > 0): ?>
                                    <a href="<?php echo htmlspecialchars($transcriptionFileWebPath); ?>" target="_blank">Открыть</a>
                                <?php else: ?>
                                    Нет
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php 
                                if (file_exists($analysisFileDiskPath) && filesize($analysisFileDiskPath) > 0) {
                                    echo htmlspecialchars(file_get_contents($analysisFileDiskPath));
                                } else {
                                    echo 'Нет';
                                }
                                ?>
                            </td>
                        </tr>
                        <?php else: ?>
                            <tr><td colspan="10" style="text-align: center;">Найден некорректный формат записи вызова или отсутствует uniqueid</td></tr>
                            <?php error_log("Invalid call record format or missing uniqueid: " . print_r($call, true)); ?>
                        <?php endif; ?>
                    <?php endforeach; ?>
                    <?php error_log("Displayed {$displayedCallCount} calls after filtering."); ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    <!-- dashboa rd.js is no longer strictly needed for filtering if using form submits.
         It could be used for minor UI enhancements if desired, but core logic is PHP.
    <script src="da shboard.js"></script> 
    -->
</body>
</html>
