const fs = require('fs');
const { google } = require('googleapis');
const config = require('./config');

async function getDriveService() {
    if (!fs.existsSync(config.GOOGLE_KEY_FILE)) {
        const errorMessage = `[DriveUtil] Google Key File not found at ${config.GOOGLE_KEY_FILE}. Cannot authenticate with Google Drive.`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: config.GOOGLE_KEY_FILE,
            scopes: config.GOOGLE_SCOPES,
        });
        const authClient = await auth.getClient();
        return google.drive({ version: 'v3', auth: authClient });
    } catch (error) {
        console.error('[DriveUtil] Error creating Google Drive service:', error.message);
        throw error;
    }
}

async function downloadFileFromDrive(drive, fileId, context = '') {
    const logContext = context ? ` (${context})` : '';
    try {
        console.log(`[DriveUtil] Attempting to get metadata for file from Google Drive with ID: ${fileId}${logContext}`);
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'mimeType, name, modifiedTime', 
        });
        console.log(`[DriveUtil] File ${fileId} metadata${logContext}: MIME Type = ${fileMetadata.data.mimeType}, Name = ${fileMetadata.data.name}, Modified Time = ${fileMetadata.data.modifiedTime}`);

        let response;
        if (fileMetadata.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
            console.log(`[DriveUtil] File ${fileId}${logContext} is a Google Sheet. Exporting as .xlsx...`);
            response = await drive.files.export({
                fileId: fileId,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }, { responseType: 'arraybuffer' });
            console.log(`[DriveUtil] Google Sheet ${fileId}${logContext} exported successfully as .xlsx.`);
        } else {
            console.log(`[DriveUtil] File ${fileId}${logContext} is not a Google Sheet (MIME Type: ${fileMetadata.data.mimeType}). Attempting direct download...`);
            response = await drive.files.get({
                fileId: fileId,
                alt: 'media',
            }, { responseType: 'arraybuffer' });
            console.log(`[DriveUtil] File ${fileId}${logContext} downloaded successfully from Google Drive.`);
        }
        return Buffer.from(response.data);
    } catch (error) {
        if (error.code === 404) {
            console.log(`[DriveUtil] File with ID ${fileId}${logContext} not found on Google Drive.`);
            return null; // File not found
        }
        console.error(`[DriveUtil] Error downloading/exporting file ${fileId}${logContext} from Google Drive:`, error.message);
        if (error.errors) console.error(`[DriveUtil] Google API Errors${logContext}:`, error.errors);
        throw error; // Re-throw other errors
    }
}

module.exports = {
    getDriveService,
    downloadFileFromDrive,
};
