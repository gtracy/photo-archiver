const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require('sharp');

const s3Client = new S3Client({ region: "us-east-2" }); 

function appendToFilename(filename, suffix) {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1) return filename + suffix; // No extension
    
    const name = filename.substring(0, dotIndex);
    const extension = filename.substring(dotIndex);
  
    return `${name}${suffix}${extension}`;
}

function stripPrefix(str, prefix) {
  if (str.startsWith(prefix)) {
    return str.slice(prefix.length);
  }
  return str; // or return null if you want to indicate no prefix was found
}

exports.handler = async (event) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

  // Get the object from S3
  const getObjectParams = {
    Bucket: bucket,
    Key: key,
  };
  const getObjectCommand = new GetObjectCommand(getObjectParams);
  const s3Object = await s3Client.send(getObjectCommand);
  const image = sharp(await streamToBuffer(s3Object.Body));

  // Get metadata to find original dimensions
  const metadata = await image.metadata();

  // Calculate new dimensions
  const newWidth = Math.round(metadata.width / 3);
  const newHeight = Math.round(metadata.height / 3);

  // Resize the image
  const resizedImage = await image.resize(newWidth, newHeight).withMetadata().toBuffer();

  // Strip the prefix and append a suffix for the new key
  // *** the string we are stripping must match the prefix in photo_migrate/stream_image ***
  const newKey = stripPrefix(key, 'originals/');

  // Upload the resized image to the specified bucket at the new key
  const putObjectParams = {
    Bucket: bucket,
    Key: newKey,
    Body: resizedImage,
  };
  const putObjectCommand = new PutObjectCommand(putObjectParams);
  await s3Client.send(putObjectCommand);
};

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
