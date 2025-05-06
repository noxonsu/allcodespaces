const { google } = require('googleapis');
const config = require('./config');

// Google Sheets API setup
// Check for required SPREADSHEET_ID_AMO2GT is now done in config.js

const sheets = google.sheets('v4');

async function authenticateGoogle() {
    const auth = new google.auth.GoogleAuth({
        keyFile: config.GOOGLE_KEY_FILE, // Use from config
        scopes: config.GOOGLE_SCOPES,    // Use from config
    });
    return auth.getClient();
}

async function pushToGoogleSheet(dealNumber, paymentLink) {
    try {
        const auth = await authenticateGoogle();
        const sheetsService = google.sheets({ version: 'v4', auth });

        // 1. Read existing deal numbers from Column A
        console.log(`Checking for existing Lead ID ${dealNumber} in Google Sheet: ${config.SPREADSHEET_ID_AMO2GT}, Sheet: ${config.DEFAULT_SHEET_NAME}`);
        let existingDealNumbers = [];
        try {
            const response = await sheetsService.spreadsheets.values.get({
                spreadsheetId: config.SPREADSHEET_ID_AMO2GT,
                range: `${config.DEFAULT_SHEET_NAME}!A:A`, // Read all of Column A
            });
            if (response.data.values) {
                existingDealNumbers = response.data.values.flat().map(id => String(id).trim());
            }
        } catch (error) {
            console.error(`Critical Error: Could not read existing deal numbers from sheet ID ${config.SPREADSHEET_ID_AMO2GT}. Error: ${error.message}`);
            console.error("Please verify that SPREADSHEET_ID_AMO2GT points to a valid Google Sheet and the service account has permissions.");
            if (error.message.includes("This operation is not supported for this document")) {
                console.error("This specific error indicates the ID likely does not point to a Google Sheet.");
            }
            return; // Stop further processing if sheet read fails
        }

        // 2. Check if the current dealNumber already exists
        if (existingDealNumbers.includes(String(dealNumber))) {
            console.log(`Lead ID ${dealNumber} already exists in Google Sheet. Skipping append.`);
            return; // Exit if deal number is already present
        }

        // 3. If not found, append the new row
        console.log(`Lead ID ${dealNumber} not found in Google Sheet. Appending new row.`);
        const values = [[String(dealNumber), paymentLink]]; // Ensure dealNumber is a string
        const resource = { values };
        await sheetsService.spreadsheets.values.append({
            // auth is already set in sheetsService
            spreadsheetId: config.SPREADSHEET_ID_AMO2GT,
            range: `${config.DEFAULT_SHEET_NAME}!A:B`, // Append to columns A and B
            valueInputOption: 'RAW',
            resource,
        });
        console.log(`Appended Lead ID ${dealNumber} and payment link to Google Sheet.`);
    } catch (error) {
        console.error(`Error in pushToGoogleSheet for Lead ID ${dealNumber}:`, error.message);
    }
}

async function handleAmoWebhook(dealData) {
    const targetCustomFieldName = "Ссылка на оплату";
    let paymentLink = null;
    // Assuming dealData.id is the unique identifier for the lead/deal
    const dealNumber = dealData && dealData.id ? String(dealData.id) : null;

    if (dealData && Array.isArray(dealData.custom_fields_values)) {
        const paymentLinkField = dealData.custom_fields_values.find(
            cf => cf.field_name === targetCustomFieldName
        );

        if (paymentLinkField && Array.isArray(paymentLinkField.values) && paymentLinkField.values.length > 0 && paymentLinkField.values[0].value) {
            paymentLink = String(paymentLinkField.values[0].value).trim();
            if (paymentLink === '') { // Treat empty string as no link
                paymentLink = null;
            }
        }
    }

    if (dealNumber && paymentLink) {
        console.log(`Processing lead ID ${dealNumber}: Found custom field "${targetCustomFieldName}" with value. Pushing to Google Sheet.`);
        await pushToGoogleSheet(dealNumber, paymentLink);
    } else {
        // Leads are skipped if dealNumber is missing or paymentLink is not found/empty.
        // This 'else' block means pushToGoogleSheet is NOT called.
        // The skipping is now silent for leads that had a dealNumber but didn't meet the paymentLink criteria.
        // For debugging purposes, you might want to log here, e.g.:
        // if (dealNumber && !paymentLink) {
        //   console.log(`[DEBUG] Lead ID ${dealNumber}: Custom field "${targetCustomFieldName}" not found or has no value. Silently skipping.`);
        // } else if (!dealNumber) {
        //   console.log(`[DEBUG] Silently skipping: dealData missing ID or dealData is null/undefined.`);
        // }
    }
}

function startAmoWebhookListener() {
    console.log('Listening for AMO CRM webhooks...');
    // Implement webhook server setup here
}

module.exports = {
    startAmoWebhookListener,
    handleAmoWebhook,
    pushToGoogleSheet // Export this function
};
