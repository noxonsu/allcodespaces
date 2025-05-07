const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs'); // For GOOGLE_KEY_FILE check and writing amo_fields.txt
const fsPromises = fs.promises; // For async file writing
const { google } = require('googleapis');
const config = require('./config');

let currentAccessToken = null;
let amoCustomFieldsDefinitions = null;

async function getDriveService() { // Helper function, can be refactored into a shared module
    if (!fs.existsSync(config.GOOGLE_KEY_FILE)) {
        console.error(`Google Key File not found at ${config.GOOGLE_KEY_FILE}. Cannot authenticate with Google Drive.`);
        throw new Error(`Google Key File not found at ${config.GOOGLE_KEY_FILE}`);
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: config.GOOGLE_KEY_FILE,
        scopes: config.GOOGLE_SCOPES,
    });
    const authClient = await auth.getClient();
    return google.drive({ version: 'v3', auth: authClient });
}

async function downloadFileFromDrive(drive, fileId) { // Helper function
    try {
        console.log(`Attempting to get metadata for file from Google Drive with ID: ${fileId} for excel2amo.`);
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'mimeType, name',
        });
        console.log(`File ${fileId} metadata (excel2amo): MIME Type = ${fileMetadata.data.mimeType}, Name = ${fileMetadata.data.name}`);

        let response;
        if (fileMetadata.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
            console.log(`File ${fileId} (excel2amo) is a Google Sheet. Exporting as .xlsx...`);
            response = await drive.files.export({
                fileId: fileId,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }, { responseType: 'arraybuffer' });
            console.log(`Google Sheet ${fileId} (excel2amo) exported successfully as .xlsx.`);
        } else {
            console.log(`File ${fileId} (excel2amo) is not a Google Sheet (MIME Type: ${fileMetadata.data.mimeType}). Attempting direct download...`);
            response = await drive.files.get({
                fileId: fileId,
                alt: 'media',
            }, { responseType: 'arraybuffer' });
            console.log(`File ${fileId} (excel2amo) downloaded successfully from Google Drive.`);
        }
        return Buffer.from(response.data);
    } catch (error) {
        if (error.code === 404) {
            console.log(`File with ID ${fileId} not found on Google Drive for excel2amo.`);
            return null;
        }
        console.error(`Error downloading/exporting file ${fileId} from Google Drive for excel2amo:`, error.message);
        if (error.errors) console.error('Google API Errors (excel2amo):', error.errors);
        throw error;
    }
}


// Fetches and processes AmoCRM custom field definitions
async function fetchAndProcessAmoCustomFieldDefinitions() {
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error('Cannot fetch AmoCRM custom field definitions: API token is not available.');
        return false;
    }
    try {
        console.log('Fetching AmoCRM custom field definitions...');
        const response = await axios.get(`${config.AMO_API_URL_BASE}/leads/custom_fields`, {
            headers: { Authorization: `Bearer ${tokenToUse}` },
        });

        // Save the raw custom fields data to amo_fields.txt
        try {
            await fsPromises.writeFile('amo_fields.txt', JSON.stringify(response.data, null, 2));
            console.log('Successfully saved AmoCRM custom field definitions to amo_fields.txt');
        } catch (writeError) {
            console.error('Error writing AmoCRM custom field definitions to amo_fields.txt:', writeError.message);
        }

        if (response.data && response.data._embedded && response.data._embedded.custom_fields) {
            amoCustomFieldsDefinitions = {};
            response.data._embedded.custom_fields.forEach(field => {
                amoCustomFieldsDefinitions[field.name] = field;
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

// updateAmoDeal function remains largely the same, as it interacts with AmoCRM API.
// The logic for custom field mapping, status checks, etc., is independent of the data source.
async function updateAmoDeal(dealNumber, data) {
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error(`Error updating deal ${dealNumber}: AmoCRM API token is not available.`);
        return;
    }
    if (!amoCustomFieldsDefinitions) {
        console.error(`Error updating deal ${dealNumber}: AmoCRM custom field definitions not loaded.`);
        // Attempt to load them if missing
        const loaded = await fetchAndProcessAmoCustomFieldDefinitions();
        if (!loaded) {
            console.error(`Halting update for deal ${dealNumber} as custom field definitions could not be loaded.`);
            return;
        }
    }

    try {
        const getLeadResponse = await axios.get(`${config.AMO_API_URL_BASE}/leads`, {
            headers: { Authorization: `Bearer ${tokenToUse}` },
            params: { query: dealNumber },
        });

        const deals = getLeadResponse.data?._embedded?.leads;
        if (!deals || deals.length === 0) {
            console.log(`Deal ${dealNumber} not found in AMO CRM`);
            return;
        }

        const dealToUpdate = deals[0];
        const dealId = dealToUpdate.id;

        // --- STATUS CHECK LOGIC (remains the same) ---
        const statusAmoFieldNameKey = 'status';
        const statusAmoFieldName = config.AMO_CUSTOM_FIELD_NAMES[statusAmoFieldNameKey];

        if (!statusAmoFieldName) {
            console.warn(`Warning: AmoCRM field name for '${statusAmoFieldNameKey}' not configured. Status check skipped for deal ${dealNumber} (ID: ${dealId}).`);
        } else {
            const statusFieldDefinition = amoCustomFieldsDefinitions[statusAmoFieldName];
            if (!statusFieldDefinition) {
                console.warn(`Warning: Custom field definition for '${statusAmoFieldName}' not found. Status check skipped for deal ${dealNumber} (ID: ${dealId}).`);
            } else if (dealToUpdate.custom_fields_values) {
                const statusFieldId = statusFieldDefinition.id;
                const currentStatusCustomField = dealToUpdate.custom_fields_values.find(
                    cf => cf.field_id === statusFieldId
                );
                let currentStatusStringValue = null;
                if (currentStatusCustomField?.values?.[0]) {
                    const statusValueObject = currentStatusCustomField.values[0];
                    if (statusValueObject.enum !== undefined) currentStatusStringValue = String(statusValueObject.enum).trim();
                    else if (statusValueObject.enum_id !== undefined && ['select', 'multiselect', 'radiobutton'].includes(statusFieldDefinition.type) && statusFieldDefinition.enums) {
                        const foundEnum = statusFieldDefinition.enums.find(e => e.id === statusValueObject.enum_id);
                        if (foundEnum) currentStatusStringValue = String(foundEnum.value).trim();
                    } else if (statusValueObject.value !== undefined) currentStatusStringValue = String(statusValueObject.value).trim();
                }
                if (currentStatusStringValue !== null && currentStatusStringValue !== "") {
                    console.log(`Deal ${dealNumber} (ID: ${dealId}) current status is "${currentStatusStringValue}" (non-empty). Update from sheet is blocked.`);
                    return;
                }
            }
        }
        // --- END OF STATUS CHECK LOGIC ---

        const currentUnixTimestamp = Math.floor(new Date().getTime() / 1000);
        const customFieldsPayload = [];

        const addCustomFieldIfValid = (internalFieldName, sheetValue) => {
            const amoFieldName = config.AMO_CUSTOM_FIELD_NAMES[internalFieldName];
            if (!amoFieldName) {
                console.warn(`Warning: No AmoCRM field name for internal key "${internalFieldName}". Skipping.`);
                return;
            }
            const fieldDefinition = amoCustomFieldsDefinitions[amoFieldName];
            if (!fieldDefinition) {
                console.warn(`Warning: Custom field "${amoFieldName}" not in AmoCRM definitions. Skipping.`);
                return;
            }
            const fieldId = fieldDefinition.id;
            let valuePayload = { value: sheetValue };

            if (['select', 'multiselect', 'radiobutton'].includes(fieldDefinition.type)) {
                if (sheetValue !== undefined && sheetValue !== null && String(sheetValue).trim() !== '') {
                    const enumOption = fieldDefinition.enums?.find(e => String(e.value).trim().toLowerCase() === String(sheetValue).trim().toLowerCase());
                    if (enumOption) valuePayload = { enum_id: enumOption.id };
                    else {
                        console.warn(`Warning: No enum for field "${amoFieldName}" (ID: ${fieldId}) value "${sheetValue}". Skipping.`);
                        return;
                    }
                } else return;
            } else if (fieldDefinition.type === 'date' || fieldDefinition.type === 'date_time') {
                let timestampValue;
                if (typeof sheetValue === 'string' && !/^\d+$/.test(sheetValue)) {
                    const parsedDate = new Date(sheetValue);
                    timestampValue = !isNaN(parsedDate.getTime()) ? Math.floor(parsedDate.getTime() / 1000) : (internalFieldName === 'withdrawal_date' ? currentUnixTimestamp : undefined);
                } else if (typeof sheetValue === 'number') timestampValue = sheetValue;
                else if (internalFieldName === 'withdrawal_date') timestampValue = currentUnixTimestamp;
                if (timestampValue === undefined) { console.warn(`Warning: Invalid date for "${amoFieldName}". Skipping.`); return; }
                valuePayload = { value: timestampValue };
            } else if (fieldDefinition.type === 'numeric' || internalFieldName === 'amount_issued') {
                let numValue = typeof sheetValue === 'string' ? parseFloat(String(sheetValue).replace(',', '.')) : (typeof sheetValue === 'number' ? sheetValue : NaN);
                if (isNaN(numValue)) { console.warn(`Warning: Not numeric "${sheetValue}" for "${amoFieldName}". Skipping.`); return; }
                valuePayload = { value: numValue };
            } else if (sheetValue === undefined || sheetValue === null || String(sheetValue).trim() === '') return;

            if (valuePayload.hasOwnProperty('value') && (valuePayload.value === undefined || valuePayload.value === null || String(valuePayload.value).trim() === '') && valuePayload.value !== 0) return;
            // Corrected typo: enum_id should be valuePayload.enum_id
            if (valuePayload.hasOwnProperty('enum_id') && (valuePayload.enum_id === undefined || valuePayload.enum_id === null)) return;
            
            customFieldsPayload.push({ field_id: fieldId, values: [valuePayload] });
        };
        
        addCustomFieldIfValid('amount_issued', data.amount);
        addCustomFieldIfValid('currency', data.currency);
        addCustomFieldIfValid('card', data.card);
        addCustomFieldIfValid('email', data.email);
        addCustomFieldIfValid('status', data.status);

        addCustomFieldIfValid('withdrawal_account', 'Mastercard Prepaid');
        addCustomFieldIfValid('withdrawal_date', currentUnixTimestamp);
        addCustomFieldIfValid('administrator', 'Бот');
        addCustomFieldIfValid('paid_service', 'chatgpt');
        addCustomFieldIfValid('payment_term', '1');
        
        if (customFieldsPayload.length === 0) {
            console.log(`No valid custom fields to update for deal ${dealNumber} (ID: ${dealId}). Skipping PATCH.`);
            return;
        }
        const updatePayload = { id: dealId, custom_fields_values: customFieldsPayload };
        console.log(`Attempting to update deal ID ${dealId} with payload:`, JSON.stringify(updatePayload, null, 2));
        await axios.patch(`${config.AMO_API_URL_BASE}/leads/${dealId}`, updatePayload, {
            headers: { 'Authorization': `Bearer ${tokenToUse}`, 'Content-Type': 'application/json' },
        });
        console.log(`Updated deal ${dealNumber} (ID: ${dealId}) in AMO CRM`);
    } catch (error) {
        console.error(`Error updating deal ${dealNumber}:`, error.message);
        if (error.response) {
            console.error('AmoCRM Error Response Status:', error.response.status);
            console.error('AmoCRM Error Response Body:', JSON.stringify(error.response.data, null, 2));
        } else console.error('Error did not have a response object.');
    }
}

async function syncFromExcelSheet() {
    if (!config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO) {
        console.error('Cannot sync from Excel on Drive: GOOGLE_DRIVE_FILE_ID_EXCEL2AMO is not configured.');
        return;
    }
    if (!config.DEFAULT_SHEET_NAME) {
        console.error('Cannot sync from Excel on Drive: DEFAULT_SHEET_NAME is not configured.');
        return;
    }
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error('Cannot sync from Excel on Drive: AmoCRM API token is not available.');
        return;
    }
    if (!amoCustomFieldsDefinitions) {
        console.warn('Custom field definitions not loaded. Sync from Excel on Drive might not work correctly.');
        const success = await fetchAndProcessAmoCustomFieldDefinitions();
        if (!success) {
            console.error("Failed to load custom field definitions on sync attempt. Aborting sync cycle.");
            return;
        }
    }

    let drive;
    try {
        drive = await getDriveService();
    } catch (authError) {
        console.error('Failed to authenticate with Google Drive for syncFromExcelSheet:', authError.message);
        return;
    }

    try {
        const fileId = config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO;
        const sheetName = config.DEFAULT_SHEET_NAME;

        const fileBuffer = await downloadFileFromDrive(drive, fileId);

        if (!fileBuffer) {
            console.log(`Excel file not found on Drive or failed to download for ID ${fileId}. Skipping sync.`);
            return;
        }

        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        if (!workbook.SheetNames.includes(sheetName)) {
            console.log(`Sheet "${sheetName}" not found in Excel file from Drive ID: ${fileId}. Skipping sync.`);
            return;
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: ["dealNumber", "paymentLink", "amount", "currency", "email", "card", "status"], range: 1 });

        if (rows.length === 0) {
            console.log(`No data found in Excel (2 amo) (Drive ID: ${fileId}, Sheet: ${sheetName})`);
            return;
        }
        console.log(`Found ${rows.length} rows in Excel (2Amo) (Drive ID: ${fileId}, Sheet: ${sheetName}). Processing...`);

        for (const row of rows) {
            const dealNumber = row.dealNumber ? String(row.dealNumber).trim() : null;
            if (dealNumber) {
                await updateAmoDeal(dealNumber, {
                    amount: row.amount,
                    currency: row.currency,
                    email: row.email,
                    card: row.card,
                    status: row.status
                });
            }
        }
    } catch (error) {
        console.error(`Error syncing from Excel on Drive (ID: ${config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO}, Sheet: ${config.DEFAULT_SHEET_NAME}):`, error.message);
    }
}

async function startExcelSheetSync(accessToken) {
    if (!config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO) {
        console.log('Excel (Drive) to AmoCRM sync not starting: GOOGLE_DRIVE_FILE_ID_EXCEL2AMO not configured.');
        return;
    }

    if (accessToken) {
        currentAccessToken = accessToken;
        console.log('Starting Excel Sheet (from Drive) to AmoCRM sync using provided OAuth access token...');
    } else if (config.AMO_TOKEN) {
        currentAccessToken = null; // Will cause tokenToUse to pick up config.AMO_TOKEN
        console.warn('Starting Excel Sheet (from Drive) to AmoCRM sync using AMO_TOKEN from .env as OAuth token was not provided.');
    } else {
        console.error('Cannot start Excel Sheet (from Drive) to AmoCRM sync: No AmoCRM access token available.');
        return;
    }

    const definitionsLoaded = await fetchAndProcessAmoCustomFieldDefinitions();
    if (!definitionsLoaded) {
        console.error('Halting Excel Sheet (from Drive) to AmoCRM sync due to failure in fetching custom field definitions.');
        return;
    }
    
    console.log('Initial check of Excel Sheet (from Drive) for new rows to sync to AmoCRM...');
    await syncFromExcelSheet(); 
    setInterval(async () => {
        console.log('Periodically checking Excel Sheet (from Drive) for new rows to sync to AmoCRM...');
        await syncFromExcelSheet();
    }, 1 * 60 * 1000); // Interval remains 1 minute
}

module.exports = {
    startExcelSheetSync
};
