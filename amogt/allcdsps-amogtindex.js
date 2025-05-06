const dotenv = require('dotenv');
const path = require('path');
const { NAMEPROMPT } = require('./config');
const { startAmoWebhookListener } = require('./amo2gtables');
const { startGoogleSheetSync } = require('./gtables2amo');

const result = dotenv.config({ path: path.join(__dirname, `.env`) });
if (result.error) {
    console.error(`Ошибка загрузки файла .env.${NAMEPROMPT}:`, result.error);
    process.exit(1);
}

async function main() {
    // Start Task 1: AMO CRM to Google Sheets webhook listener
    startAmoWebhookListener();

    // Start Task 2: Google Sheets to AMO CRM sync
    startGoogleSheetSync();
}

main().catch((error) => console.error('Main error:', error.message));
