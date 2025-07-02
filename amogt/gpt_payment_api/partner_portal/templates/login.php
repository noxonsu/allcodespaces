<div class="row justify-content-center">
    <div class="col-md-6 col-lg-4">
        <div class="card">
            <div class="card-header bg-primary text-white text-center">
                <h4><i class="fas fa-sign-in-alt"></i> Вход в партнерский портал</h4>
            </div>
            <div class="card-body">
                <?php if (isset($_SESSION['login_error'])): ?>
                    <div class="alert alert-danger">
                        <?= htmlspecialchars($_SESSION['login_error']) ?>
                    </div>
                    <?php unset($_SESSION['login_error']); ?>
                <?php endif; ?>

                <form method="POST" action="">
                    <div class="form-group">
                        <label for="api_token">API токен:</label>
                        <input type="password" class="form-control" id="api_token" name="api_token" 
                               placeholder="Введите ваш API токен" required>
                        <small class="form-text text-muted">
                            Используйте ваш API токен для входа в систему. 
                            Если вы забыли токен, обратитесь к администратору.
                        </small>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block">
                        <i class="fas fa-sign-in-alt"></i> Войти
                    </button>
                </form>
            </div>
            <div class="card-footer text-center text-muted">
                <small>
                    <i class="fas fa-shield-alt"></i> 
                    Ваши данные защищены и используются только для аутентификации
                </small>
            </div>
        </div>
    </div>
</div>

<div class="row mt-4">
    <div class="col-12 text-center">
        <div class="card">
            <div class="card-body">
                <h5 class="card-title">Возможности партнерского портала</h5>
                <div class="row">
                    <div class="col-md-4">
                        <i class="fas fa-chart-line fa-2x text-success mb-3"></i>
                        <h6>Статистика</h6>
                        <p class="text-muted">Просматривайте статистику ваших заявок и успешных транзакций</p>
                    </div>
                    <div class="col-md-4">
                        <i class="fas fa-list fa-2x text-info mb-3"></i>
                        <h6>История транзакций</h6>
                        <p class="text-muted">Подробная история всех ваших транзакций с данными заявок</p>
                    </div>
                    <div class="col-md-4">
                        <i class="fas fa-code fa-2x text-warning mb-3"></i>
                        <h6>API документация</h6>
                        <p class="text-muted">Полная документация по интеграции с нашим API</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
