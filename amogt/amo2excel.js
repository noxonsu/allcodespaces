const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('./config');

async function getDriveService() {
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

async function downloadFileFromDrive(drive, fileId) {
    try {
        console.log(`Attempting to get metadata for file from Google Drive with ID: ${fileId}`);
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'mimeType, name, modifiedTime', // Request mimeType, name, and modifiedTime
        });
        console.log(`File ${fileId} metadata: MIME Type = ${fileMetadata.data.mimeType}, Name = ${fileMetadata.data.name}, Modified Time = ${fileMetadata.data.modifiedTime}`);

        let response;
        if (fileMetadata.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
            console.log(`File ${fileId} is a Google Sheet. Exporting as .xlsx...`);
            response = await drive.files.export({
                fileId: fileId,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }, { responseType: 'arraybuffer' });
            console.log(`Google Sheet ${fileId} exported successfully as .xlsx.`);
        } else {
            console.log(`File ${fileId} is not a Google Sheet (MIME Type: ${fileMetadata.data.mimeType}). Attempting direct download...`);
            response = await drive.files.get({
                fileId: fileId,
                alt: 'media',
            }, { responseType: 'arraybuffer' });
            console.log(`File ${fileId} downloaded successfully from Google Drive.`);
        }
        return Buffer.from(response.data);
    } catch (error) {
        if (error.code === 404) {
            console.log(`File with ID ${fileId} not found on Google Drive.`);
            return null; // File not found
        }
        console.error(`Error downloading/exporting file ${fileId} from Google Drive:`, error.message);
        if (error.errors) console.error('Google API Errors:', error.errors);
        throw error; // Re-throw other errors
    }
}

async function uploadFileToDrive(drive, fileId, buffer, fileName) {
    try {
        console.log(`Attempting to upload/update file to Google Drive with ID: ${fileId}, Name: ${fileName}`);
        const media = {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: require('stream').Readable.from(buffer), // Use a readable stream
        };
        
        // Try to update first. If it fails with 404, it means the fileId might be new or permissions issue.
        // For simplicity, we'll assume fileId is for an existing file that needs update.
        // A more robust solution might check if file exists first or use create if update fails.
        await drive.files.update({
            fileId: fileId,
            media: media,
            // resource: { name: fileName } // Optionally update metadata like name
        });
        console.log(`File ${fileId} uploaded/updated successfully to Google Drive.`);
    } catch (error) {
        console.error(`Error uploading file ${fileId} to Google Drive:`, error.message);
        // If error.code is 404, it might mean the fileId doesn't exist.
        // A create operation would be needed:
        // await drive.files.create({ resource: { name: fileName, parents: ['YOUR_FOLDER_ID_IF ANY'] }, media: media, fields: 'id' });
        // For this script, we assume the file ID is valid for an update.
        throw error;
    }
}

async function pushToExcelSheet(dealNumber, paymentLink) {
    if (!config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
        console.error('Error in pushToExcelSheet: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL is not configured.');
        return;
    }
    if (!config.DEFAULT_SHEET_NAME) {
        console.error('Error in pushToExcelSheet: DEFAULT_SHEET_NAME is not configured.');
        return;
    }

    let drive;
    try {
        drive = await getDriveService();
    } catch (authError) {
        console.error('Failed to authenticate with Google Drive for pushToExcelSheet:', authError.message);
        return;
    }

    try {
        let workbook;
        const sheetName = config.DEFAULT_SHEET_NAME;
        console.log(`[pushToExcelSheet] Using sheetName from config: "${sheetName}"`); 

        const fileId = config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL;
        const excelFileName = `amo_output_${fileId}.xlsx`; 

        const fileBuffer = await downloadFileFromDrive(drive, fileId);

        let jsonData; // Will hold our sheet data as an array of arrays

        if (!fileBuffer) {
            console.error(`[CRITICAL ERROR in pushToExcelSheet] Failed to download or find Excel file from Google Drive with ID: ${fileId}.`);
            console.error(`Please ensure the file ID "${fileId}" configured in GOOGLE_DRIVE_FILE_ID_AMO2EXCEL is correct, the file exists on Google Drive, and the service account has 'Editor' permissions for this file.`);
            console.error(`Skipping operation for Deal Number ${dealNumber}.`);
            return; 
        }
        
        console.log(`[pushToExcelSheet] Processing existing Excel file from Google Drive: ${fileId}. File modifiedTime from Drive API: (see metadata log above)`);
        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        console.log(`[pushToExcelSheet] Workbook sheet names found: ${JSON.stringify(workbook.SheetNames)}`);

        if (workbook.SheetNames.includes(sheetName)) {
            console.log(`[pushToExcelSheet] Sheet "${sheetName}" found. Extracting data to jsonData.`);
            const existingWorksheet = workbook.Sheets[sheetName];
            jsonData = XLSX.utils.sheet_to_json(existingWorksheet, { header: 1, defval: "" }); // defval ensures empty cells become ""

            // Ensure jsonData is an array and has headers, even if sheet was technically empty or malformed
            if (!Array.isArray(jsonData) || jsonData.length === 0) {
                 console.log(`[pushToExcelSheet] Sheet "${sheetName}" was empty or unreadable as array of arrays. Initializing jsonData with headers.`);
                 jsonData = [["Deal Number", "Payment Link"]];
            } else {
                // Optional: Check if actual headers match expected, log if not.
                // For simplicity, we assume the first row is the header if the sheet exists.
                // if (jsonData[0][0] !== "Deal Number" || jsonData[0][1] !== "Payment Link") {
                //    console.warn(`[pushToExcelSheet] Headers in sheet "${sheetName}" (${JSON.stringify(jsonData[0])}) differ from expected ("Deal Number", "Payment Link").`);
                // }
            }
        } else {
            console.log(`[pushToExcelSheet] Sheet "${sheetName}" not found in downloaded file. Initializing jsonData with headers.`);
            jsonData = [["Deal Number", "Payment Link"]];
        }

        console.log(`[pushToExcelSheet] Checking for existing Lead ID ${dealNumber} in jsonData from sheet: ${sheetName}`);
        const existingDealNumbers = jsonData
            .slice(1) // Skip header row for checking
            .map(row => row && row[0] ? String(row[0]).trim() : null)
            .filter(id => id !== null);

        const dealNumberStr = String(dealNumber);
        console.log(`[pushToExcelSheet] Deal number to check: "${dealNumberStr}" (Type: ${typeof dealNumberStr})`);
        console.log(`[pushToExcelSheet] Existing deal numbers found in jsonData (count: ${existingDealNumbers.length}): ${JSON.stringify(existingDealNumbers)}`);
        
        if (existingDealNumbers.includes(dealNumberStr)) {
            console.log(`Lead ID ${dealNumberStr} already exists in Excel data (sheet "${sheetName}"). Skipping append.`);
            return;
        }

        console.log(`Lead ID ${dealNumberStr} not found in Excel data (sheet "${sheetName}"). Appending new row to jsonData.`);
        const newRow = [dealNumberStr, paymentLink];
        jsonData.push(newRow); // Append to our array of arrays

        // Create a new worksheet from the updated jsonData
        const newWorksheet = XLSX.utils.aoa_to_sheet(jsonData);
        console.log(`[pushToExcelSheet] New worksheet created from jsonData. !ref is: ${newWorksheet['!ref'] || 'N/A'}`);
        
        // Replace the old sheet or add the new one to the workbook
        workbook.Sheets[sheetName] = newWorksheet;
        if (!workbook.SheetNames.includes(sheetName)) {
            workbook.SheetNames.push(sheetName);
            // Optional: if you want the modified/new sheet to be the first one:
            // workbook.SheetNames = [sheetName, ...workbook.SheetNames.filter(name => name !== sheetName)];
        }

        const outputBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        await uploadFileToDrive(drive, fileId, outputBuffer, excelFileName);
        console.log(`Appended Lead ID ${dealNumber} and uploaded to Google Drive: ${fileId}`);

    } catch (error) {
        console.error(`Error in pushToExcelSheet for Lead ID ${dealNumber} (Drive ID: ${config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL}):`, error.message);
        console.error(error.stack); // Log stack for more details
    }
}

async function handleAmoWebhook(dealData) {
    const targetCustomFieldName = "Ссылка на оплату"; // This should match the name in your AmoCRM
    let paymentLink = null;
    const dealNumber = dealData && dealData.id ? String(dealData.id) : null;

    if (dealData && Array.isArray(dealData.custom_fields_values)) {
        const paymentLinkField = dealData.custom_fields_values.find(
            cf => cf.field_name === targetCustomFieldName
        );

        if (paymentLinkField && Array.isArray(paymentLinkField.values) && paymentLinkField.values.length > 0 && paymentLinkField.values[0].value) {
            paymentLink = String(paymentLinkField.values[0].value).trim();
            if (paymentLink === '') {
                paymentLink = null;
            }
        }
    }

    if (dealNumber && paymentLink) {
        if (!config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
            console.log(`Skipping push to Excel (Drive) for Lead ID ${dealNumber}: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL not configured.`);
            return;
        }
        console.log(`Processing lead ID ${dealNumber}: Found custom field "${targetCustomFieldName}" with value. Pushing to Excel Sheet on Google Drive.`);
        await pushToExcelSheet(dealNumber, paymentLink);
    } else {
        // Silently skip if dealNumber is missing or paymentLink is not found/empty.
    }
}

function startAmoWebhookListener() {
    if (!config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
        console.log('AmoCRM Webhook Listener (for Excel on Drive) not fully started: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL not configured.');
        return;
    }
    console.log('Conceptual: Listening for AMO CRM webhooks to push to Excel on Google Drive...');
}

module.exports = {
    startAmoWebhookListener,
    handleAmoWebhook,
    pushToExcelSheet
};
