const dotenv = require('dotenv-json')();
const migrate = require('./migrate');
const fetch = require('./fetch');
const Google = require('./google');

const getToday = (data) => {

    // find today's date
    const today = new Date();
    const this_year = today.getFullYear();
    //today.setHours(0, 0, 0, 0);
    const centralTime = today.toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const centralDate = new Date(centralTime);
    console.log('Today is ' + centralDate.toDateString());

    // stash row numbers when we find matching dates
    let match = 0;
    data.forEach((timestamp, index) => {
        const date = new Date(timestamp[0]);
        const year = date.getFullYear();
        date.setHours(0, 0, 0, 0);
        if (date.getTime() === centralDate.getTime()) {
            console.log('Found matching date at row ' + (index + 1));
            // skip the header row
            match = index + 1;
        }
    });
    return {
        total_rows: parseInt(data.length,10),
        todays_row: match
    }
}

//
// The lambda handler has three modes of operation:
// 
//   1. Test Mode: If the event object contains a row_match property, then the script will
//      execute for that single row. This is useful for testing and can be used
//      via the AWS console.
//
//   2. Scan Mode: The script can run for all rows in the sheet and migrate all media that
//      has not yet been migrated. You can use an environment variable to specify the start
//      row to limit the scan scope.
//
//   3. Day Mode: The script can run for "today" by searching the sheet for today's date.
//      This is the default mode of operation when no other mode is specified.
// 
//
exports.handler = async (event) => {

    try {
        // setup a google api client
        const google = new Google();
        const response = await google.init();

        // test which mode the lambda function is running in
        //
        if( event.row_match ) {

            // testing mode: row number can be passed in via the event object
            console.log('TEST: Skipping sheet search with row ' + event.row_match);
            await migrate(event.row_match);

        } else if( process.env.SCAN_START_ROW ) {

            // scanning mode: scan sheet to find total number of rows
            let start_row = parseInt(process.env.SCAN_START_ROW,10);
            // find the last row in the sheet
            const data = await google.getSheetData(process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEET_RANGE);
            const end_row = start_row + getToday(data).total_rows - 1;
            console.dir(getToday(data));
            console.log('start: '+start_row);
            console.log('  end: '+end_row);

            // we can't do more than 50 rows at a time before we get
            // rate limited by Google so override SCAN_START_ROW when
            // the collection of works gets too big
            // BTW, this doesn't make any sense since the stated read limit
            // is 300 (https://developers.google.com/sheets/api/limits)
            const RATE_LIMIT_ROWS = 50
            if( end_row - start_row > RATE_LIMIT_ROWS ) {
                console.log('SCAN: override environment var ('+process.env.SCAN_START_ROW+')');
                start_row = end_row - 10;
            }

            console.log('SCAN: Scanning from ' + start_row + ' to ' + end_row);
            for(let i=start_row; i<=end_row; i++) {
                await migrate(i);
                await new Promise(resolve => setTimeout(resolve, 500));
            }

        } else {

            // day mode: search the sheet for today's date
            const data = await google.getSheetData(process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEET_RANGE);
            const row_match = getToday(data).todays_row;
            console.log('TODAY: Migrate today\'s entry : ' + row_match);
            if( row_match == 0 ) {
                console.error('... no matching date found in sheet');
            } else {
                await migrate(row_match);
            }

        }

    } catch (e) {
        console.error(e);
    }

}