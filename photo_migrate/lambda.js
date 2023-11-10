const dotenv = require('dotenv-json')();
const migrate = require('./migrate');
const fetch = require('./fetch');
const Google = require('./google');

const queryDates = (data) => {

    // find today's date
    const today = new Date();
    const this_year = today.getFullYear();
    today.setHours(0, 0, 0, 0);
    console.log('Today is ' + today.toDateString());

    // stash row numbers when we find matching dates
    let date_rows = [];
    let match = 0;
    data.forEach((timestamp, index) => {
        const date = new Date(timestamp[0]);
        const year = date.getFullYear();
        date.setHours(0, 0, 0, 0);
        if (date.getTime() === today.getTime()) {
            // skip the header row
            console.log('Found matching date at row ' + (index + 1));
            match = index + 1;
        }
    });
    return match;
}

exports.handler = async (event) => {

    // setup a google api client
    const google = new Google();
    const response = await google.init();

    // search the sheet and look for today's entry
    let row_match;
    try {
        const data = await google.getSheetData(process.env.GOOGLE_SHEET_ID, process.env.GOOGLE_SHEET_RANGE);
        row_match = queryDates(data);
        console.dir('Query rows for matchind date : ' + row_match);
        await migrate(row_match);
    } catch (e) {
        console.error(e);
    }

}