const Google = require('./google');
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { PassThrough } = require('stream');

function extractGoogleDriveId(url) {
  const urlObj = new URL(url);
  return urlObj.searchParams.get('id');
}

module.exports.getS3KeyPrefix = () =>{
  return 'originals/';
}

module.exports.stream = async (imageUrl, s3Key) => {
  const s3Client = new S3Client({ region: "us-east-2" });
  const s3Bucket = process.env.S3_BUCKET;

  try {
    // setup a google api client
    const google = new Google();
    await google.init();
    const fileId = extractGoogleDriveId(imageUrl);
    const driveResponse = await google.downloadFile(fileId);

    // Create a PassThrough stream to pipe the download stream
    const passThrough = new PassThrough();

    // Prepare S3 parameters
    const params = {
      Bucket: s3Bucket,
      Key: 'originals/' + s3Key,
      Body: passThrough,
      StorageClass: 'GLACIER_IR'
    };

    // Upload the image to S3
    const uploader = new Upload({
      client: s3Client,
      params: params,
    });

    // Handle the Google Drive stream and pipe it to the PassThrough stream
    driveResponse.data
      .on('end', () => {
        console.log('Done downloading file from Google Drive.');
      })
      .on('error', (error) => {
        console.error('*** ERROR downloading file from Google Drive:', error);
        passThrough.end(); // End the PassThrough stream if an error occurs
      })
      .pipe(passThrough);

    // Wait for the upload to S3 to finish
    const s3_result = await uploader.done();
    return {
      statusCode: 200,
      body: 'Image uploaded to S3 successfully.',
      s3_result: s3_result
    };

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

