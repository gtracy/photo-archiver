
const {google} = require('googleapis');

const Google = function() {
    var self = this;

    const auth = new google.auth.GoogleAuth({
        // Scopes can be specified either as an array or as a single, space-delimited string.
        scopes: ['https://www.googleapis.com/auth/spreadsheets',
                 'https://www.googleapis.com/auth/drive']
    });

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
        console.log('Download file: ' + fileId);
        const driveResponse = await this.drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );
        return driveResponse;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

/**
 * Delete a Drive file
 */
Google.prototype.deleteFile = async function(fileId) {
    try {
        await this.drive.files.delete({
            fileId: fileId,
        });
    } catch (error) {
        console.error('Google Error:', error);
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