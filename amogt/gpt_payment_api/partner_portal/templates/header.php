<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Партнерский портал - AMOGT</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" rel="stylesheet">
    <style>
        body {
            background-color: #f8f9fa;
        }
        .navbar-brand {
            font-weight: bold;
        }
        .sidebar {
            min-height: 100vh;
            background-color: #343a40;
        }
        .sidebar .nav-link {
            color: #adb5bd;
            padding: 0.75rem 1rem;
        }
        .sidebar .nav-link:hover {
            color: #fff;
            background-color: #495057;
        }
        .sidebar .nav-link.active {
            color: #fff;
            background-color: #007bff;
        }
        .main-content {
            padding: 2rem;
        }
        .stats-card {
            border: none;
            box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
            margin-bottom: 1.5rem;
        }
        .stats-card .card-body {
            padding: 1.5rem;
        }
        .stats-number {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0;
        }
        .stats-label {
            color: #6c757d;
            font-size: 0.875rem;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>
    <?php if (partner_is_logged_in()): ?>
        <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
            <div class="container-fluid">
                <a class="navbar-brand" href="index.php">
                    <i class="fas fa-handshake"></i> Партнерский портал AMOGT
                </a>
                <div class="navbar-nav ml-auto">
                    <span class="navbar-text mr-3">
                        <i class="fas fa-user"></i> <?= htmlspecialchars($_SESSION['partner_name'] ?? 'Партнер') ?>
                    </span>
                    <a class="nav-link text-light" href="index.php?action=logout">
                        <i class="fas fa-sign-out-alt"></i> Выход
                    </a>
                </div>
            </div>
        </nav>

        <div class="container-fluid">
            <div class="row">
                <nav class="col-md-3 col-lg-2 d-md-block sidebar collapse">
                    <div class="sidebar-sticky pt-3">
                        <ul class="nav flex-column">
                            <li class="nav-item">
                                <a class="nav-link <?= ($page ?? 'dashboard') === 'dashboard' ? 'active' : '' ?>" href="index.php?page=dashboard">
                                    <i class="fas fa-tachometer-alt"></i> Дашборд
                                </a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link <?= ($page ?? '') === 'transactions' ? 'active' : '' ?>" href="index.php?page=transactions">
                                    <i class="fas fa-list"></i> Мои транзакции
                                </a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link <?= ($page ?? '') === 'api_docs' ? 'active' : '' ?>" href="index.php?page=api_docs">
                                    <i class="fas fa-code"></i> API документация
                                </a>
                            </li>
                        </ul>
                    </div>
                </nav>

                <main role="main" class="col-md-9 ml-sm-auto col-lg-10 px-md-4 main-content">
    <?php else: ?>
        <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
            <div class="container">
                <a class="navbar-brand" href="index.php">
                    <i class="fas fa-handshake"></i> Партнерский портал AMOGT
                </a>
            </div>
        </nav>
        <div class="container mt-5">
    <?php endif; ?>
