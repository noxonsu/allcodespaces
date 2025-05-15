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
            'operator_attempts' => $session['operator_attempts'] ?? []
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
        } elseif (in_array($call['overall_status'], ['MISSED', 'NO ANSWER', 'FAILED'])) {
            $summary['Пропущено сессий']++;
        }
    }
    return $summary;
}

function calculateSummaryByField($analysedCallsData, $fieldKey, $operatorConfigDataAll = []) {
    $summaryByField = [];
    $allTypesPlusFallbacks = array_merge($analysedCallsData['types'], ['Нет анализа', 'Ошибка анализа/Нет данных']);
    $isFioSummary = ($fieldKey === 'fios');

    $extensionToFioMap = [];
    if ($isFioSummary) {
        foreach ($operatorConfigDataAll as $opConf) {
            if (isset($opConf['operator_extension']) && !empty(trim($opConf['operator_extension'])) && isset($opConf['fio'])) {
                $extensionToFioMap[trim($opConf['operator_extension'])] = trim($opConf['fio']);
            }
        }
    }

    $allFieldValues = [];
    if ($isFioSummary) {
        $allFieldValues = array_unique(array_map('trim', array_column($operatorConfigDataAll, 'fio')));
    } else { 
        $rawDepts = array_map('trim', array_column($operatorConfigDataAll, 'department'));
        $allFieldValues = array_unique(array_filter($rawDepts)); 
    }
    
    $hasUnassignedCalls = false;
    foreach ($analysedCallsData['calls'] as $call) {
        if (empty($call[$fieldKey])) {
            $hasUnassignedCalls = true;
            break;
        }
    }
    if ($hasUnassignedCalls && !in_array("Не присвоено", $allFieldValues)) {
        $allFieldValues[] = "Не присвоено";
    }
    if (empty($allFieldValues) && !$isFioSummary) $allFieldValues = ["Не присвоено"]; // Ensure "Не присвоено" for departments if no departments defined but calls exist
    if (empty($allFieldValues) && $isFioSummary && empty(array_filter(array_column($operatorConfigDataAll, 'fio')))) $allFieldValues = ["Не присвоено"]; // for FIOs if no FIOs defined


    foreach ($allFieldValues as $fv) {
        if (empty(trim($fv))) continue; 
        $summaryByField[trim($fv)] = array_fill_keys($allTypesPlusFallbacks, 0);
        if ($isFioSummary) {
            $summaryByField[trim($fv)]['Пропущено сессий оператором'] = 0;
        }
    }
    if (!isset($summaryByField["Не присвоено"])) {
        $summaryByField["Не присвоено"] = array_fill_keys($allTypesPlusFallbacks, 0);
        if ($isFioSummary) $summaryByField["Не присвоено"]['Пропущено сессий оператором'] = 0;
    }

    foreach ($analysedCallsData['calls'] as $call) {
        $analysisAttributionFields = $call[$fieldKey]; 
        if (empty($analysisAttributionFields)) {
            $analysisAttributionFields = ["Не присвоено"];
        }

        foreach ($analysisAttributionFields as $fieldValueForAnalysisRaw) {
            $fieldValueForAnalysis = trim($fieldValueForAnalysisRaw);
            if (empty($fieldValueForAnalysis)) $fieldValueForAnalysis = "Не присвоено";

            if (!isset($summaryByField[$fieldValueForAnalysis])) {
                $summaryByField[$fieldValueForAnalysis] = array_fill_keys($allTypesPlusFallbacks, 0);
                if ($isFioSummary) $summaryByField[$fieldValueForAnalysis]['Пропущено сессий оператором'] = 0;
            }
            
            $type = $call['analysis_type'];
            if (in_array($type, $analysedCallsData['types'])) {
                $summaryByField[$fieldValueForAnalysis][$type]++;
            } elseif ($type === 'Нет анализа' || $type === "Нет данных для анализа") {
                 $summaryByField[$fieldValueForAnalysis]['Нет анализа']++;
            } else {
                 $summaryByField[$fieldValueForAnalysis]['Ошибка анализа/Нет данных']++;
            }
        }

        if ($isFioSummary && isset($call['operator_attempts']) && is_array($call['operator_attempts'])) {
            foreach ($call['operator_attempts'] as $attempt) {
                $attemptedOperatorExt = trim($attempt['operator_dst']);
                if (!empty($attemptedOperatorExt) && isset($extensionToFioMap[$attemptedOperatorExt])) {
                    $attemptedFio = $extensionToFioMap[$attemptedOperatorExt];
                     if (!isset($summaryByField[$attemptedFio])) {
                         $summaryByField[$attemptedFio] = array_fill_keys($allTypesPlusFallbacks, 0);
                         $summaryByField[$attemptedFio]['Пропущено сессий оператором'] = 0;
                     }
                    if ($attempt['status'] !== 'ANSWERED') {
                        $summaryByField[$attemptedFio]['Пропущено сессий оператором']++;
                    }
                }
            }
        }
    }
    ksort($summaryByField);
    return $summaryByField;
}
?>
