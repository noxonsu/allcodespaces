<?php
// This file assumes session_start() has been called in index.php
// It also assumes config.php and google_helpers.php have been included.

global $googleCredentialsPath, $googleSheetId, $operatorDataRange; // Make config vars available

if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    // Fetch all user data (including passwords) for login check
    $loginOperatorConfig = [];
    try {
        $service = getGoogleServiceClient($googleCredentialsPath);
        $sheetDataForLogin = fetchFromGoogleSheet($service, $googleSheetId, $operatorDataRange);

        if ($sheetDataForLogin) {
            foreach ($sheetDataForLogin as $row) {
                // Expecting FIO in col 0, Queue in 1, Dept in 2, Password in 3
                if (count($row) >= 1 && !empty(trim($row[0]))) { // FIO must exist
                    $loginOperatorConfig[] = [
                        'fio' => trim($row[0]),
                        'queue' => isset($row[1]) ? trim($row[1]) : null,
                        'department' => isset($row[2]) ? trim($row[2]) : null,
                        'password' => isset($row[3]) ? trim($row[3]) : null, // Password from Column D
                    ];
                }
            }
        } else {
            die("Could not fetch user data from Google Sheet for login. Check sheet and permissions for range " . $operatorDataRange);
        }
    } catch (Exception $e) {
        die("Error initializing Google Sheets service for login data: " . $e->getMessage());
    }

    $loginError = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['fio']) && isset($_POST['password'])) {
        $submittedFio = trim($_POST['fio']);
        $submittedPassword = $_POST['password'];
        $loggedIn = false;

        foreach ($loginOperatorConfig as $user) {
            if (isset($user['fio']) && isset($user['password']) && hash_equals($user['fio'], $submittedFio) && hash_equals($user['password'], $submittedPassword)) {
                $_SESSION['authenticated'] = true;
                $_SESSION['user_fio'] = $user['fio'];
                $userFioLower = strtolower($user['fio']);
                error_log("Login check: User FIO lowercased: '" . $userFioLower . "', comparing with 'администратор'");
                $_SESSION['user_role'] = ($userFioLower === 'администратор') ? 'admin' : 'operator'; 
                error_log("Assigned role: " . $_SESSION['user_role'] . " for user " . $user['fio']);
                
                header("Location: " . $_SERVER['PHP_SELF']); // Redirect to clear POST data
                exit;
            }
        }
        if (!$loggedIn) {
            $loginError = "Неверный ФИО или пароль.";
        }
    }

    // Display login form
    ?>
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8"><title>Вход</title>
        <link rel="stylesheet" href="dashboard.css">
        <style>
            body { display: flex; justify-content: center; align-items: center; height: 100vh; }
            .login-form { padding: 20px; border: 1px solid #ccc; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .login-form input { margin-bottom: 10px; padding: 8px; width: 200px; display: block; }
            .login-form button { padding: 10px 15px; }
            .error { color: red; margin-bottom: 10px; }
        </style>
    </head>
    <body>
        <div class="login-form">
            <h2>Введите ФИО и пароль для доступа</h2>
            <form method="POST" action="">
                <?php if ($loginError): ?><p class="error"><?php echo $loginError; ?></p><?php endif; ?>
                <input type="text" name="fio" placeholder="ФИО" required><br>
                <input type="password" name="password" placeholder="Пароль" required><br>
                <button type="submit">Войти</button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit; // Stop further script execution
}
?>
