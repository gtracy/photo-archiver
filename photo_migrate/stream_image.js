const Google = require('./google');
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { PassThrough } = require('stream');
const convert = require('heic-convert');
const pino = require('pino');
const logger = pino();

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

    // fetch metadata first to determine if it is HEIC
    const metadata = await google.getFileMetadata(fileId);
    const mimeType = metadata.mimeType ? metadata.mimeType.toLowerCase() : '';
    const filename = metadata.name ? metadata.name.toLowerCase() : '';
    const isHeic = mimeType.includes('heic') || mimeType.includes('heif') || filename.endsWith('.heic') || filename.endsWith('.heif');

    const driveResponse = await google.downloadFile(fileId);

    let uploadBody;
    if (isHeic) {
      logger.info({ fileId, filename, mimeType }, 'Detected HEIC file, downloading to buffer for conversion');
      const chunks = [];
      for await (const chunk of driveResponse.data) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
      }
      const inputBuffer = Buffer.concat(chunks);

      // Validate that the buffer actually contains HEIC data by checking
      // for the ISOBMFF 'ftyp' box signature at byte offset 4.
      // Google Drive sometimes auto-converts HEIC to JPEG during download,
      // so the metadata may say HEIC but the bytes are already JPEG.
      const isFtypBox = inputBuffer.length > 8 && inputBuffer.toString('ascii', 4, 8) === 'ftyp';

      if (isFtypBox) {
        logger.info({ fileId, bufferSize: inputBuffer.length }, 'Buffer confirmed as HEIC, converting to JPEG');
        uploadBody = await convert({
          buffer: inputBuffer,
          format: 'JPEG',
          quality: 1
        });
        logger.info({ fileId }, 'HEIC conversion completed successfully');
      } else {
        logger.info({ fileId, bufferSize: inputBuffer.length }, 'Buffer is not HEIC despite metadata, uploading as-is');
        uploadBody = inputBuffer;
      }
    } else {
      // Create a PassThrough stream to pipe the download stream
      const passThrough = new PassThrough();
      
      // Handle the Google Drive stream and pipe it to the PassThrough stream
      driveResponse.data
        .on('end', () => {
          logger.info({ fileId }, 'Done downloading file from Google Drive');
        })
        .on('error', (error) => {
          logger.error({ fileId, error: error.message }, '*** ERROR downloading file from Google Drive');
          passThrough.end(); // End the PassThrough stream if an error occurs
        })
        .pipe(passThrough);

      uploadBody = passThrough;
    }

    // Prepare S3 parameters
    const params = {
      Bucket: s3Bucket,
      Key: 'originals/' + s3Key,
      Body: uploadBody,
      StorageClass: 'GLACIER_IR'
    };

    // Upload the image to S3
    const uploader = new Upload({
      client: s3Client,
      params: params,
    });

    // Wait for the upload to S3 to finish
    logger.info({ s3Bucket, s3Key, isHeic }, 'Uploading image to S3');
    const s3_result = await uploader.done();
    logger.info({ s3Bucket, s3Key, location: s3_result.Location }, 'Image uploaded to S3 successfully');
    return {
      statusCode: 200,
      body: 'Image uploaded to S3 successfully.',
      s3_result: s3_result
    };

  } catch (error) {
    logger.error({ imageUrl, s3Key, error: error.message }, 'Error in stream_image process');
    throw error;
  }
}

