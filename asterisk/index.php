<?php

// Base configurations, env loading, and debugLog
require_once __DIR__ . '/config.php';

// Start session handling
session_start();

// Handle logout action
if (isset($_GET['logout'])) {
    session_unset(); // Unset all session variables
    session_destroy(); // Destroy the session
    header("Location: " . $_SERVER['PHP_SELF']); // Redirect to the same page (will show login form)
    exit;
}
// Autoloader for Composer packages
require __DIR__ . '/vendor/autoload.php';

// Google API helper functions
require_once __DIR__ . '/google_helpers.php';

// Authentication: checks if user is logged in, shows login form if not. Exits if login form is shown.
require_once __DIR__ . '/auth.php';
// If we reach here, user is authenticated. $_SESSION['user_fio'] and $_SESSION['user_role'] are set.

// Data loading: operator config, call logs, initial filtering by medical center queue
// Populates $operatorConfigData and $sessionsData
require_once __DIR__ . '/data_loader.php';



// Analysis helper functions
require_once __DIR__ . '/analysis_helpers.php';

// View helper functions
require_once __DIR__ . '/view_helpers.php';

// ARI Operator Status helper
require_once __DIR__ . '/operator_status_helper.php';


// --- Get Filter Values from URL ---
$defaultDateTo = date('Y-m-d');
$defaultDateFrom = date('Y-m-d', strtotime('-30 days'));

$selectedDateFrom = isset($_GET['date_from']) && !empty($_GET['date_from']) ? $_GET['date_from'] : $defaultDateFrom;
$selectedDateTo = isset($_GET['date_to']) && !empty($_GET['date_to']) ? $_GET['date_to'] : $defaultDateTo;

// Debug: Output the date parameters
custom_log("Selected Date From: " . $selectedDateFrom);
custom_log("Selected Date To: " . $selectedDateTo);

// $selectedQueue was removed from UI, but variable kept for consistency if logic depends on it (currently not)
$selectedQueue = isset($_GET['queue']) ? $_GET['queue'] : ''; 
$selectedDepartment = isset($_GET['department']) ? $_GET['department'] : '';
$selectedFio = isset($_GET['fio_filter']) ? $_GET['fio_filter'] : '';

// --- Populate Filter Options for UI ---
$fioDisplayOptions = [];
$processedExtensionsForDropdown = []; // Use this to ensure unique extensions in dropdown values
if (!empty($operatorConfigData)) {
    foreach ($operatorConfigData as $op) {
        // We need an operator_extension to filter by number, and a FIO to display
        if (isset($op['fio']) && !empty(trim($op['fio'])) && 
            isset($op['operator_extension']) && !empty(trim($op['operator_extension'])) && 
            trim($op['fio']) !== 'администратор') {
            
            $extension = trim($op['operator_extension']);
            // Ensure each extension is added only once as a filter option
            if (!in_array($extension, $processedExtensionsForDropdown)) {
                $displayText = trim($op['fio']) . " (" . htmlspecialchars($extension) . ")";
                $fioDisplayOptions[] = [
                    'value' => htmlspecialchars($extension), // Value is now the extension
                    'text' => htmlspecialchars($displayText)
                ];
                $processedExtensionsForDropdown[] = $extension;
            }
        }
    }
    // Sort by the display text
    usort($fioDisplayOptions, function($a, $b) { return strcmp($a['text'], $b['text']); });
}
$departmentOptions = getUniqueValues($operatorConfigData, 'department'); // from view_helpers.php
custom_log("Filter options populated: Departments=" . count($departmentOptions) . ", FIOs for dropdown=" . count($fioDisplayOptions));


// --- Generate and load analysed calls data ---
// $sessionsData at this point is already filtered by configured medical center queues (from data_loader.php)
$analysedCallsJsonPath = __DIR__ . '/calls_analysed.json'; 
// generateAndGetAnalysedCallsData is from analysis_helpers.php, uses $analysisDir from config.php
$analysedCallsData = generateAndGetAnalysedCallsData($sessionsData, $operatorConfigData, $analysisDir, $analysedCallsJsonPath);

// Calculate summaries using functions from analysis_helpers.php
$overallSummary = calculateOverallSummary($analysedCallsData);
$departmentSummary = calculateSummaryByField($analysedCallsData, 'departments', $operatorConfigData);
$operatorSummary = calculateSummaryByField($analysedCallsData, 'fios', $operatorConfigData); 
custom_log("Initial session count (after MC queue filtering, before detailed filters): " . count($sessionsData));


// --- Apply detailed filters (Department, FIO) ---
// This script will modify $filteredSessions based on $sessionsData and selected filters
// $filteredSessions will be populated by filter_handler.php
require_once __DIR__ . '/filter_handler.php';
// $filteredSessions is now ready for display

// --- Calculate sums for admin display ---
$sumTotalDurationOverallFormatted = '00:00:00';
$sumBilledDurationFormatted = '00:00:00';

if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin' && !empty($filteredSessions)) {
    $sumTotalDurationOverallSeconds = 0;
    $sumBilledDurationSeconds = 0;
    foreach ($filteredSessions as $session) {
        if (isset($session['total_duration_sec_overall']) && is_numeric($session['total_duration_sec_overall'])) {
            $sumTotalDurationOverallSeconds += (int)$session['total_duration_sec_overall'];
        }
        if (isset($session['billed_duration_sec']) && is_numeric($session['billed_duration_sec'])) {
            $sumBilledDurationSeconds += (int)$session['billed_duration_sec'];
        }
    }
    $sumTotalDurationOverallFormatted = formatDuration($sumTotalDurationOverallSeconds);
    $sumBilledDurationFormatted = formatDuration($sumBilledDurationSeconds);
}


// getComment function is in view_helpers.php, uses $commentsDir from config.php
// formatDuration function is in view_helpers.php

// Determine current operator's extension if logged in and not admin
$currentOperatorExtension = null;
if (isset($_SESSION['user_role']) && $_SESSION['user_role'] !== 'admin' && isset($_SESSION['user_fio'])) {
    $sessionUserFio = trim(mb_strtolower($_SESSION['user_fio'], 'UTF-8')); // Normalize session FIO
    // Find the extension for the logged-in FIO
    foreach ($operatorConfigData as $op) {
        if (isset($op['fio']) && isset($op['operator_extension'])) {
            $configFio = trim(mb_strtolower($op['fio'], 'UTF-8')); // Normalize FIO from config
            if ($configFio === $sessionUserFio && !empty(trim($op['operator_extension']))) { // <--- THIS CHECK
                $currentOperatorExtension = trim($op['operator_extension']); // Ensure it's trimmed
                break;
            }
        }
    }
    if ($currentOperatorExtension) {
        custom_log("Current operator extension determined for FIO '{$_SESSION['user_fio']}' (normalized: '{$sessionUserFio}'): " . $currentOperatorExtension);
    } else {
        custom_log("Could not determine current operator extension for FIO '{$_SESSION['user_fio']}' (normalized: '{$sessionUserFio}'). Check operator_config.csv and session FIO. Operator Config Data sample: " . print_r(array_slice($operatorConfigData, 0, 5), true)); // Log more samples
    }
} elseif (isset($_SESSION['user_role']) && $_SESSION['user_role'] !== 'admin') {
    custom_log("Cannot determine current operator extension: User is not admin, but user_fio is not set in session.");
}


// Fetch ARI status for the current operator if applicable
$operatorDisplayStatus = '';
$operatorStatusClass = 'unknown'; // Default class

if (isset($_SESSION['user_role']) && $_SESSION['user_role'] !== 'admin' && !empty($currentOperatorExtension)) {
    // These ARI variables should be defined in your config.php
    global $ariUsername, $ariPassword, $ariHost, $ariPort;

    if (isset($ariUsername, $ariPassword, $ariHost, $ariPort)) {
        $ariStatus = getOperatorAriStatus($currentOperatorExtension, $ariUsername, $ariPassword, $ariHost, $ariPort);
        
        switch ($ariStatus) {
            case 'online':
                $operatorDisplayStatus = 'Онлайн';
                $operatorStatusClass = 'online';
                break;
            case 'offline':
                $operatorDisplayStatus = 'Офлайн';
                $operatorStatusClass = 'offline';
                break;
            default: // 'error' or unexpected
                $operatorDisplayStatus = 'Статус неизвестен';
                // $operatorStatusClass remains 'unknown'
                break;
        }
    } else {
        custom_log("ARI configuration variables are not set in config.php");
        $operatorDisplayStatus = 'Статус (конф.)';
    }
}


// Determine colspan for table based on user role
$colspanValue = 13; // Base colspan assuming "Попытки операторам" is always hidden
if (isset($_SESSION['user_role']) && $_SESSION['user_role'] !== 'admin') {
    $colspanValue = 12; // "Оператор (ответил)" is also hidden for non-admins
}

?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Статистика Колл-Центра: <?php echo htmlspecialchars($operatorSheetName); ?> (<?php echo htmlspecialchars($_SESSION['user_fio'] ?? 'Гость'); ?>)</title>
    <link rel="stylesheet" href="dashboard.css">
    <link rel="stylesheet" href="custom_styles.css"> <!-- Add this line -->
</head>
<body>
    <div class="user-info">
        Пользователь: <?php echo htmlspecialchars($_SESSION['user_fio'] ?? ''); ?>
        <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] !== 'admin' && isset($_SESSION['user_fio'])): ?>
            (<?php echo htmlspecialchars($_SESSION['user_role']); ?>)
            <?php if (!empty($operatorDisplayStatus)): ?>
                <span class="status <?php echo $operatorStatusClass; ?>"><?php echo htmlspecialchars($operatorDisplayStatus); ?></span>
            <?php endif; ?>
        <?php endif; ?>
    </div>
    <a href="?logout=true" class="logout-button">Выход</a>
    <div class="container">
        <h1>Статистика Колл-Центра: <?php echo htmlspecialchars($operatorSheetName); ?></h1>

        <!-- START: Analysis Summary Section -->
        <div class="analysis-summary">
            <h2>Сводка по анализу звонков и сессий</h2>
            <div class="summary-container">
                <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
                <div class="summary-section">
                    <h3>Общая статистика сессий</h3>
                    <?php if (!empty($overallSummary)): ?>
                    <ul>
                        <li>Всего сессий: <?php echo $overallSummary['Всего сессий'] ?? 0; ?></li>
                        <li>Отвечено сессий: <?php echo $overallSummary['Отвечено сессий'] ?? 0; ?></li>
                        <li>Пропущено сессий: <?php echo $overallSummary['Пропущено сессий'] ?? 0; ?></li>
                        <li>Общее время разговоров оператора (статус answered): <?php echo isset($overallSummary['total_operator_talk_time_answered_seconds']) ? formatDuration($overallSummary['total_operator_talk_time_answered_seconds']) : 'N/A'; ?></li>
                        <hr>
                        <?php foreach ($overallSummary as $type => $count): ?>
                        <?php if (!in_array($type, ['Всего сессий', 'Отвечено сессий', 'Пропущено сессий', 'total_operator_talk_time_answered_formatted', 'total_operator_talk_time_answered_seconds'])): ?>
                        <li><?php echo htmlspecialchars($type); ?>: <?php echo $count; ?></li>
                        <?php endif; ?>
                        <?php endforeach; ?>
                    </ul>
                    <?php else: ?>
                    <p>Нет данных для общей сводки.</p>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
            
                <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
                <div class="summary-section">
                    <h3>По отделам (на основе анализа)</h3>
                    <?php if (!empty($departmentSummary)): ?>
                    <?php foreach ($departmentSummary as $department => $counts): ?>
                        <h4>Отдел: <?php echo htmlspecialchars($department); ?></h4>
                        <ul>
                            <?php 
                            // Display Total Talk Time for Department
                            if (isset($counts['total_talk_time_formatted'])) {
                                echo "<li>Общее время разговора (отдел): " . htmlspecialchars($counts['total_talk_time_formatted']) . "</li>";
                            }

                            $totalDeptCalls = 0; // Will be sum of analysis type counts
                            $hasDataForDeptAnalysisTypes = false;
                            foreach ($counts as $type => $count) {
                                if (!in_array($type, ['total_talk_time_formatted', 'total_department_talk_time_answered_seconds'])) {
                                    if ($count > 0) {
                                        $hasDataForDeptAnalysisTypes = true;
                                        echo "<li>" . htmlspecialchars($type) . ": " . $count . "</li>";
                                    }
                                    // Sum up counts for analysis types to see if there's any analysis data
                                    if (is_numeric($count)) { // Ensure we only sum numeric counts
                                        $totalDeptCalls += $count;
                                    }
                                }
                            }
                            
                            // Check if any data was displayed (either talk time or positive analysis counts)
                            $hasTalkTimeData = isset($counts['total_department_talk_time_answered_seconds']) && $counts['total_department_talk_time_answered_seconds'] > 0;
                            
                            if (!$hasTalkTimeData && !$hasDataForDeptAnalysisTypes) {
                                // If no talk time AND no positive analysis counts, then display no data message.
                                // The check for $counts['total_talk_time_formatted'] already handles displaying "00:00:00" if time is zero.
                                // So, this message is for when there's truly nothing to show beyond a zero talk time.
                                if (!isset($counts['total_talk_time_formatted'])) { // If even formatted time is not set
                                    echo "<li>Нет данных для анализа в этом отделе.</li>";
                                } elseif (!$hasDataForDeptAnalysisTypes && $counts['total_department_talk_time_answered_seconds'] == 0) {
                                     // If talk time is zero and no other analysis types have counts > 0
                                     echo "<li>Нет данных по типам анализа в этом отделе.</li>";
                                }
                            }
                            ?>
                        </ul>
                    <?php endforeach; ?>
                    <?php else: ?>
                    <p>Нет данных для сводки по отделам.</p>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
            
                <div class="summary-section">
                    <h3>
                        <?php echo (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin') ? 'По операторам (ФИО, на основе анализа и связи с очередью)' : 'Моя статистика'; ?>
                    </h3>
                    <?php if (!empty($operatorSummary)): ?>
                    <?php foreach ($operatorSummary as $fio => $counts): ?>
                        <?php 
                        if (trim($fio) === 'администратор') continue; // Skip administrator from summary list
                        // If not admin, only show current user's stats
                        if (isset($_SESSION['user_role']) && $_SESSION['user_role'] !== 'admin' && $fio !== $_SESSION['user_fio']) {
                            continue;
                        }
                        ?>
                        <h4>Оператор: <?php echo htmlspecialchars($fio); ?></h4>
                        <ul>
                             <?php 
                            $hasAnyDataForFioDisplay = false; 

                            // Display Total Talk Time
                            if (isset($counts['total_talk_time_formatted'])) {
                                echo "<li>Общее время разговора: " . htmlspecialchars($counts['total_talk_time_formatted']) . "</li>";
                                // Consider talk time (even 00:00) as data displayed
                                $hasAnyDataForFioDisplay = true; 
                            }

                            // Display Missed Sessions by Operator
                            if (isset($counts['Пропущено сессий оператором'])) {
                                echo "<li>Пропущено сессий оператором: " . $counts['Пропущено сессий оператором'] . "</li>";
                                // Consider missed calls count (even 0) as data displayed
                                $hasAnyDataForFioDisplay = true; 
                            }

                            // Display other analysis types
                            $analysisTypesExist = false;
                            foreach ($counts as $type => $count) {
                                // Exclude already displayed helper keys and summary stats
                                if (!in_array($type, [
                                    'total_talk_time_formatted', 
                                    'total_operator_talk_time_answered_seconds', 
                                    'Пропущено сессий оператором'
                                ])) {
                                    if ($count > 0) { // Only display analysis types if their count is greater than 0
                                        echo "<li>" . htmlspecialchars($type) . ": " . $count . "</li>";
                                        $hasAnyDataForFioDisplay = true;
                                        $analysisTypesExist = true;
                                    }
                                }
                            }
                            
                            // If no specific data (talk time, missed calls, positive analysis counts) was displayed
                            if (!$hasAnyDataForFioDisplay) {
                                echo "<li>Нет данных для этого оператора.</li>";
                            }
                            ?>
                        </ul>
                    <?php endforeach; ?>
                    <?php else: ?>
                    <p>Нет данных для сводки по операторам.</p>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <hr> 
        <!-- END: Analysis Summary Section -->

        <form method="GET" action="index.php" class="filters">
            <div class="filter-group">
                <label for="date-from-filter">Дата с:</label>
                <input type="date" id="date-from-filter" name="date_from" value="<?php echo htmlspecialchars($selectedDateFrom); ?>" onchange="this.form.submit()">
            </div>
            <div class="filter-group">
                <label for="date-to-filter">Дата по:</label>
                <input type="date" id="date-to-filter" name="date_to" value="<?php echo htmlspecialchars($selectedDateTo); ?>" onchange="this.form.submit()">
            </div>

            <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
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
            <div class="filter-group">
                <label for="fio-filter">Оператор (ФИО):</label>
                <select id="fio-filter" name="fio_filter" onchange="this.form.submit()">
                    <option value="">Все операторы</option>
                    <?php foreach ($fioDisplayOptions as $fioOp): ?>
                        <option value="<?php echo $fioOp['value']; ?>" <?php echo ($selectedFio === $fioOp['value']) ? 'selected' : ''; ?>>
                            <?php echo $fioOp['text']; ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php else: ?>
                <!-- For non-admins, FIO filter is implicitly set to themselves if $currentOperatorExtension is available -->
                <?php if ($currentOperatorExtension): ?>
                    <input type="hidden" name="fio_filter" value="<?php echo htmlspecialchars($currentOperatorExtension); ?>">
                <?php endif; ?>
            <?php endif; ?>
            <noscript><button type="submit">Применить фильтры</button></noscript>
        </form>

        <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin' && !empty($filteredSessions)): ?>
        <div class="admin-duration-summary">
            <h4>Суммы по отфильтрованным звонкам (<?php echo count($filteredSessions); ?>):</h4>
            <p>Общая длительность (сумма): <strong><?php echo $sumTotalDurationOverallFormatted; ?></strong></p>
            <p>Тарифицируемая длительность (сумма): <strong><?php echo $sumBilledDurationFormatted; ?></strong></p>
        </div>
        <?php endif; ?>

        <table id="calls-table">
            <thead>
                <tr>
                    <th>Дата сессии</th>
                    <th>Номер звонящего</th>
                    <th>Имя звонящего</th>
                    <th>Очереди</th>
                    <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
                    <th>Оператор (ответил)</th>
                    <?php endif; ?>
                    
                    <th>Статус сессии</th>
                    <th>Длительность (общая)</th>      <!-- Moved up -->
                    <th>Время ожидания до ответа</th> <!-- Moved here -->
                    <th>Длительность (тарифиц.)</th>   <!-- Moved down -->
                    <th>Запись</th>
                    <th>Транскрипция</th>
                    <th>Анализ звонка</th>
                    <th>Комментарий</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($filteredSessions)): ?>
                    <tr>
                        <td colspan="<?php echo $colspanValue; ?>" style="text-align: center;">Нет данных для отображения по выбранным фильтрам.</td>
                        <?php custom_log("No data to display for current filters: Department='{$selectedDepartment}', FIO='{$selectedFio}'"); ?>
                    </tr>
                <?php else: ?>
                    <?php 
                    $displayedSessionCount = 0;
                    $extensionToFioDisplayNameMap = [];
                    foreach ($operatorConfigData as $opc) {
                        if (isset($opc['operator_extension']) && !empty($opc['operator_extension']) && isset($opc['fio'])) {
                            $extensionToFioDisplayNameMap[$opc['operator_extension']] = $opc['fio'];
                        }
                    }

                    foreach ($filteredSessions as $session): 
                        if (is_array($session) && isset($session['session_master_id']) && isset($session['session_id_generated'])):
                        $displayedSessionCount++;
                        $sessionMasterId = $session['session_master_id'];
                        $sessionIdGenerated = $session['session_id_generated'];
                        
                        $transcriptionFileDiskPath = $transcriptionsDir . '/' . $sessionMasterId . '.txt'; // $transcriptionsDir from config.php
                        $analysisFileDiskPath = $analysisDir . '/' . $sessionMasterId . '.txt'; // $analysisDir from config.php
                        
                        $transcriptionExists = file_exists($transcriptionFileDiskPath) && filesize($transcriptionFileDiskPath) > 0;
                        $analysisExists = file_exists($analysisFileDiskPath) && filesize($analysisFileDiskPath) > 0;
                        // getComment uses $commentsDir from config.php (made global in view_helpers.php or passed)
                        $commentContent = getComment($sessionIdGenerated, $commentsDir); 
                    ?>
                        <tr>
                            <td><?php echo isset($session['call_start_time']) ? htmlspecialchars($session['call_start_time']) : 'N/A'; ?></td>
                            <td><?php echo isset($session['caller_number']) ? htmlspecialchars($session['caller_number']) : 'N/A'; ?></td>
                            <td><?php echo isset($session['caller_name']) ? htmlspecialchars(str_replace('"', '', $session['caller_name'])) : 'N/A'; ?></td>
                            <td>
                                <?php 
                                $queuesInvolved = [];
                                if (isset($session['queue_legs_info']) && is_array($session['queue_legs_info'])) {
                                    $queuesInvolved = array_unique(array_column($session['queue_legs_info'], 'queue_dst'));
                                }
                                echo !empty($queuesInvolved) ? htmlspecialchars(implode(', ', $queuesInvolved)) : 'N/A';
                                ?>
                            </td>
                            <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
                            <td><?php echo isset($session['answered_by_operator']) ? htmlspecialchars($session['answered_by_operator']) : 'N/A'; ?></td>
                            <?php endif; ?>
                            
                            <td>
                                <?php 
                                if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin') {
                                    $status = isset($session['overall_status']) ? htmlspecialchars($session['overall_status']) : 'N/A';
                                    $missedStatuses = ['MISSED', 'NO ANSWER', 'FAILED'];
                                    if (in_array($session['overall_status'], $missedStatuses)) {
                                        echo '<span style="color: red;">' . $status . '</span>';
                                    } else {
                                        echo $status;
                                    }
                                } else { // Logic for non-admin operator
                                    $operatorSpecificStatus = 'N/A'; // Default status
                                    // Ensure $currentOperatorExtension is not null and not an empty string before comparison
                                    $currentOperatorAnswered = !empty($currentOperatorExtension) && isset($session['answered_by_operator']) && $session['answered_by_operator'] === $currentOperatorExtension;
                                    // Removed: echo $currentOperatorExtension;die(); 
                                    if ($currentOperatorAnswered) {
                                        $operatorSpecificStatus = '<span style="color: green;">Отвечено</span>';
                                    } else {
                                        $wasAttemptedToThisOperator = false;
                                        if (isset($session['operator_attempts']) && is_array($session['operator_attempts'])) {
                                            foreach ($session['operator_attempts'] as $attempt) {
                                                if (isset($attempt['operator_dst']) && $attempt['operator_dst'] === $currentOperatorExtension) {
                                                    $wasAttemptedToThisOperator = true;
                                                    break;
                                                }
                                            }
                                        }

                                        if ($wasAttemptedToThisOperator) {
                                            // Call was attempted to this operator, but they didn't answer it.
                                            // It might have been answered by someone else, or missed entirely.
                                            $operatorSpecificStatus = '<span style="color: orange;">Пропущено</span>';
                                        } else {
                                            // Call was not answered by this operator AND not attempted to this operator.
                                            // This situation should be less common for an operator if filters correctly
                                            // limit their view to relevant calls.
                                            $missedOverallStatuses = ['MISSED', 'NO ANSWER', 'FAILED'];
                                            if (isset($session['overall_status']) && in_array($session['overall_status'], $missedOverallStatuses)) {
                                                 $operatorSpecificStatus = '<span style="color: red;">Пропущено (общий)</span>';
                                            } else if (isset($session['overall_status']) && $session['overall_status'] === 'ANSWERED') {
                                                // Call was answered by someone else, and not attempted to current operator.
                                                $answeredByExt = isset($session['answered_by_operator']) ? htmlspecialchars($session['answered_by_operator']) : 'неизвестным';
                                                $operatorSpecificStatus = 'Отвечено другим (' . $answeredByExt . ')'; 
                                            }
                                            // If overall_status is something else (e.g. BUSY, CONGESTION and not attempted to current op), it remains 'N/A' or could be handled.
                                        }
                                    }
                                    echo $operatorSpecificStatus;
                                }
                                ?>
                            </td>
                            <td><?php echo isset($session['total_duration_sec_overall']) ? formatDuration($session['total_duration_sec_overall']) : '00:00'; ?></td> <!-- Moved up -->
                            <td>
                                <?php
                                if (isset($session['wait_time_sec']) && is_numeric($session['wait_time_sec']) && $session['wait_time_sec'] >= 0) {
                                    echo formatDuration($session['wait_time_sec']);
                                } else {
                                    echo 'N/A';
                                }
                                ?>
                            </td> <!-- Moved here -->
                            <td><?php echo isset($session['billed_duration_sec']) ? formatDuration($session['billed_duration_sec']) : '00:00'; ?></td> <!-- Moved down -->
                            <td>
                                <?php if (isset($session['download_url']) && !empty($session['download_url'])): ?>
                                    <audio controls preload="none" style="width: 150px; vertical-align: middle;">
                                        <source src="<?php echo htmlspecialchars($session['download_url']); ?>" type="audio/wav">
                                        Ваш браузер не поддерживает элемент audio.
                                    </audio>
                                    <a href="<?php echo htmlspecialchars($session['download_url']); ?>" download style="margin-left: 5px; font-size:0.9em; vertical-align: middle;">Скачать</a>
                                <?php elseif (isset($session['recording_file']) && !empty($session['recording_file'])): ?>
                                    <?php echo htmlspecialchars($session['recording_file']); ?> (нет URL)
                                <?php else: ?>
                                    N/A
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if ($transcriptionExists): ?>
                                    <a href="view_transcription.php?id=<?php echo urlencode($sessionMasterId); ?>" target="_blank">Открыть</a>
                                <?php else: ?>
                                    Нет
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php 
                                if ($analysisExists) {
                                    echo htmlspecialchars(file_get_contents($analysisFileDiskPath));
                                } else {
                                    echo 'Нет';
                                }
                                ?>
                            </td>
                            <td class="comment-cell">
                                <?php echo $commentContent; ?>
                                <br>
                                <a href="edit_comment.php?session_id=<?php echo urlencode($sessionIdGenerated); ?>&caller_number=<?php echo urlencode($session['caller_number'] ?? ''); ?>" target="_blank" style="font-size:0.9em;">Редактировать</a>
                            </td>
                        </tr>
                        <?php else: ?>
                            <tr><td colspan="<?php echo $colspanValue; ?>" style="text-align: center;">Найден некорректный формат записи сессии или отсутствует session_master_id/session_id_generated</td></tr>
                            <?php custom_log("Invalid session record format or missing ID: " . print_r($session, true)); ?>
                        <?php endif; ?>
                    <?php endforeach; ?>
                    <?php custom_log("Displayed {$displayedSessionCount} sessions after filtering."); ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            fetch('trigger_worker_ajax.php')
                .then(response => response.json())
                .then(data => { // Corrected syntax: use (data => { instead of data => {
                    console.log('Transcription worker trigger status:', data);
                    // Optionally, display a non-intrusive message to the user or log more details
                    if (data.status === 'triggered') {
                        console.log('Transcription worker has been triggered in the background.');
                    } else if (data.status === 'already_running') {
                        console.log('Transcription worker is already running.');
                    } else if (data.status === 'error') {
                        console.error('Error triggering transcription worker:', data.message);
                    }
                })
                .catch(error => {
                    console.error('Error making AJAX call to trigger worker:', error);
                });
        });
    </script>
</body>
</html>
