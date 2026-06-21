
const {google} = require('googleapis');
const util = require('util');
const pino = require('pino');
const logger = pino();

const Google = function() {
    var self = this;

    const authOptions = {
        // Scopes can be specified either as an array or as a single, space-delimited string.
        scopes: ['https://www.googleapis.com/auth/spreadsheets',
                 'https://www.googleapis.com/auth/drive']
    };

    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
            authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        } catch (e) {
            logger.error({ error: e.message }, 'Failed to parse GOOGLE_CREDENTIALS_JSON environment variable');
        }
    }

    const auth = new google.auth.GoogleAuth(authOptions);

    this.init = async function() {

        self.oauth2Client = await auth.getClient();            

        // build a sheets client object
        this.sheets = google.sheets({
            version: 'v4',
            auth: self.oauth2Client,
        });

        // build a drive client object
        this.drive = google.drive({
            version: 'v3',
            auth: self.oauth2Client,
        });
    };    
};

/**
 * Download a file from Google Drive
 */
Google.prototype.downloadFile = async function(fileId) {
    try {
        // Download the file from Google Drive
        logger.info({ fileId }, 'Downloading file from Google Drive');
        const driveResponse = await this.drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );
        return driveResponse;
    } catch (error) {
        logger.error({ fileId, error: error.message }, 'Error downloading file from Google Drive');
        throw error;
    }
}

/**
 * Get file metadata from Google Drive
 */
Google.prototype.getFileMetadata = async function(fileId) {
    try {
        logger.info({ fileId }, 'Fetching file metadata from Google Drive');
        const response = await this.drive.files.get({
            fileId: fileId,
            fields: 'name, mimeType, size'
        });
        logger.info({ fileId, name: response.data.name, mimeType: response.data.mimeType }, 'Successfully fetched file metadata');
        return response.data;
    } catch (error) {
        logger.error({ fileId, error: error.message }, 'Error fetching file metadata from Google Drive');
        throw error;
    }
}

/**
 * Fetch a list of data from a spreadsheet
 *
 */
Google.prototype.getSheetData = async function(sheetID, range) {

    try {

        let response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: sheetID,
            range: range
        });
        return response.data.values;

    } catch (e) {
        throw(e);
    }

};

/**
 * 
 * Update a specific cell in a spreadsheet
 * @param {*} sheetID 
 * @param {*} sheetName 
 * @param {*} cell 
 * @param {*} value 
 */
Google.prototype.updateCellData = async function(sheetID, sheetName, cell, value) {

    try {
        const response = await this.sheets.spreadsheets.values.update({
            spreadsheetId: sheetID,
            range: `${sheetName}!${cell}`,
            valueInputOption: 'RAW',
            resource: {
                values: [[value]],
            },
        });
        return(response);
    } catch(e) {
        throw(e);
    }
}
  

module.exports = Google;