const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs'); // For GOOGLE_KEY_FILE check and writing amo_fields.txt
const fsPromises = fs.promises; // For async file writing
// const { google } = require('googleapis'); // googleapis is now used via driveUtils
const config = require('./config');
const { getDriveService, downloadFileFromDrive } = require('./driveUtils'); // Import shared functions

let currentAccessToken = null;
let amoCustomFieldsDefinitions = null;

// Removed getDriveService() function - now imported
// Removed downloadFileFromDrive() function - now imported


// Fetches and processes AmoCRM custom field definitions
async function fetchAndProcessAmoCustomFieldDefinitions() {
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error('[AmoCF] Cannot fetch AmoCRM custom field definitions: API token is not available.');
        return false;
    }
    try {
        console.log('[AmoCF] Fetching AmoCRM custom field definitions...');
        const response = await axios.get(`${config.AMO_API_URL_BASE}/leads/custom_fields`, {
            headers: { Authorization: `Bearer ${tokenToUse}` },
        });

        // Save the raw custom fields data to amo_fields.txt
        try {
            await fsPromises.writeFile('amo_fields.txt', JSON.stringify(response.data, null, 2));
            console.log('[AmoCF] Successfully saved AmoCRM custom field definitions to amo_fields.txt');
        } catch (writeError) {
            console.error('[AmoCF] Error writing AmoCRM custom field definitions to amo_fields.txt:', writeError.message);
        }

        if (response.data && response.data._embedded && response.data._embedded.custom_fields) {
            amoCustomFieldsDefinitions = {};
            response.data._embedded.custom_fields.forEach(field => {
                amoCustomFieldsDefinitions[field.name] = field;
            });
            console.log('[AmoCF] Successfully fetched and processed AmoCRM custom field definitions.');
            return true;
        } else {
            console.error('[AmoCF] Failed to fetch custom field definitions: Invalid response structure.', response.data);
            return false;
        }
    } catch (error) {
        console.error('[AmoCF] Error fetching AmoCRM custom field definitions:', error.message);
        if (error.response) {
            console.error('[AmoCF] AmoCRM Error Response Status:', error.response.status);
            console.error('[AmoCF] AmoCRM Error Response Body:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

// updateAmoDeal function remains largely the same, as it interacts with AmoCRM API.
// The logic for custom field mapping, status checks, etc., is independent of the data source.
async function updateAmoDeal(dealNumber, data) {
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error(`[AmoDeal] Error updating deal ${dealNumber}: AmoCRM API token is not available.`);
        return;
    }
    if (!amoCustomFieldsDefinitions) {
        console.error(`[AmoDeal] Error updating deal ${dealNumber}: AmoCRM custom field definitions not loaded.`);
        // Attempt to load them if missing
        const loaded = await fetchAndProcessAmoCustomFieldDefinitions();
        if (!loaded) {
            console.error(`[AmoDeal] Halting update for deal ${dealNumber} as custom field definitions could not be loaded.`);
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
            console.log(`[AmoDeal] Deal ${dealNumber} not found in AMO CRM`);
            return;
        }

        const dealToUpdate = deals[0];
        const dealId = dealToUpdate.id;

        // --- STATUS CHECK LOGIC (remains the same) ---
        const statusAmoFieldNameKey = 'status';
        const statusAmoFieldName = config.AMO_CUSTOM_FIELD_NAMES[statusAmoFieldNameKey];

        if (!statusAmoFieldName) {
            console.warn(`[AmoDeal] Warning: AmoCRM field name for '${statusAmoFieldNameKey}' not configured. Status check skipped for deal ${dealNumber} (ID: ${dealId}).`);
        } else {
            const statusFieldDefinition = amoCustomFieldsDefinitions[statusAmoFieldName];
            if (!statusFieldDefinition) {
                console.warn(`[AmoDeal] Warning: Custom field definition for '${statusAmoFieldName}' not found. Status check skipped for deal ${dealNumber} (ID: ${dealId}).`);
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
                    console.log(`[AmoDeal] Deal ${dealNumber} (ID: ${dealId}) current status is "${currentStatusStringValue}" (non-empty). Update from sheet is blocked.`);
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
                console.warn(`[AmoDeal] Warning: No AmoCRM field name for internal key "${internalFieldName}". Skipping for deal ${dealNumber}.`);
                return;
            }
            const fieldDefinition = amoCustomFieldsDefinitions[amoFieldName];
            if (!fieldDefinition) {
                console.warn(`[AmoDeal] Warning: Custom field "${amoFieldName}" not in AmoCRM definitions. Skipping for deal ${dealNumber}.`);
                return;
            }
            const fieldId = fieldDefinition.id;
            let valuePayload = { value: sheetValue };

            if (['select', 'multiselect', 'radiobutton'].includes(fieldDefinition.type)) {
                if (sheetValue !== undefined && sheetValue !== null && String(sheetValue).trim() !== '') {
                    const enumOption = fieldDefinition.enums?.find(e => String(e.value).trim().toLowerCase() === String(sheetValue).trim().toLowerCase());
                    if (enumOption) valuePayload = { enum_id: enumOption.id };
                    else {
                        console.warn(`[AmoDeal] Warning: No enum for field "${amoFieldName}" (ID: ${fieldId}) value "${sheetValue}" for deal ${dealNumber}. Skipping.`);
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
                if (timestampValue === undefined) { console.warn(`[AmoDeal] Warning: Invalid date for "${amoFieldName}" for deal ${dealNumber}. Skipping.`); return; }
                valuePayload = { value: timestampValue };
            } else if (fieldDefinition.type === 'numeric' || internalFieldName === 'amount_issued') {
                let numValue = typeof sheetValue === 'string' ? parseFloat(String(sheetValue).replace(',', '.')) : (typeof sheetValue === 'number' ? sheetValue : NaN);
                if (isNaN(numValue)) { console.warn(`[AmoDeal] Warning: Not numeric "${sheetValue}" for "${amoFieldName}" for deal ${dealNumber}. Skipping.`); return; }
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
            console.log(`[AmoDeal] No valid custom fields to update for deal ${dealNumber} (ID: ${dealId}). Skipping PATCH.`);
            return;
        }
        const updatePayload = { id: dealId, custom_fields_values: customFieldsPayload };
        console.log(`[AmoDeal] Attempting to update deal ID ${dealId} with payload:`, JSON.stringify(updatePayload, null, 2));
        await axios.patch(`${config.AMO_API_URL_BASE}/leads/${dealId}`, updatePayload, {
            headers: { 'Authorization': `Bearer ${tokenToUse}`, 'Content-Type': 'application/json' },
        });
        console.log(`[AmoDeal] Updated deal ${dealNumber} (ID: ${dealId}) in AMO CRM`);
    } catch (error) {
        console.error(`[AmoDeal] Error updating deal ${dealNumber}:`, error.message);
        if (error.response) {
            console.error('[AmoDeal] AmoCRM Error Response Status:', error.response.status);
            console.error('[AmoDeal] AmoCRM Error Response Body:', JSON.stringify(error.response.data, null, 2));
        } else console.error('[AmoDeal] Error did not have a response object.');
    }
}

async function syncFromExcelSheet() {
    if (!config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO) {
        console.error('[ExcelSync] Cannot sync from Excel on Drive: GOOGLE_DRIVE_FILE_ID_EXCEL2AMO is not configured.');
        return;
    }
    if (!config.DEFAULT_SHEET_NAME) {
        console.error('[ExcelSync] Cannot sync from Excel on Drive: DEFAULT_SHEET_NAME is not configured.');
        return;
    }
    const tokenToUse = currentAccessToken || config.AMO_TOKEN;
    if (!tokenToUse) {
        console.error('[ExcelSync] Cannot sync from Excel on Drive: AmoCRM API token is not available.');
        return;
    }
    if (!amoCustomFieldsDefinitions) {
        console.warn('[ExcelSync] Custom field definitions not loaded. Sync from Excel on Drive might not work correctly.');
        const success = await fetchAndProcessAmoCustomFieldDefinitions();
        if (!success) {
            console.error("[ExcelSync] Failed to load custom field definitions on sync attempt. Aborting sync cycle.");
            return;
        }
    }

    let drive;
    try {
        drive = await getDriveService();
    } catch (authError) {
        console.error('[ExcelSync] Failed to authenticate with Google Drive for syncFromExcelSheet:', authError.message);
        return;
    }

    try {
        const fileId = config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO;
        const sheetName = config.DEFAULT_SHEET_NAME;

        const fileBuffer = await downloadFileFromDrive(drive, fileId, 'excel2amo'); // Pass context

        if (!fileBuffer) {
            console.log(`[ExcelSync] Excel file not found on Drive or failed to download for ID ${fileId}. Skipping sync.`);
            return;
        }

        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        if (!workbook.SheetNames.includes(sheetName)) {
            console.log(`[ExcelSync] Sheet "${sheetName}" not found in Excel file from Drive ID: ${fileId}. Skipping sync.`);
            return;
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: ["dealNumber", "paymentLink", "amount", "currency", "email", "card", "status"], range: 1 });

        if (rows.length === 0) {
            console.log(`[ExcelSync] No data found in Excel (2 amo) (Drive ID: ${fileId}, Sheet: ${sheetName})`);
            return;
        }
        console.log(`[ExcelSync] Found ${rows.length} rows in Excel (2Amo) (Drive ID: ${fileId}, Sheet: ${sheetName}). Processing...`);

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
        console.error(`[ExcelSync] Error syncing from Excel on Drive (ID: ${config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO}, Sheet: ${config.DEFAULT_SHEET_NAME}):`, error.message);
    }
}

async function startExcelSheetSync(accessToken) {
    if (!config.GOOGLE_DRIVE_FILE_ID_EXCEL2AMO) {
        console.log('[Excel2Amo] Excel (Drive) to AmoCRM sync not starting: GOOGLE_DRIVE_FILE_ID_EXCEL2AMO not configured.');
        return;
    }

    if (accessToken) {
        currentAccessToken = accessToken;
        console.log('[Excel2Amo] Starting Excel Sheet (from Drive) to AmoCRM sync using provided OAuth access token...');
    } else if (config.AMO_TOKEN) {
        currentAccessToken = null; // Will cause tokenToUse to pick up config.AMO_TOKEN
        console.warn('[Excel2Amo] Starting Excel Sheet (from Drive) to AmoCRM sync using AMO_TOKEN from .env as OAuth token was not provided.');
    } else {
        console.error('[Excel2Amo] Cannot start Excel Sheet (from Drive) to AmoCRM sync: No AmoCRM access token available.');
        return;
    }

    const definitionsLoaded = await fetchAndProcessAmoCustomFieldDefinitions();
    if (!definitionsLoaded) {
        console.error('[Excel2Amo] Halting Excel Sheet (from Drive) to AmoCRM sync due to failure in fetching custom field definitions.');
        return;
    }
    
    console.log('[Excel2Amo] Initial check of Excel Sheet (from Drive) for new rows to sync to AmoCRM...');
    await syncFromExcelSheet(); 
    setInterval(async () => {
        console.log('[Excel2Amo] Periodically checking Excel Sheet (from Drive) for new rows to sync to AmoCRM...');
        await syncFromExcelSheet();
    }, 1 * 60 * 1000); // Interval remains 1 minute
}

module.exports = {
    startExcelSheetSync
};
