const dotenv = require('dotenv-json')();
const Google = require('./google');

module.exports = async function fetchSheetRow(row) {

    // setup a google api client
    const google = new Google();
    const response = await google.init();

    // fetch the memory dates from the sheet
    let data;
    let result_row;
    try {
        const sheet_range = "Form Responses 1!A"+row+":C"+row;
        console.log('fetch row ' + sheet_range);
        data = await google.getSheetData(process.env.GOOGLE_SHEET_ID, sheet_range);
        if( data.length === 0 || data.length > 1 ) {
            console.error('fetchSheetRow is borked');
            console.error(data);
            throw new Error("fetchSheetRow was unable to fetch a single row of data");
        }
        result_row = data[0];
    } catch (e) {
        console.error(e);
    }

    // determine if there is media to include. if so, we have to transform the 
    // link found in the sheet to be a link with the appropriate image content type
    // Example sheet link: https://drive.google.com/open?id=1ch51tiEYBdALwwmwUpSznmuVF47hUIqn
    // Example transformation: https://drive.google.com/uc?export=view&id=1ch51tiEYBdALwwmwUpSznmuVF47hUIqn
    const media = result_row[2];
    let media_url = undefined;
    // skip the transformation if there is no media 
    // -or- the media has already been migrated
    //
    if( media && media.toLowerCase().includes("google") ) {
        media_url = "https://drive.google.com/uc?export=view&id=" + media.split('id=')[1];
    } else {
        console.log("missing or processed image");
    }

    // format the date to a nice string
    const monthNames = ["january", "february", "march", "april", "may", "june",
                        "july", "august", "september", "october", "november", "december"];
    const date = new Date(result_row[0]);
    const year = date.getFullYear();
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const date_string = `${year}-${month}-${day}`;

    return({
        media_url: media_url,
        date_string: date_string,
        msg: result_row[1]
    });

}

