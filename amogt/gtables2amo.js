const axios = require('axios');
const { google } = require('googleapis');
const config = require('./config'); // Import the central config

// API setup
const sheets = google.sheets('v4');

async function authenticateGoogle() {
    const auth = new google.auth.GoogleAuth({
        keyFile: config.GOOGLE_KEY_FILE, // Align with other modules, use from config
        scopes: config.GOOGLE_SCOPES,    // Use from config
    });
    return auth.getClient();
}

async function updateAmoDeal(dealNumber, data) {
    try {
        const response = await axios.get(`${config.AMO_API_URL_BASE}/leads`, { // Use from config
            headers: { Authorization: `Bearer ${config.AMO_TOKEN}` }, // Use from config
            params: { query: dealNumber },
        });

        const deals = response.data._embedded.leads;
        if (!deals || deals.length === 0) {
            console.log(`Deal ${dealNumber} not found in AMO CRM`);
            return;
        }

        const dealId = deals[0].id;
        const currentDate = new Date().toISOString().split('T')[0];

        const updatePayload = {
            id: dealId,
            custom_fields_values: [
                { field_id: config.AMO_CUSTOM_FIELDS.amount_issued, values: [{ value: data.amount }] },
                { field_id: config.AMO_CUSTOM_FIELDS.currency, values: [{ value: data.currency }] },
                { field_id: config.AMO_CUSTOM_FIELDS.withdrawal_account, values: [{ value: 'Mastercard Prepaid' }] },
                { field_id: config.AMO_CUSTOM_FIELDS.withdrawal_date, values: [{ value: currentDate }] },
                { field_id: config.AMO_CUSTOM_FIELDS.administrator, values: [{ value: 'Бот' }] },
                { field_id: config.AMO_CUSTOM_FIELDS.card, values: [{ value: data.card }] },
                { field_id: config.AMO_CUSTOM_FIELDS.paid_service, values: [{ value: 'chatgpt' }] },
                { field_id: config.AMO_CUSTOM_FIELDS.email, values: [{ value: data.email }] },
                { field_id: config.AMO_CUSTOM_FIELDS.payment_term, values: [{ value: '1' }] },
                { field_id: config.AMO_CUSTOM_FIELDS.status, values: [{ value: data.status }] },
            ],
        };

        await axios.patch(`${config.AMO_API_URL_BASE}/leads/${dealId}`, updatePayload, { // Use from config
            headers: { Authorization: `Bearer ${config.AMO_TOKEN}` }, // Use from config
        });
        console.log(`Updated deal ${dealNumber} in AMO CRM`);
    } catch (error) {
        console.error(`Error updating deal ${dealNumber}:`, error.message);
    }
}

async function syncFromGoogleSheet() {
    try {
        const auth = await authenticateGoogle();
        const response = await sheets.spreadsheets.values.get({
            auth,
            spreadsheetId: config.SPREADSHEET_ID_GT2AMO, // Use from config
            range: `${config.DEFAULT_SHEET_NAME}!A:G`,    // Use from config
        });
        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.log('No data found in Google Sheet');
            return;
        }

        for (let i = 1; i < rows.length; i++) {
            const [dealNumber, paymentLink, amount, currency, email, card, status] = rows[i];
            if (dealNumber) { // Ensure dealNumber exists before trying to update
                await updateAmoDeal(dealNumber, { amount, currency, email, card, status });
            }
        }
    } catch (error) {
        console.error(`Error syncing from Google Sheet (ID: ${config.SPREADSHEET_ID_GT2AMO}, Sheet: ${config.DEFAULT_SHEET_NAME}):`, error.message);
    }
}

function startGoogleSheetSync() {
    console.log('Starting Google Sheet sync...');
    setInterval(async () => {
        console.log('Checking Google Sheet for new rows...');
        await syncFromGoogleSheet();
    }, 1 * 60 * 1000); // Changed to 1 minute
}

module.exports = {
    startGoogleSheetSync
};
