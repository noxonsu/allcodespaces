const path = require('path');

const NAMEPROMPT = process.env.NAMEPROMPT || 'calories';
const BASE_DIR = path.join(__dirname, 'user_data');

module.exports = {
    NAMEPROMPT,
    USER_DATA_DIR: path.join(BASE_DIR, NAMEPROMPT),
    CHAT_HISTORIES_DIR: path.join(BASE_DIR, NAMEPROMPT, 'chat_histories'),
    MAX_HISTORY: 20
};