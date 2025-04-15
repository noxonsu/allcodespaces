const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHAT_HISTORIES_DIR = path.join(__dirname, 'chat_histories');
// Ensure the directory exists on module load
if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
    try {
        fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
        console.log(`Created chat histories directory: ${CHAT_HISTORIES_DIR}`);
    } catch (error) {
        console.error(`Fatal error: Could not create chat histories directory at ${CHAT_HISTORIES_DIR}`, error);
        // Depending on the application, you might want to exit or handle this differently
        process.exit(1); // Exit if logging directory cannot be created
    }
}

/**
 * Sanitizes a string by removing potentially harmful characters.
 * @param {string} str The input string.
 * @returns {string} The sanitized string. Returns an empty string if input is not a string.
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '').trim();
}

/**
 * Validates if a chat ID is a positive integer within safe bounds.
 * @param {*} chatId The chat ID to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function validateChatId(chatId) {
    return typeof chatId === 'number' && Number.isInteger(chatId) && chatId !== 0;
}

/**
 * Validates an Axios image response (basic size check).
 * @param {object} response The Axios response object.
 * @param {number} [maxSizeInBytes=10485760] Maximum allowed size (default 10MB).
 * @returns {boolean} True if valid.
 * @throws {Error} If response is invalid or size exceeds limit.
 */
function validateImageResponse(response, maxSizeInBytes = 10 * 1024 * 1024) {
    if (!response || !response.data) throw new Error('Invalid image response data');
    // Axios response.data for arraybuffer is a Buffer
    if (response.data.length > maxSizeInBytes) {
        throw new Error(`Image size (${response.data.length} bytes) exceeds maximum allowed (${maxSizeInBytes} bytes)`);
    }
    return true;
}

/**
 * Validates if a MIME type is an allowed image type.
 * @param {string} mimeType The MIME type string.
 * @returns {boolean} True if allowed, false otherwise.
 */
function validateMimeTypeImg(mimeType) {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif',
        'image/webp', 'image/bmp'
    ];
    return allowedTypes.includes(mimeType);
}

/**
 * Validates if a MIME type is an allowed audio type for Whisper.
 * @param {string} mimeType The MIME type string.
 * @returns {boolean} True if allowed, false otherwise.
 */
function validateMimeTypeAudio(mimeType) {
    const allowedTypes = [
        'audio/mp3', 'audio/mpeg', 'audio/ogg',
        'audio/wav', 'audio/x-wav', 'audio/mp4',
        'audio/m4a', 'audio/x-m4a'
    ];
    return allowedTypes.includes(mimeType);
}

/**
 * Generates a simple hash for a message (example, not for security).
 * @param {number} chatId The chat ID.
 * @param {number} timestamp The message timestamp.
 * @returns {string} A hex digest hash.
 */
function generateMessageHash(chatId, timestamp) {
    // Use a fixed secret or environment variable for consistency
    const secret = process.env.MESSAGE_HASH_SECRET || 'default-secret-change-me';
    return crypto.createHmac('sha256', secret)
                 .update(`${chatId}:${timestamp}`)
                 .digest('hex');
}

/**
 * Logs data associated with a chat ID to a file.
 * Each log entry is stored as a JSON object on a new line.
 * @param {number} chatId The chat ID.
 * @param {object} data The data object to log. Should include 'role' and 'content' for history.
 * @param {string} [logType='info'] A general type for the log entry (e.g., 'user', 'assistant', 'error', 'system', 'photo', 'voice'). Used if data.role is not set.
 */
function logChat(chatId, content, type = 'message') {
    if (!validateChatId(chatId) && chatId !== 0) {
        console.error('Invalid chat ID in logChat:', chatId);
        return;
    }

    // Get nameprompt from directory path (last segment of the path)
    const currentWorkingDir = process.cwd();
    const baseUserDataDir = path.join(currentWorkingDir, 'user_data');
    const nameDirs = fs.readdirSync(baseUserDataDir).filter(
        dir => fs.statSync(path.join(baseUserDataDir, dir)).isDirectory()
    );

    let chatHistoriesDir;
    for (const nameDir of nameDirs) {
        const possibleHistoryDir = path.join(baseUserDataDir, nameDir, 'chat_histories');
        if (fs.existsSync(possibleHistoryDir)) {
            chatHistoriesDir = possibleHistoryDir;
            break;
        }
    }

    if (!chatHistoriesDir) {
        console.error('Could not find chat histories directory');
        return;
    }

    const logFileName = `chat_${chatId}.log`;
    const logFilePath = path.join(chatHistoriesDir, logFileName);

    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            content: content
        };

        fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
    } catch (error) {
        console.error(`Error logging chat ${chatId}:`, error);
    }
}

module.exports = {
    sanitizeString,
    validateChatId,
    validateImageResponse,
    validateMimeTypeImg,
    validateMimeTypeAudio,
    generateMessageHash,
    logChat,
    CHAT_HISTORIES_DIR // Export directory path if needed elsewhere
};

