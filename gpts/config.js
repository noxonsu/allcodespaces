const path = require('path');

// Get the name prompt from environment variable
function getNamePrompt() {
    return process.env.NAMEPROMPT || 'calories';
}

// Get base directory path
function getBaseDir() {
    return path.join(__dirname, 'user_data');
}

// Get user data directory path
function getUserDataDir() {
    return path.join(getBaseDir(), getNamePrompt());
}

// Get chat histories directory path
function getChatHistoriesDir() {
    return path.join(getUserDataDir(), 'chat_histories');
}

// Get max history limit
function getMaxHistory() {
    return 20;
}

// Get free message limit (null means unlimited)
function getFreeMessageLimit() {
    const freeMessageLimitEnv = process.env.FREE_MESSAGE_LIMIT;
    let freeLimit = null; // null means unlimited
    
    if (freeMessageLimitEnv !== undefined) {
        const parsed = parseInt(freeMessageLimitEnv, 10);
        if (!isNaN(parsed) && parsed >= 0) { // Allow 0 for pay-immediately
            freeLimit = parsed;
        }
    }
    
    return freeLimit;
}

// For backward compatibility, maintain these constants
// but they will be updated on reloadConfig()
let NAMEPROMPT = getNamePrompt();
let BASE_DIR = getBaseDir();
let USER_DATA_DIR = getUserDataDir();
let CHAT_HISTORIES_DIR = getChatHistoriesDir();
let MAX_HISTORY = getMaxHistory();
let FREE_MESSAGE_LIMIT = getFreeMessageLimit();

// Function to reload all config values from current environment variables
function reloadConfig() {
    NAMEPROMPT = getNamePrompt();
    BASE_DIR = getBaseDir();
    USER_DATA_DIR = getUserDataDir();
    CHAT_HISTORIES_DIR = getChatHistoriesDir();
    MAX_HISTORY = getMaxHistory();
    FREE_MESSAGE_LIMIT = getFreeMessageLimit();
    
    return {
        NAMEPROMPT,
        USER_DATA_DIR,
        CHAT_HISTORIES_DIR,
        MAX_HISTORY,
        FREE_MESSAGE_LIMIT
    };
}

module.exports = {
    // Dynamic getter functions
    getNamePrompt,
    getUserDataDir,
    getChatHistoriesDir,
    getMaxHistory,
    getFreeMessageLimit,
    
    // Constants for backward compatibility
    NAMEPROMPT,
    USER_DATA_DIR,
    CHAT_HISTORIES_DIR,
    MAX_HISTORY,
    FREE_MESSAGE_LIMIT,
    
    // Function to reload config
    reloadConfig
};