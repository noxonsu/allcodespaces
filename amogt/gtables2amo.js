const axios = require('axios');
const { google } = require('googleapis');

// API setup
const sheets = google.sheets('v4');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const AMO_DOMAIN = process.env.AMO_DOMAIN;
const AMO_TOKEN = process.env.AMO_TOKEN;
const AMO_API_URL = `https://${AMO_DOMAIN}.amocrm.com/api/v4/`;

// Custom field IDs
const customFields = {
    amount_issued: 100001,
    currency: 100002,
    withdrawal_account: 100003,
    withdrawal_date: 100004,
    administrator: 100005,
    card: 100006,
    paid_service: 100007,
    email: 100008,
    payment_term: 100009,
    status: 100010,
};

async function authenticateGoogle() {
    const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_CREDENTIALS,
        scopes: SCOPES,
    });
    return auth.getClient();
}

async function updateAmoDeal(dealNumber, data) {
    try {
        const response = await axios.get(`${AMO_API_URL}leads`, {
            headers: { Authorization: `Bearer ${AMO_TOKEN}` },
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
                { field_id: customFields.amount_issued, values: [{ value: data.amount }] },
                { field_id: customFields.currency, values: [{ value: data.currency }] },
                { field_id: customFields.withdrawal_account, values: [{ value: 'Mastercard Prepaid' }] },
                { field_id: customFields.withdrawal_date, values: [{ value: currentDate }] },
                { field_id: customFields.administrator, values: [{ value: 'Бот' }] },
                { field_id: customFields.card, values: [{ value: data.card }] },
                { field_id: customFields.paid_service, values: [{ value: 'chatgpt' }] },
                { field_id: customFields.email, values: [{ value: data.email }] },
                { field_id: customFields.payment_term, values: [{ value: '1' }] },
                { field_id: customFields.status, values: [{ value: data.status }] },
            ],
        };

        await axios.patch(`${AMO_API_URL}leads/${dealId}`, updatePayload, {
            headers: { Authorization: `Bearer ${AMO_TOKEN}` },
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
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:G`,
        });
        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.log('No data found in Google Sheet');
            return;
        }

        for (let i = 1; i < rows.length; i++) {
            const [dealNumber, paymentLink, amount, currency, email, card, status] = rows[i];
            await updateAmoDeal(dealNumber, { amount, currency, email, card, status });
        }
    } catch (error) {
        console.error(`Error syncing from Google Sheet (ID: ${SPREADSHEET_ID}, Sheet: ${SHEET_NAME}):`, error.message);
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
