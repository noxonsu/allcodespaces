module.exports = {
  apps: [{
    name: 'gpt4osearch',
    script: 'gpts/gpt4osearch.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    time: true,
    kill_timeout: 3000,        // Время ожидания перед force kill (ms)
    wait_ready: true,          // Ждать сигнал ready от приложения
    max_restarts: 10,          // Максимальное количество рестартов при ошибках
    restart_delay: 1000        // Задержка между рестартами
  }]
};