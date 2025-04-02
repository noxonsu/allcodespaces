//this is file utilities.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHAT_HISTORIES_DIR = path.join(__dirname, 'chat_histories');
if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
    fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
}

function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>'"`;]/g, '');
}

function validateChatId(chatId) {
    return Number.isInteger(chatId) && chatId > 0 && chatId < Number.MAX_SAFE_INTEGER;
}

function validateImageResponse(response, maxSizeInBytes = 10 * 1024 * 1024) {
    if (!response || !response.data) throw new Error('Invalid image response');
    if (response.data.length > maxSizeInBytes) throw new Error('Image size exceeds maximum allowed');
    return true;
}

function validateMimeTypeImg(mimeType) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    return allowedMimeTypes.includes(mimeType);
}

function validateMimeTypeAudio(mimeType) {
    const allowedMimeTypes = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'];
    return allowedMimeTypes.includes(mimeType);
}

function generateMessageHash(chatId, timestamp) {
    const secret = process.env.MESSAGE_HASH_SECRET || 'default-secret-change-me';
    return crypto.createHmac('sha256', secret).update(`${chatId}:${timestamp}`).digest('hex');
}

function logChat(chatId, data, role = 'user') {
    const chatLogPath = path.join(__dirname, 'chat_histories', `chat_${chatId}.log`);
    const entry = {
        ...data,
        role,
        timestamp: new Date().toISOString()
    };
    fs.appendFileSync(chatLogPath, JSON.stringify(entry) + '\n');
}

module.exports = { sanitizeString, validateChatId, validateImageResponse, validateMimeTypeImg, validateMimeTypeAudio, generateMessageHash, logChat };