const path = require('path');
const fs = require('fs');
const pino = require('pino');
const logger = pino({ level: 'info' });

// Load env from photo_migrate/.env.json
const envPath = path.join(__dirname, '..', '.env.json');
const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
for (const key in env) {
  if (key === 'GOOGLE_APPLICATION_CREDENTIALS' && env[key].startsWith('.')) {
    process.env[key] = path.resolve(path.dirname(envPath), env[key]);
  } else {
    process.env[key] = env[key];
  }
}

const Google = require('../google');
const convert = require('heic-convert');

const FILE_ID = '1tu9fn1vBi62HO5uOZfyCN8E8B5qjjb7H';

async function run() {
  try {
    const google = new Google();
    await google.init();

    // Step 1: Fetch metadata
    logger.info('--- Step 1: Fetching file metadata from Google Drive ---');
    const metadata = await google.getFileMetadata(FILE_ID);
    logger.info({ name: metadata.name, mimeType: metadata.mimeType, size: metadata.size }, 'File metadata');

    // Step 2: Download the file
    logger.info('--- Step 2: Downloading file bytes ---');
    const driveResponse = await google.downloadFile(FILE_ID);
    const chunks = [];
    for await (const chunk of driveResponse.data) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
    const inputBuffer = Buffer.concat(chunks);
    logger.info({ bufferSize: inputBuffer.length }, 'Downloaded file to buffer');

    // Step 3: Inspect the actual bytes
    logger.info('--- Step 3: Inspecting buffer magic bytes ---');
    const first16Hex = inputBuffer.slice(0, 16).toString('hex');
    const offset4to8 = inputBuffer.toString('ascii', 4, 8);
    const isJpeg = inputBuffer[0] === 0xFF && inputBuffer[1] === 0xD8 && inputBuffer[2] === 0xFF;
    const isFtypBox = inputBuffer.length > 8 && offset4to8 === 'ftyp';
    logger.info({ first16Hex, offset4to8, isJpeg, isFtypBox }, 'Buffer inspection results');

    // Step 4: Run the conversion logic (same as stream_image.js)
    logger.info('--- Step 4: Running conversion logic ---');
    let outputBuffer;
    if (isFtypBox) {
      logger.info('Buffer confirmed as HEIC, converting to JPEG...');
      outputBuffer = await convert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 1
      });
      logger.info({ outputSize: outputBuffer.length }, 'HEIC conversion completed');
    } else {
      logger.info('Buffer is NOT HEIC despite metadata — uploading as-is');
      outputBuffer = inputBuffer;
    }

    // Step 5: Save the result locally
    const outputPath = path.join(__dirname, 'result-drive-test.jpg');
    fs.writeFileSync(outputPath, outputBuffer);
    logger.info({ outputPath, size: outputBuffer.length }, 'Saved output file');

    logger.info('--- Test completed successfully! ---');
    process.exit(0);

  } catch (error) {
    logger.error({ error: error.stack || error.message }, 'Test failed');
    process.exit(1);
  }
}

run();
