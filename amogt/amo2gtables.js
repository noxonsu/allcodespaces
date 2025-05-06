const { google } = require('googleapis');

// Google Sheets API setup
if (!process.env.GOOGLE_CREDENTIALS || !process.env.SPREADSHEET_ID) {
    throw new Error('Required environment variables GOOGLE_CREDENTIALS and SPREADSHEET_ID must be set');
}

const sheets = google.sheets('v4');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';

async function authenticateGoogle() {
    const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_CREDENTIALS,
        scopes: SCOPES,
    });
    return auth.getClient();
}

async function pushToGoogleSheet(dealNumber, paymentLink) {
    try {
        const auth = await authenticateGoogle();
        const values = [[dealNumber, paymentLink]];
        const resource = { values };
        await sheets.spreadsheets.values.append({
            auth,
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:B`,
            valueInputOption: 'RAW',
            resource,
        });
        console.log(`Appended deal ${dealNumber} to Google Sheet`);
    } catch (error) {
        console.error('Error pushing to Google Sheet:', error.message);
    }
}

async function handleAmoWebhook(dealData) {
    const dealNumber = dealData.deal_number;
    const paymentLink = dealData.payment_link;
    if (dealNumber && paymentLink) {
        await pushToGoogleSheet(dealNumber, paymentLink);
    }
}

function startAmoWebhookListener() {
    console.log('Listening for AMO CRM webhooks...');
    // Implement webhook server setup here
}

module.exports = {
    startAmoWebhookListener,
    handleAmoWebhook
};
