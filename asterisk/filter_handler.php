<?php
// This script is included in index.php after $sessionsData, $operatorConfigData,
// $selectedDepartment, and $selectedFio are defined.
// It populates $filteredSessions.

// Start with all sessions that have passed initial medical center queue filtering (if any)
$filteredSessions = $sessionsData; 
custom_log("Initial session count for detailed filtering: " . count($filteredSessions));

// --- Apply Department Filter (if selected by admin) ---
// This filter is only available to admins.
if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin' && !empty($selectedDepartment)) {
    $departmentOperatorExtensions = [];
    foreach ($operatorConfigData as $op) {
        if (isset($op['department']) && $op['department'] === $selectedDepartment && isset($op['operator_extension']) && !empty($op['operator_extension'])) {
            $departmentOperatorExtensions[] = $op['operator_extension'];
        }
    }
    $departmentOperatorExtensions = array_unique($departmentOperatorExtensions);

    if (!empty($departmentOperatorExtensions)) {
        $filteredSessions = array_filter($filteredSessions, function ($session) use ($departmentOperatorExtensions) {
            // Check if the call was answered by an operator in the selected department
            if (isset($session['answered_by_operator']) && in_array($session['answered_by_operator'], $departmentOperatorExtensions)) {
                return true;
            }
            // Check if any attempt was made to an operator in the selected department
            if (isset($session['operator_attempts']) && is_array($session['operator_attempts'])) {
                foreach ($session['operator_attempts'] as $attempt) {
                    if (isset($attempt['operator_dst']) && in_array($attempt['operator_dst'], $departmentOperatorExtensions)) {
                        return true;
                    }
                }
            }
            return false;
        });
        custom_log("Filtered by Department '{$selectedDepartment}'. Result count: " . count($filteredSessions));
    } else {
        custom_log("No operators found for Department '{$selectedDepartment}', or they have no extensions. Department filter effectively shows no results.");
        $filteredSessions = []; // No operators in department means no calls for that department
    }
}


// --- Apply FIO Filter ---
// $selectedFio holds an operator_extension.
// This can be set by an admin via dropdown, or implicitly for a non-admin user to their own extension.
if (!empty($selectedFio)) {
    $fioOperatorExtension = $selectedFio; // $selectedFio is already the extension

    if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin') {
        // Admin is filtering by a specific operator: Show only calls ANSWERED by this operator.
        $filteredSessions = array_filter($filteredSessions, function ($session) use ($fioOperatorExtension) {
            $answeredBy = $session['answered_by_operator'] ?? null;
            $match = ($answeredBy === $fioOperatorExtension);
            // Optional: Add detailed logging for a specific session if troubleshooting
            // if ($session['session_master_id'] === 'SOME_SPECIFIC_ID_TO_DEBUG') {
            //    custom_log("Admin FIO filter check for session {$session['session_master_id']}: answered_by='{$answeredBy}', selected_ext='{$fioOperatorExtension}', match=" . ($match ? 'true' : 'false'));
            // }
            return $match;
        });
        custom_log("Admin filtered by FIO (Extension) '{$fioOperatorExtension}' for ANSWERED calls. Result count: " . count($filteredSessions));
    } else {
        // Non-admin user (operator): Show calls they answered OR calls attempted to them.
        // This is because $selectedFio is their own $currentOperatorExtension.
        $filteredSessions = array_filter($filteredSessions, function ($session) use ($fioOperatorExtension) {
            // Show sessions that were actually answered by this operator's extension.
            if (isset($session['answered_by_operator']) && $session['answered_by_operator'] === $fioOperatorExtension) {
                return true;
            }
            // ALSO: Show sessions that were attempted to this operator, even if they didn't answer it.
            if (isset($session['operator_attempts']) && is_array($session['operator_attempts'])) {
                foreach ($session['operator_attempts'] as $attempt) {
                    if (isset($attempt['operator_dst']) && $attempt['operator_dst'] === $fioOperatorExtension) {
                        return true; 
                    }
                }
            }
            return false;
        });
        custom_log("Operator (non-admin) viewing their calls (Extension '{$fioOperatorExtension}') for answered or attempted. Result count: " . count($filteredSessions));
    }
}

custom_log("Applying filters: Department='{$selectedDepartment}', FIO='{$selectedFio}'");
custom_log("Final filtered session count: " . count($filteredSessions));

// $filteredSessions is now populated and ready for use in index.php
?>
