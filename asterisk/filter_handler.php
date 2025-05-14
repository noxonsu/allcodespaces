<?php
// This script assumes $sessionsData and $operatorConfigData are already populated.
// It also assumes $selectedDepartment and $selectedFio are set from $_GET in index.php.

$filteredSessions = $sessionsData; // Start with sessions relevant to the configured queues (done in data_loader.php)

error_log("Initial session count for detailed filtering: " . count($filteredSessions));
error_log("Applying filters: Department='{$selectedDepartment}', FIO='{$selectedFio}'");


// Apply Department filter
if ($selectedDepartment) {
    $departmentMedicalCenterQueues = []; 
    $departmentOperatorExtensions = [];

    foreach ($operatorConfigData as $op) {
        if (isset($op['department']) && $op['department'] === $selectedDepartment) {
            if (isset($op['queue_medical_center']) && !empty($op['queue_medical_center']) && !in_array($op['queue_medical_center'], $departmentMedicalCenterQueues)) { 
                $departmentMedicalCenterQueues[] = $op['queue_medical_center']; 
            }
            if (isset($op['operator_extension']) && !empty($op['operator_extension']) && !in_array($op['operator_extension'], $departmentOperatorExtensions)) {
                $departmentOperatorExtensions[] = $op['operator_extension'];
            }
        }
    }

    if (!empty($departmentMedicalCenterQueues) || !empty($departmentOperatorExtensions)) {
        $filteredSessions = array_filter($filteredSessions, function ($session) use ($departmentMedicalCenterQueues, $departmentOperatorExtensions) {
            if (isset($session['answered_by_operator']) && !empty($session['answered_by_operator']) && in_array($session['answered_by_operator'], $departmentOperatorExtensions)) {
                return true;
            }
            if (isset($session['queue_legs_info']) && is_array($session['queue_legs_info'])) {
                foreach ($session['queue_legs_info'] as $leg) {
                    if (isset($leg['queue_dst']) && in_array($leg['queue_dst'], $departmentMedicalCenterQueues)) {
                        return true;
                    }
                }
            }
            return false;
        });
        error_log("Filtered by Department '{$selectedDepartment}'. MC Queues: " . implode(', ', $departmentMedicalCenterQueues) . ". Operator Exts: " . implode(', ', $departmentOperatorExtensions) . ". Result count: " . count($filteredSessions));
    } else {
        $filteredSessions = []; 
        error_log("No MC queues or operator extensions for Department '{$selectedDepartment}'. Result count: 0");
    }
}

// Apply FIO filter (can be combined with Department filter or applied alone on the result of department filter)
if ($selectedFio) {
    $fioOperatorExtensions = [];
    $fioMedicalCenterQueues = [];
    foreach ($operatorConfigData as $op) {
        if (isset($op['fio']) && $op['fio'] === $selectedFio) {
            if (isset($op['operator_extension']) && !empty($op['operator_extension']) && !in_array($op['operator_extension'], $fioOperatorExtensions)) {
                $fioOperatorExtensions[] = $op['operator_extension'];
            }
            if (isset($op['queue_medical_center']) && !empty($op['queue_medical_center']) && !in_array($op['queue_medical_center'], $fioMedicalCenterQueues)) {
                $fioMedicalCenterQueues[] = $op['queue_medical_center'];
            }
        }
    }

    if (!empty($fioOperatorExtensions) || !empty($fioMedicalCenterQueues)) {
        $filteredSessions = array_filter($filteredSessions, function ($session) use ($fioOperatorExtensions, $fioMedicalCenterQueues) {
            if (isset($session['answered_by_operator']) && !empty($session['answered_by_operator']) && in_array($session['answered_by_operator'], $fioOperatorExtensions)) {
                return true;
            }
            if (isset($session['operator_attempts']) && is_array($session['operator_attempts'])) {
                foreach ($session['operator_attempts'] as $attempt) {
                    if (in_array($attempt['operator_dst'], $fioOperatorExtensions) && $attempt['status'] !== 'ANSWERED') {
                        return true;
                    }
                }
            }
            $overallMissedStatuses = ['MISSED', 'NO ANSWER', 'FAILED'];
            if (in_array($session['overall_status'], $overallMissedStatuses) && 
                (empty($session['answered_by_operator']) || !in_array($session['answered_by_operator'], $fioOperatorExtensions)) ) {
                if (isset($session['queue_legs_info']) && is_array($session['queue_legs_info'])) {
                    foreach ($session['queue_legs_info'] as $leg) {
                        if (isset($leg['queue_dst']) && in_array($leg['queue_dst'], $fioMedicalCenterQueues)) {
                            return true; 
                        }
                    }
                }
            }
            return false;
        });
        error_log("Filtered by FIO '{$selectedFio}'. Operator Exts: " . implode(', ', $fioOperatorExtensions) . ". MC Queues: " . implode(', ', $fioMedicalCenterQueues) . ". Result count: " . count($filteredSessions));
    } else {
        $filteredSessions = [];
        error_log("No operator extensions or MC queues for FIO '{$selectedFio}'. Result count: 0");
    }
}

error_log("Final filtered session count: " . count($filteredSessions));

?>
