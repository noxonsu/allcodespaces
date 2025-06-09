<?php
// gpt_payment_api/lib/db.php
require_once __DIR__ . '/../../logger.php';

class DB {
    private string $data_dir;

    public function __construct() {
        $this->data_dir = __DIR__ . '/../data/';
        if (!is_dir($this->data_dir)) {
            if (!mkdir($this->data_dir, 0777, true) && !is_dir($this->data_dir)) {
                logMessage("[GPT_DB] Failed to create data directory: {$this->data_dir}", "ERROR");
                throw new \RuntimeException(sprintf('Directory "%s" was not created', $this->data_dir));
            }
            logMessage("[GPT_DB] Created data directory: {$this->data_dir}");
        }
    }

    private function getFilePath(string $table_name): string {
        return $this->data_dir . $table_name . '.json';
    }

    public function read(string $table_name): array {
        $file_path = $this->getFilePath($table_name);
        if (!file_exists($file_path)) {
            logMessage("[GPT_DB] Data file not found for table '{$table_name}', returning empty array. Path: {$file_path}");
            return []; // Возвращаем пустой массив, если файла нет
        }
        $json_data = file_get_contents($file_path);
        if ($json_data === false) {
            logMessage("[GPT_DB] Failed to read data file for table '{$table_name}'. Path: {$file_path}", "ERROR");
            return []; // Ошибка чтения файла
        }
        $data = json_decode($json_data, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            logMessage("[GPT_DB] JSON decode error for table '{$table_name}': " . json_last_error_msg() . ". Path: {$file_path}", "ERROR");
            return []; // Ошибка декодирования JSON
        }
        // logMessage("[GPT_DB] Data read successfully for table '{$table_name}'. Count: " . count($data));
        return is_array($data) ? $data : [];
    }

    public function write(string $table_name, array $data): bool {
        $file_path = $this->getFilePath($table_name);
        $json_data = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($json_data === false) {
            logMessage("[GPT_DB] JSON encode error for table '{$table_name}': " . json_last_error_msg(), "ERROR");
            return false;
        }
        if (file_put_contents($file_path, $json_data, LOCK_EX) === false) {
            logMessage("[GPT_DB] Failed to write data to file for table '{$table_name}'. Path: {$file_path}", "ERROR");
            return false;
        }
        logMessage("[GPT_DB] Data written successfully for table '{$table_name}'. Path: {$file_path}");
        return true;
    }

    // Инициализация файлов данных, если они не существуют
    public function initDataFiles(): void {
        $files_to_init = ['partners', 'exchange_rates', 'transactions'];
        foreach ($files_to_init as $file_name) {
            $file_path = $this->getFilePath($file_name);
            if (!file_exists($file_path)) {
                if ($this->write($file_name, [])) {
                    logMessage("[GPT_DB] Initialized data file: {$file_path}");
                } else {
                    logMessage("[GPT_DB] Failed to initialize data file: {$file_path}", "ERROR");
                }
            }
        }
    }
}

// При первом подключении файла, можно инициализировать файлы данных
$temp_db_init = new DB();
$temp_db_init->initDataFiles();
unset($temp_db_init);

?>
