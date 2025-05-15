<?php
// This script assumes $sessionsData and $operatorConfigData are already populated.
// It also assumes $selectedDepartment and $selectedFio are set from $_GET in index.php.

$filteredSessions = $sessionsData; // Start with sessions relevant to the configured queues (done in data_loader.php)

custom_log("Initial session count for detailed filtering: " . count($filteredSessions));
custom_log("Applying filters: Department='{$selectedDepartment}', FIO='{$selectedFio}'");


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
        custom_log("Filtered by Department '{$selectedDepartment}'. MC Queues: " . implode(', ', $departmentMedicalCenterQueues) . ". Operator Exts: " . implode(', ', $departmentOperatorExtensions) . ". Result count: " . count($filteredSessions));
    } else {
        $filteredSessions = []; 
        custom_log("No MC queues or operator extensions for Department '{$selectedDepartment}'. Result count: 0");
    }
}

// Apply FIO filter (can be combined with Department filter or applied alone on the result of department filter)
if ($selectedFio) { // $selectedFio now holds an operator_extension
    $fioOperatorExtension = $selectedFio; // The selected extension itself
    // $fioMedicalCenterQueues is not strictly needed if we only filter by who answered,
    // but it's harmless to keep its calculation for now in case of future logic adjustments.
    $fioMedicalCenterQueues = [];
    foreach ($operatorConfigData as $op) {
        if (isset($op['operator_extension']) && $op['operator_extension'] === $fioOperatorExtension) {
            if (isset($op['queue_medical_center']) && !empty($op['queue_medical_center']) && !in_array($op['queue_medical_center'], $fioMedicalCenterQueues)) {
                $fioMedicalCenterQueues[] = $op['queue_medical_center'];
            }
        }
    }

    if (!empty($fioOperatorExtension)) { // We must have the extension to filter
        $filteredSessions = array_filter($filteredSessions, function ($session) use ($fioOperatorExtension) {
            // Only show sessions that were actually answered by the selected operator's extension.
            if (isset($session['answered_by_operator']) && $session['answered_by_operator'] === $fioOperatorExtension) {
                return true;
            }
            return false;
        });
        custom_log("Filtered by FIO (Extension) '{$fioOperatorExtension}' for answered calls. Result count: " . count($filteredSessions));
    } else {
        // This case should ideally not be hit if $selectedFio is set.
        custom_log("No operator extension to filter by, though selectedFio was initially set to '{$selectedFio}'. Result count: " . count($filteredSessions));
    }
}

custom_log("Final filtered session count: " . count($filteredSessions));

?>
