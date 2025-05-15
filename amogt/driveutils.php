<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/config.php';

use Google\Client;
use Google\Service\Drive;

/**
 * Получает аутентифицированный сервис Google Drive
 * @return Google\Service\Drive|null
 */
function getDriveService() {
    try {
        if (!file_exists(GOOGLE_KEY_FILE)) {
            custom_log('[DriveUtils] Файл ключа сервисного аккаунта Google не найден: ' . GOOGLE_KEY_FILE);
            return null;
        }

        $client = new Client();
        $client->setAuthConfig(GOOGLE_KEY_FILE);
        $client->setScopes(GOOGLE_SCOPES);
        
        return new Drive($client);
    } catch (Exception $e) {
        custom_log('[DriveUtils] Ошибка при аутентификации с Google Drive: ' . $e->getMessage());
        return null;
    }
}

/**
 * Скачивает файл сc Google Drive
 * @param Google\Service\Drive $drive Сервис Google Drive
 * @param string $fileId ID файла на Google Drive
 * @param string $context Контекст для логирования
 * @return string|null Сод ержимое файла как строка или null в случае ошибки
 */
function downloadFileFromDrive($drive, $fileId, $context = 'unknown') {
    try {  
        custom_log("[$context] Скачивание файла с Google Drive ID: $fileId");

        // Получаем метаданные файла
        $file = $drive->files->get($fileId, ['fields' => 'id, name, mimeType, modifiedTime']);
        custom_log("[$context] Метаданные файла: " . json_encode([
            'id' => $file->getId(),
            'name' => $file->getName(),
            'mimeType' => $file->getMimeType(),
            'modifiedTime' => $file->getModifiedTime()
        ]));

        // Скачиваем контент файла
        $response = $drive->files->get($fileId, ['alt' => 'media']);
        $content = $response->getBody()->getContents();
        
        custom_log("[$context] Успешно скачан файл размером " . strlen($content) . " байт");
        return $content;
    } catch (Exception $e) {
        custom_log("[$context] Ошибка при скачивании файла с Google Drive: " . $e->getMessage());
        return null;
    }
}

/**
 * Загружает файл на Google Drive (обновляет существующий)
 * @param Google\Service\Drive $drive Сервис Google Drive
 * @param string $fileId ID файла на Google Drive
 * @param string $content Содержимое файла
 * @param string $fileName Название файла (опционально)
 * @return bool Успешность операции
 */
function uploadFileToDrive($drive, $fileId, $content, $fileName = null) {
    try {
        custom_log("Попытка загрузить/обновить файл на Google Drive с ID: $fileId" . 
                 ($fileName ? ", название: $fileName" : ""));
        
        // Создаем временный файл для загрузки
        $tempFile = tempnam(sys_get_temp_dir(), 'gdrive_');
        file_put_contents($tempFile, $content);
        
        // Настройка файла для загрузки
        $file = new Google\Service\Drive\DriveFile();
        if ($fileName) {
            $file->setName($fileName);
        }
        
        // Обновляем существующий файл
        $drive->files->update($fileId, $file, [
            'data' => file_get_contents($tempFile),
            'mimeType' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'uploadType' => 'multipart'
        ]);
        
        // Удаляем временный файл
        unlink($tempFile);
        
        custom_log("Файл $fileId успешно загружен/обновлен на Google Drive.");
        return true;
    } catch (Exception $e) {
        custom_log("Ошибка загрузки файла $fileId на Google Drive: " . $e->getMessage());
        return false;
    }
}
