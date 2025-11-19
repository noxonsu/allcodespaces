<?php
// ...functions for analysis, summary, and statistics...

// Assumes config.php (for $analysisDir) is included. f
// Access global config variables
global $analysisDir;

function generateAndGetAnalysedCallsData($sessionsData, $operatorConfigData, $currentAnalysisDir, $analysedCallsJsonPath) {
    $analysedCalls = [];
    $allAnalysisTypes = []; 

    foreach ($sessionsData as $session) {
        if (!isset($session['session_master_id'])) {
            continue;
        }
        $sessionMasterId = $session['session_master_id'];
        $analysisFilePath = $currentAnalysisDir . '/' . $sessionMasterId . '.txt';
        $analysisType = 'Нет анализа';
        if (file_exists($analysisFilePath) && filesize($analysisFilePath) > 0) {
            $analysisType = trim(file_get_contents($analysisFilePath));
        }
        if (!in_array($analysisType, $allAnalysisTypes) && $analysisType !== 'Нет анализа' && !str_starts_with($analysisType, "Ошибка анализа") && $analysisType !== "Нет данных для анализа") {
            $allAnalysisTypes[] = $analysisType;
        }

        $sessionUniqueQueues = [];
        if (isset($session['queue_legs_info']) && is_array($session['queue_legs_info'])) {
            foreach ($session['queue_legs_info'] as $leg) {
                if (isset($leg['queue_dst']) && !in_array($leg['queue_dst'], $sessionUniqueQueues)) {
                    $sessionUniqueQueues[] = $leg['queue_dst'];
                }
            }
        }
        if (empty($sessionUniqueQueues)) {
            $sessionUniqueQueues[] = 'N/A_QUEUE';
        }

        $associatedFios = [];
        $associatedDepartments = [];

        if (isset($session['answered_by_operator']) && !empty($session['answered_by_operator'])) {
            $answeringOperatorExt = $session['answered_by_operator'];
            foreach ($operatorConfigData as $opConfig) {
                if (isset($opConfig['operator_extension']) && $opConfig['operator_extension'] === $answeringOperatorExt) {
                    if (isset($opConfig['fio']) && !in_array($opConfig['fio'], $associatedFios)) {
                        $associatedFios[] = $opConfig['fio'];
                    }
                    if (isset($opConfig['department']) && !in_array($opConfig['department'], $associatedDepartments)) {
                        $associatedDepartments[] = $opConfig['department'];
                    }
                }
            }
        } else { 
            foreach ($sessionUniqueQueues as $callMedicalCenterQueue) { 
                foreach ($operatorConfigData as $opConfig) {
                    if (isset($opConfig['queue_medical_center']) && $opConfig['queue_medical_center'] === $callMedicalCenterQueue) {
                        if (isset($opConfig['fio']) && !in_array($opConfig['fio'], $associatedFios)) {
                            $associatedFios[] = $opConfig['fio'];
                        }
                        if (isset($opConfig['department']) && !in_array($opConfig['department'], $associatedDepartments)) {
                            $associatedDepartments[] = $opConfig['department'];
                        }
                    }
                }
            }
        }
        
        $analysedCalls[] = [
            'uniqueid' => $sessionMasterId,
            'session_master_id' => $sessionMasterId,
            'calldate' => $session['call_start_time'] ?? 'N/A',
            'queues' => $sessionUniqueQueues, 
            'analysis_type' => $analysisType,
            'fios' => array_unique($associatedFios),
            'departments' => array_unique($associatedDepartments),
            'answered_by_operator_extension' => $session['answered_by_operator'] ?? null,
            'overall_status' => $session['overall_status'] ?? 'UNKNOWN',
            'operator_attempts' => $session['operator_attempts'] ?? [],
            'billed_duration_sec' => $session['billed_duration_sec'] ?? 0 // Added billed_duration_sec
        ];
    }

    file_put_contents($analysedCallsJsonPath, json_encode(['calls' => $analysedCalls, 'types' => $allAnalysisTypes], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return ['calls' => $analysedCalls, 'types' => $allAnalysisTypes];
}

function calculateOverallSummary($analysedCallsData) {
    $summary = array_fill_keys($analysedCallsData['types'], 0);
    $summary['Нет анализа'] = 0;
    $summary['Ошибка анализа/Нет данных'] = 0;
    $summary['Всего сессий'] = count($analysedCallsData['calls']);
    $summary['Отвечено сессий'] = 0;
    $summary['Пропущено сессий'] = 0;
    $summary['total_operator_talk_time_answered_seconds'] = 0; // Initialize total talk time

    foreach ($analysedCallsData['calls'] as $call) {
        $type = $call['analysis_type'];
        if (in_array($type, $analysedCallsData['types'])) {
            $summary[$type]++;
        } elseif ($type === 'Нет анализа' || $type === "Нет данных для анализа") {
            $summary['Нет анализа']++;
        } else { 
            $summary['Ошибка анализа/Нет данных']++;
        }

        if ($call['overall_status'] === 'ANSWERED') {
            $summary['Отвечено сессий']++;
            if (isset($call['billed_duration_sec'])) {
                $summary['total_operator_talk_time_answered_seconds'] += (int)$call['billed_duration_sec'];
            }
        } elseif (in_array($call['overall_status'], ['MISSED', 'NO ANSWER', 'FAILED'])) {
            $summary['Пропущено сессий']++;
        }
    }
    return $summary;
}

function calculateSummaryByField($analysedCallsData, $fieldKey, $operatorConfigDataAll = []) {
    $summary = [];
    $allAnalysisTypes = $analysedCallsData['types'] ?? [];

    // Initialize summary structure for FIOs from operatorConfigDataAll
    if ($fieldKey === 'fios' && !empty($operatorConfigDataAll)) {
        foreach ($operatorConfigDataAll as $opConfig) {
            if (isset($opConfig['fio']) && trim($opConfig['fio']) !== 'администратор') {
                $fio = trim($opConfig['fio']);
                if (!isset($summary[$fio])) { // Ensure each FIO is initialized only once
                    $summary[$fio] = array_fill_keys($allAnalysisTypes, 0);
                    $summary[$fio]['Нет анализа'] = 0;
                    $summary[$fio]['Ошибка анализа/Нет данных'] = 0;
                    $summary[$fio]['total_operator_talk_time_answered_seconds'] = 0;
                    $summary[$fio]['Пропущено сессий оператором'] = 0;
                }
            }
        }
    }

    // Create a map of operator_extension to FIO and Department for quick lookup
    $extensionToFioMap = [];
    $extensionToDepartmentMap = []; // New map for department lookup
    if (!empty($operatorConfigDataAll)) {
        foreach ($operatorConfigDataAll as $opConfig) {
            if (isset($opConfig['operator_extension']) && !empty(trim($opConfig['operator_extension']))) {
                $ext = trim($opConfig['operator_extension']);
                if (isset($opConfig['fio'])) {
                    $extensionToFioMap[$ext] = trim($opConfig['fio']);
                }
                if (isset($opConfig['department']) && !empty(trim($opConfig['department']))) { // Ensure department is not empty
                    $extensionToDepartmentMap[$ext] = trim($opConfig['department']);
                }
            }
        }
    }

    foreach ($analysedCallsData['calls'] as $call) {
        $type = $call['analysis_type'] ?? 'Нет анализа';
        // Ensure type is valid or default
        if (!in_array($type, $allAnalysisTypes) && !in_array($type, ['Нет анализа', 'Ошибка анализа/Нет данных'])) {
            $type = 'Ошибка анализа/Нет данных';
        }

        // General logic for associating analysis types (works for departments and FIOs if $call[$fieldKey] contains FIOs)
        if (isset($call[$fieldKey])) {
            $fieldValues = is_array($call[$fieldKey]) ? array_unique($call[$fieldKey]) : [$call[$fieldKey]];
            foreach ($fieldValues as $value) {
                $trimmedValue = trim($value);
                if (empty($trimmedValue)) continue;

                // Initialize for non-FIO fields (like departments) if not already done
                if ($fieldKey !== 'fios' && !isset($summary[$trimmedValue])) {
                    $summary[$trimmedValue] = array_fill_keys($allAnalysisTypes, 0);
                    $summary[$trimmedValue]['Нет анализа'] = 0;
                    $summary[$trimmedValue]['Ошибка анализа/Нет данных'] = 0;
                    // Initialize talk time for departments
                    if ($fieldKey === 'departments') {
                        $summary[$trimmedValue]['total_department_talk_time_answered_seconds'] = 0;
                    }
                }
                
                // Increment count if the $trimmedValue (FIO or department) is a valid key in summary
                if (isset($summary[$trimmedValue])) {
                    $summary[$trimmedValue][$type]++;
                }
            }
        }

        // Specific calculations for FIOs
        if ($fieldKey === 'fios') {
            // Calculate total talk time for the operator who ANSWERED the call
            if ($call['overall_status'] === 'ANSWERED' && isset($call['answered_by_operator_extension']) && !empty(trim($call['answered_by_operator_extension'])) && isset($call['billed_duration_sec'])) {
                $answeredExtension = trim($call['answered_by_operator_extension']);
                if (isset($extensionToFioMap[$answeredExtension])) {
                    $answeringFio = $extensionToFioMap[$answeredExtension];
                    // Ensure this FIO was pre-initialized (should be, unless it's 'администратор' or not in op config)
                    if (isset($summary[$answeringFio])) {
                        $summary[$answeringFio]['total_operator_talk_time_answered_seconds'] += (int)$call['billed_duration_sec'];
                    }
                }
            }

            // Calculate "Пропущено сессий оператором"
            // Iterate over all FIOs that were initialized in the summary (from operatorConfigDataAll)
            foreach ($summary as $currentFioForStat => $stats) {
                $operatorExtensionForThisFio = null;
                // Find the extension for $currentFioForStat
                foreach($operatorConfigDataAll as $opc) {
                    if (isset($opc['fio']) && trim($opc['fio']) === $currentFioForStat && isset($opc['operator_extension']) && !empty(trim($opc['operator_extension']))) {
                        $operatorExtensionForThisFio = trim($opc['operator_extension']);
                        break;
                    }
                }

                if ($operatorExtensionForThisFio) {
                    $wasAttemptedToThisOperator = false;
                    if (isset($call['operator_attempts']) && is_array($call['operator_attempts'])) {
                        foreach ($call['operator_attempts'] as $attempt) {
                            if (isset($attempt['operator_dst']) && trim($attempt['operator_dst']) === $operatorExtensionForThisFio) {
                                $wasAttemptedToThisOperator = true;
                                break;
                            }
                        }
                    }
                    
                    $answeredByThisOperator = isset($call['answered_by_operator_extension']) && trim($call['answered_by_operator_extension']) === $operatorExtensionForThisFio;

                    if ($wasAttemptedToThisOperator && !$answeredByThisOperator) {
                        $summary[$currentFioForStat]['Пропущено сессий оператором']++;
                    }
                }
            }
        }

        // Specific calculations for Departments: Total talk time
        if ($fieldKey === 'departments') {
            if ($call['overall_status'] === 'ANSWERED' && isset($call['answered_by_operator_extension']) && !empty(trim($call['answered_by_operator_extension'])) && isset($call['billed_duration_sec'])) {
                $answeredExtension = trim($call['answered_by_operator_extension']);
                if (isset($extensionToDepartmentMap[$answeredExtension])) {
                    $departmentOfAnsweringOperator = $extensionToDepartmentMap[$answeredExtension];
                    // Ensure this department was pre-initialized (should be, if $call[$fieldKey] included it or it's in op config)
                    // Or initialize it here if it wasn't (e.g. department derived from answering op, not from $call['departments'])
                    if (!isset($summary[$departmentOfAnsweringOperator])) {
                         $summary[$departmentOfAnsweringOperator] = array_fill_keys($allAnalysisTypes, 0);
                         $summary[$departmentOfAnsweringOperator]['Нет анализа'] = 0;
                         $summary[$departmentOfAnsweringOperator]['Ошибка анализа/Нет данных'] = 0;
                         $summary[$departmentOfAnsweringOperator]['total_department_talk_time_answered_seconds'] = 0;
                    }
                    $summary[$departmentOfAnsweringOperator]['total_department_talk_time_answered_seconds'] += (int)$call['billed_duration_sec'];
                }
            }
        }
    }

    // Format talk time and ensure all FIOs have the necessary keys
    if ($fieldKey === 'fios') {
        foreach ($summary as $fio => &$stats) { // Use reference to modify array directly
            if (isset($stats['total_operator_talk_time_answered_seconds'])) {
                $stats['total_talk_time_formatted'] = formatDuration($stats['total_operator_talk_time_answered_seconds']);
            } else {
                // Ensure the key exists even if no talk time, to prevent notices
                $stats['total_operator_talk_time_answered_seconds'] = 0;
                $stats['total_talk_time_formatted'] = formatDuration(0);
            }
            // Ensure 'Пропущено сессий оператором' is set for all FIOs in summary
            if (!isset($stats['Пропущено сессий оператором'])) {
                $stats['Пропущено сессий оператором'] = 0;
            }
        }
        unset($stats); // Break the reference with the last element
    }

    // Format talk time for departments
    if ($fieldKey === 'departments') {
        foreach ($summary as $dept => &$stats) { // Use reference to modify array directly
            if (isset($stats['total_department_talk_time_answered_seconds'])) {
                $stats['total_talk_time_formatted'] = formatDuration($stats['total_department_talk_time_answered_seconds']);
            } else {
                // Ensure the key exists even if no talk time
                $stats['total_department_talk_time_answered_seconds'] = 0;
                $stats['total_talk_time_formatted'] = formatDuration(0);
            }
        }
        unset($stats); // Break the reference
    }
    
    if ($fieldKey === 'fios' || $fieldKey === 'departments') {
        ksort($summary); // Sort by FIO or department name
    }

    return $summary;
}
?>
