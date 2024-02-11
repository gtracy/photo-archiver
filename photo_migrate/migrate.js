const dotenv = require('dotenv-json')();
const stream_image = require('./stream_image');
const fetchSheetRow = require('./fetch');
const Google = require('./google');

async function migrateRow(row) {
    // setup a google api client
    const google = new Google();
    await google.init();

    const row_data = await fetchSheetRow(row);    
    const media_url = row_data.media_url;
    if( media_url ) {
        console.log('image found... stream to S3');
        console.log('date -> '+row_data.date_string);
        const result = await stream_image.stream(media_url,row_data.date_string+'.jpg');
        if( result.statusCode != 200 ) {
            console.error('Error streaming image to S3');
            console.dir(result);
            return;
        }

        try {
            // this is a hack because the aws-sdk sometimes returns a url with a double encoded %2F
            const decoded_location = decodeURIComponent(result.s3_result.Location);

            // there is a background task that resizes the image.
            // modify the s3 location to point to this new image.
            const s3_location = decoded_location.split(stream_image.getS3KeyPrefix()).join('');
            console.log('updating google sheet... '+s3_location);
            const sheet_result = await google.updateCellData(
                process.env.GOOGLE_SHEET_ID, 
                process.env.GOOGLE_SHEET_NAME, 
                'C' + row, 
                s3_location);
            if( sheet_result.status != 200 ) {
                console.error('Error updating google sheet');
                console.dir(sheet_result);
                return;
            }
        } catch (e) {
            console.error(e);
        }
    } else {
        console.log('no image found... skipping');
    }
}
module.exports = migrateRow;

// this enables you to run the script directly from the CLI
// e.g. node migrate.js 123
//
if (require.main === module) {

    (async () => {
        const pause_msec = Math.floor(Math.random() * (3987 - 500 + 1)) + 500;
        // first row with media - 1935
        const start_row = 1935;
        const end_row = 2000;

        // Migrate a specific row
        if( process.argv.length == 3 ) {
            const row = process.argv[2];
            await migrateRow(row);
        } else {
            for(let i=start_row; i<=end_row; i++) {
                console.log(i);
                await migrateRow(i);
                await new Promise(resolve => setTimeout(resolve, pause_msec));
            }
        }
    })();

}
