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


// --- Get Filter Values from URL ---
// $selectedQueue was removed from UI, but variable kept for consistency if logic depends on it (currently not)
$selectedQueue = isset($_GET['queue']) ? $_GET['queue'] : ''; 
$selectedDepartment = isset($_GET['department']) ? $_GET['department'] : '';
$selectedFio = isset($_GET['fio_filter']) ? $_GET['fio_filter'] : '';

// --- Populate Filter Options for UI ---
$fioDisplayOptions = [];
$processedFiosForDropdown = [];
if (!empty($operatorConfigData)) {
    foreach ($operatorConfigData as $op) {
        if (isset($op['fio']) && !empty($op['fio']) && !in_array($op['fio'], $processedFiosForDropdown)) {
            $displayText = $op['fio'];
            if (isset($op['operator_extension']) && !empty($op['operator_extension'])) {
                $displayText .= " (" . htmlspecialchars($op['operator_extension']) . ")";
            }
            $fioDisplayOptions[] = ['value' => htmlspecialchars($op['fio']), 'text' => htmlspecialchars($displayText)];
            $processedFiosForDropdown[] = $op['fio'];
        }
    }
    usort($fioDisplayOptions, function($a, $b) { return strcmp($a['text'], $b['text']); });
}
$departmentOptions = getUniqueValues($operatorConfigData, 'department'); // from view_helpers.php
error_log("Filter options populated: Departments=" . count($departmentOptions) . ", FIOs for dropdown=" . count($fioDisplayOptions));


// --- Generate and load analysed calls data ---
// $sessionsData at this point is already filtered by configured medical center queues (from data_loader.php)
$analysedCallsJsonPath = __DIR__ . '/calls_analysed.json'; 
// generateAndGetAnalysedCallsData is from analysis_helpers.php, uses $analysisDir from config.php
$analysedCallsData = generateAndGetAnalysedCallsData($sessionsData, $operatorConfigData, $analysisDir, $analysedCallsJsonPath);

// Calculate summaries using functions from analysis_helpers.php
$overallSummary = calculateOverallSummary($analysedCallsData);
$departmentSummary = calculateSummaryByField($analysedCallsData, 'departments', $operatorConfigData);
$operatorSummary = calculateSummaryByField($analysedCallsData, 'fios', $operatorConfigData); 
error_log("Initial session count (after MC queue filtering, before detailed filters): " . count($sessionsData));


// --- Apply detailed filters (Department, FIO) ---
// This script will modify $filteredSessions based on $sessionsData and selected filters
// $filteredSessions will be populated by filter_handler.php
require_once __DIR__ . '/filter_handler.php';
// $filteredSessions is now ready for display


// getComment function is in view_helpers.php, uses $commentsDir from config.php
// formatDuration function is in view_helpers.php

?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Статистика Колл-Центра: <?php echo htmlspecialchars($operatorSheetName); ?> (<?php echo htmlspecialchars($_SESSION['user_fio'] ?? 'Гость'); ?>)</title>
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
        .comment-cell { max-width: 200px; overflow-wrap: break-word; }
        .operator-attempts { font-size: 0.9em; list-style-type: none; padding-left: 0; }
        .operator-attempts li { margin-bottom: 3px; }
        .user-info {
            position: absolute;
            top: 10px;
            right: 100px; /* Adjust as needed */
            padding: 8px 15px;
            font-size: 14px;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="user-info">
        Пользователь: <?php echo htmlspecialchars($_SESSION['user_fio'] ?? ''); ?> (<?php echo htmlspecialchars($_SESSION['user_role'] ?? ''); ?>)
    </div>
    <a href="?logout=true" class="logout-button">Выход</a>
    <div class="container">
        <h1>Статистика Колл-Центра: <?php echo htmlspecialchars($operatorSheetName); ?></h1>

        <!-- START: Analysis Summary Section -->
        <div class="analysis-summary">
            <h2>Сводка по анализу звонков и сессий</h2>

            <h3>Общая статистика сессий</h3>
            <?php if (!empty($overallSummary)): ?>
            <ul>
                <li>Всего сессий: <?php echo $overallSummary['Всего сессий'] ?? 0; ?></li>
                <li>Отвечено сессий: <?php echo $overallSummary['Отвечено сессий'] ?? 0; ?></li>
                <li>Пропущено сессий: <?php echo $overallSummary['Пропущено сессий'] ?? 0; ?></li>
                <hr>
                <?php foreach ($overallSummary as $type => $count): ?>
                <?php if (!in_array($type, ['Всего сессий', 'Отвечено сессий', 'Пропущено сессий'])): ?>
                <li><?php echo htmlspecialchars($type); ?>: <?php echo $count; ?></li>
                <?php endif; ?>
                <?php endforeach; ?>
            </ul>
            <?php else: ?>
            <p>Нет данных для общей сводки.</p>
            <?php endif; ?>
            
            <h3>По отделам (на основе анализа)</h3>
            <?php if (!empty($departmentSummary)): ?>
            <?php foreach ($departmentSummary as $department => $counts): ?>
                <h4>Отдел: <?php echo htmlspecialchars($department); ?></h4>
                <ul>
                    <?php 
                    $totalDeptCalls = array_sum(array_values($counts)); // Sum all counts for the department
                    if ($totalDeptCalls > 0) {
                        $hasDataForDept = false;
                        foreach ($counts as $type => $count): 
                            if ($count > 0): 
                                $hasDataForDept = true; ?>
                                <li><?php echo htmlspecialchars($type); ?>: <?php echo $count; ?></li>
                            <?php endif; 
                        endforeach; 
                        if (!$hasDataForDept) {
                             echo "<li>Нет данных для анализа в этом отделе.</li>";
                        }
                    } else {
                        echo "<li>Нет звонков для анализа в этом отделе.</li>";
                    }
                    ?>
                </ul>
            <?php endforeach; ?>
            <?php else: ?>
            <p>Нет данных для сводки по отделам.</p>
            <?php endif; ?>

            <h3>По операторам (ФИО, на основе анализа и связи с очередью)</h3>
            <?php if (!empty($operatorSummary)): ?>
            <?php foreach ($operatorSummary as $fio => $counts): ?>
                <h4>Оператор: <?php echo htmlspecialchars($fio); ?></h4>
                <ul>
                     <?php 
                    $hasAnyDataForFioDisplay = false; 

                    if (isset($counts['Пропущено сессий оператором'])) {
                        echo "<li>Пропущено сессий оператором: " . $counts['Пропущено сессий оператором'] . "</li>";
                        if ($counts['Пропущено сессий оператором'] > 0) {
                            $hasAnyDataForFioDisplay = true;
                        }
                    }

                    $analysisDataExistsForFio = false;
                    foreach ($counts as $type => $count) {
                        if ($type !== 'Пропущено сессий оператором') {
                            if ($count > 0) {
                                echo "<li>" . htmlspecialchars($type) . ": " . $count . "</li>";
                                $hasAnyDataForFioDisplay = true;
                                $analysisDataExistsForFio = true;
                            }
                        }
                    }
                    
                    if (!$hasAnyDataForFioDisplay && isset($counts['Пропущено сессий оператором']) && $counts['Пропущено сессий оператором'] == 0 && !$analysisDataExistsForFio) {
                        echo "<li>Нет данных для анализа для этого оператора.</li>";
                    } elseif (!$hasAnyDataForFioDisplay && (!isset($counts['Пропущено сессий оператором']) || $counts['Пропущено сессий оператором'] == 0) ) {
                        echo "<li>Нет данных для анализа для этого оператора.</li>";
                    }
                    ?>
                </ul>
            <?php endforeach; ?>
            <?php else: ?>
            <p>Нет данных для сводки по операторам.</p>
            <?php endif; ?>
        </div>
        <hr> 
        <!-- END: Analysis Summary Section -->

        <form method="GET" action="index.php" class="filters">
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
            <noscript><button type="submit">Применить фильтры</button></noscript>
        </form>

        <table id="calls-table">
            <thead>
                <tr>
                    <th>Дата сессии</th>
                    <th>Номер звонящего</th>
                    <th>Имя звонящего</th>
                    <th>Очереди</th>
                    <th>Оператор (ответил)</th>
                    <th>Попытки операторам</th>
                    <th>Статус сессии</th>
                    <th>Длительность (общая)</th>
                    <th>Длительность (тарифиц.)</th>
                    <th>Запись</th>
                    <th>Транскрипция</th>
                    <th>Анализ звонка</th>
                    <th>Комментарий</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($filteredSessions)): ?>
                    <tr>
                        <td colspan="13" style="text-align: center;">Нет данных для отображения по выбранным фильтрам.</td>
                        <?php error_log("No data to display for current filters: Department='{$selectedDepartment}', FIO='{$selectedFio}'"); ?>
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
                            <td><?php echo isset($session['answered_by_operator']) ? htmlspecialchars($session['answered_by_operator']) : 'N/A'; ?></td>
                            <td>
                                <?php if (isset($session['operator_attempts']) && !empty($session['operator_attempts'])): ?>
                                <ul class="operator-attempts">
                                    <?php foreach($session['operator_attempts'] as $attempt): ?>
                                    <?php
                                        $opDisplayAttempt = $attempt['operator_dst']; 
                                        if (isset($extensionToFioDisplayNameMap[$attempt['operator_dst']])) {
                                            $opDisplayAttempt = $extensionToFioDisplayNameMap[$attempt['operator_dst']] . " (" . $attempt['operator_dst'] . ")";
                                        }
                                    ?>
                                    <li><?php echo htmlspecialchars($opDisplayAttempt . ': ' . $attempt['status'] . ' (' . formatDuration($attempt['duration_sec']) . ')'); ?></li>
                                    <?php endforeach; ?>
                                </ul>
                                <?php else: echo 'N/A'; endif; ?>
                            </td>
                            <td>
                                <?php 
                                $status = isset($session['overall_status']) ? htmlspecialchars($session['overall_status']) : 'N/A';
                                $missedStatuses = ['MISSED', 'NO ANSWER', 'FAILED'];
                                if (in_array($session['overall_status'], $missedStatuses)) {
                                    echo '<span style="color: red;">' . $status . '</span>';
                                } else {
                                    echo $status;
                                }
                                ?>
                            </td>
                            <td><?php echo isset($session['total_duration_sec_overall']) ? formatDuration($session['total_duration_sec_overall']) : '00:00'; ?></td>
                            <td><?php echo isset($session['billed_duration_sec']) ? formatDuration($session['billed_duration_sec']) : '00:00'; ?></td>
                            <td>
                                <?php if (isset($session['download_url']) && !empty($session['download_url'])): ?>
                                    <audio controls style="width: 200px;">
                                        <source src="<?php echo htmlspecialchars($session['download_url']); ?>" type="audio/wav">
                                        Ваш браузер не поддерживает элемент audio. <a href="<?php echo htmlspecialchars($session['download_url']); ?>">Скачать</a>
                                    </audio>
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
                            <tr><td colspan="13" style="text-align: center;">Найден некорректный формат записи сессии или отсутствует session_master_id/session_id_generated</td></tr>
                            <?php error_log("Invalid session record format or missing ID: " . print_r($session, true)); ?>
                        <?php endif; ?>
                    <?php endforeach; ?>
                    <?php error_log("Displayed {$displayedSessionCount} sessions after filtering."); ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</body>
</html>
