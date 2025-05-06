const axios = require('axios');
const { google } = require('googleapis');
const config = require('./config');

const sheets = google.sheets('v4');
let currentAccessToken = null;
let amoCustomFieldsDefinitions = null; // To store fetched custom field definitions

async function authenticateGoogle() {
    const auth = new google.auth.GoogleAuth({
        keyFile: config.GOOGLE_KEY_FILE, // Align with other modules, use from config
        scopes: config.GOOGLE_SCOPES,    // Use from config
    });
    return auth.getClient();
}

// Fetches and processes AmoCRM custom field definitions
async function fetchAndProcessAmoCustomFieldDefinitions() {
    const tokenToUse = currentAccessToken || config.AMO_TOKEN; // config.AMO_TOKEN is a fallback
    if (!tokenToUse) {
        console.error('Cannot fetch AmoCRM custom field definitions: API token is not available.');
        return false;
    }
    try {
        console.log('Fetching AmoCRM custom field definitions...');
        const response = await axios.get(`${config.AMO_API_URL_BASE}/leads/custom_fields`, {
            headers: { Authorization: `Bearer ${tokenToUse}` },
        });
        if (response.data && response.data._embedded && response.data._embedded.custom_fields) {
            amoCustomFieldsDefinitions = {};
            response.data._embedded.custom_fields.forEach(field => {
                amoCustomFieldsDefinitions[field.name] = field; // Store by field name
            });
            console.log('Successfully fetched and processed AmoCRM custom field definitions.');
            return true;
        } else {
            console.error('Failed to fetch custom field definitions: Invalid response structure.', response.data);
            return false;
        }
    } catch (error) {
        console.error('Error fetching AmoCRM custom field definitions:', error.message);
        if (error.response) {
            console.error('AmoCRM Error Response Status:', error.response.status);
            console.error('AmoCRM Error Response Body:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

async function updateAmoDeal(dealNumber, data) {
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error(`Error updating deal ${dealNumber}: AmoCRM API token is not available.`);
        return;
    }
    if (!amoCustomFieldsDefinitions) {
        console.error(`Error updating deal ${dealNumber}: AmoCRM custom field definitions not loaded.`);
        return;
    }

    try {
        const getLeadResponse = await axios.get(`${config.AMO_API_URL_BASE}/leads`, {
            headers: { Authorization: `Bearer ${tokenToUse}` },
            params: { query: dealNumber },
        });

        const deals = getLeadResponse.data._embedded.leads;
        if (!deals || deals.length === 0) {
            console.log(`Deal ${dealNumber} not found in AMO CRM`);
            return;
        }

        const dealId = deals[0].id;
        const currentUnixTimestamp = Math.floor(new Date().getTime() / 1000);
        const customFieldsPayload = [];

        const addCustomFieldIfValid = (internalFieldName, sheetValue) => {
            const amoFieldName = config.AMO_CUSTOM_FIELD_NAMES[internalFieldName];
            if (!amoFieldName) {
                console.warn(`Warning: No AmoCRM field name configured for internal key "${internalFieldName}". Skipping.`);
                return;
            }

            const fieldDefinition = amoCustomFieldsDefinitions[amoFieldName];
            if (!fieldDefinition) {
                console.warn(`Warning: Custom field "${amoFieldName}" not found in fetched AmoCRM definitions. Skipping.`);
                return;
            }

            const fieldId = fieldDefinition.id;
            let valuePayload = { value: sheetValue }; // Default payload structure

            // Handle select, multiselect, radiobutton types by finding enum_id
            if (['select', 'multiselect', 'radiobutton'].includes(fieldDefinition.type)) {
                if (sheetValue !== undefined && sheetValue !== null && String(sheetValue).trim() !== '') {
                    const enumOption = fieldDefinition.enums 
                        ? fieldDefinition.enums.find(e => String(e.value).trim().toLowerCase() === String(sheetValue).trim().toLowerCase()) 
                        : null;
                    if (enumOption) {
                        valuePayload = { enum_id: enumOption.id }; // Use enum_id for select types
                    } else {
                        console.warn(`Warning: No enum option found for field "${amoFieldName}" (ID: ${fieldId}) with value "${sheetValue}". Skipping this custom field.`);
                        return;
                    }
                } else {
                    return; // Skip if sheet value is empty for a select type
                }
            } else if (fieldDefinition.type === 'date' || fieldDefinition.type === 'date_time') {
                let timestampValue;
                if (typeof sheetValue === 'string' && !/^\d+$/.test(sheetValue)) { 
                    const parsedDate = new Date(sheetValue);
                    if (!isNaN(parsedDate.getTime())) {
                        timestampValue = Math.floor(parsedDate.getTime() / 1000);
                    } else {
                         if (internalFieldName === 'withdrawal_date') timestampValue = currentUnixTimestamp;
                         else {
                            console.warn(`Warning: Could not parse date string "${sheetValue}" for field "${amoFieldName}". Skipping.`);
                            return;
                         }
                    }
                } else if (typeof sheetValue === 'number') { 
                    timestampValue = sheetValue;
                } else if (internalFieldName === 'withdrawal_date') { 
                     timestampValue = currentUnixTimestamp;
                } else {
                    console.warn(`Warning: Invalid date value for field "${amoFieldName}". Skipping.`);
                    return; 
                }
                valuePayload = { value: timestampValue };

            } else if (fieldDefinition.type === 'numeric' || internalFieldName === 'amount_issued') {
                let numValue;
                if (typeof sheetValue === 'string') {
                    numValue = parseFloat(String(sheetValue).replace(',', '.'));
                    if (isNaN(numValue)) {
                        console.warn(`Warning: Could not parse numeric value "${sheetValue}" for field "${amoFieldName}". Skipping.`);
                        return;
                    }
                } else if (typeof sheetValue === 'number') {
                    numValue = sheetValue;
                } else {
                     console.warn(`Warning: Value "${sheetValue}" for numeric field "${amoFieldName}" is not a number. Skipping.`);
                     return;
                }
                valuePayload = { value: numValue };
            }
            // For other types (text, textarea, etc.), valuePayload remains { value: sheetValue }
            // Ensure sheetValue is not empty for these other types if that's a requirement
            else if (sheetValue === undefined || sheetValue === null || String(sheetValue).trim() === '') {
                // console.warn(`Warning: Empty value for non-select/date/numeric field "${amoFieldName}". Skipping.`);
                return; // Skip if value is empty for other types
            }


            // Check if valuePayload.value or valuePayload.enum_id is actually set
            if (valuePayload.hasOwnProperty('value') && (valuePayload.value === undefined || valuePayload.value === null || String(valuePayload.value).trim() === '')) {
                // If it's a 'value' type and it's empty, skip (unless it's a numeric 0 that's valid)
                if (valuePayload.value !== 0) return;
            }
            if (valuePayload.hasOwnProperty('enum_id') && (valuePayload.enum_id === undefined || valuePayload.enum_id === null)) {
                 return; // If it's an 'enum_id' type and it's not resolved, skip
            }


            customFieldsPayload.push({ field_id: fieldId, values: [valuePayload] });
        };
        
        // Populate custom fields from sheet data
        addCustomFieldIfValid('amount_issued', data.amount);
        addCustomFieldIfValid('currency', data.currency);
        addCustomFieldIfValid('card', data.card);
        addCustomFieldIfValid('email', data.email);
        addCustomFieldIfValid('status', data.status);

        // Add static/calculated fields
        addCustomFieldIfValid('withdrawal_account', 'Mastercard Prepaid');
        addCustomFieldIfValid('withdrawal_date', currentUnixTimestamp); // Will be handled by date logic
        addCustomFieldIfValid('administrator', 'Бот');
        addCustomFieldIfValid('paid_service', 'chatgpt');
        addCustomFieldIfValid('payment_term', '1');
        
        if (customFieldsPayload.length === 0) {
            console.log(`No valid custom field values to update for deal ${dealNumber} (ID: ${dealId}). Skipping PATCH request.`);
            return;
        }

        const updatePayload = {
            id: dealId,
            custom_fields_values: customFieldsPayload,
        };
        
        console.log(`Attempting to update deal ID ${dealId} with payload:`, JSON.stringify(updatePayload, null, 2));

        await axios.patch(`${config.AMO_API_URL_BASE}/leads/${dealId}`, updatePayload, {
            headers: { 
                'Authorization': `Bearer ${tokenToUse}`,
                'Content-Type': 'application/json'
            },
        });
        console.log(`Updated deal ${dealNumber} (ID: ${dealId}) in AMO CRM`);
    } catch (error) {
        console.error(`Error updating deal ${dealNumber}:`, error.message);
        if (error.response) {
            // Log the detailed error response from AmoCRM if available
            console.error('AmoCRM Error Response Status:', error.response.status);
            console.error('AmoCRM Error Response Body:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error did not have a response object (e.g., network error).');
        }
    }
}

async function syncFromGoogleSheet() {
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error('Cannot sync from Google Sheet: AmoCRM API token is not available.');
        return;
    }
    if (!amoCustomFieldsDefinitions) {
        console.warn('Custom field definitions not loaded. Sync from Google Sheet might not work correctly for select fields.');
        // Optionally, try to fetch them again here if they failed initially, or just proceed with caution.
        const success = await fetchAndProcessAmoCustomFieldDefinitions();
        if (!success) {
            console.error("Failed to load custom field definitions on sync attempt. Aborting sync cycle.");
            return;
        }
    }
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

async function startGoogleSheetSync(accessToken) { // Renamed for clarity
    if (accessToken) {
        currentAccessToken = accessToken;
        console.log('Starting Google Sheet to AmoCRM sync using provided OAuth access token...');
    } else if (config.AMO_TOKEN) { // Fallback to AMO_TOKEN from .env
        currentAccessToken = null; // Will cause tokenToUse to pick up config.AMO_TOKEN
        console.warn('Starting Google Sheet to AmoCRM sync using AMO_TOKEN from .env as OAuth token was not provided.');
    } else {
        console.error('Cannot start Google Sheet to AmoCRM sync: No AmoCRM access token available.');
        return;
    }

    const definitionsLoaded = await fetchAndProcessAmoCustomFieldDefinitions();
    if (!definitionsLoaded) {
        console.error('Halting Google Sheet to AmoCRM sync due to failure in fetching custom field definitions.');
        return;
    }
    
    console.log('Initial check of Google Sheet for new rows to sync to AmoCRM...');
    await syncFromGoogleSheet(); 
    setInterval(async () => {
        console.log('Periodically checking Google Sheet for new rows to sync to AmoCRM...');
        await syncFromGoogleSheet();
    }, 1 * 60 * 1000);
}

module.exports = {
    startGoogleSheetSync
};
