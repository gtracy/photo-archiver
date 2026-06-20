const fs = require('fs');
const path = require('path');
const convert = require('heic-convert');
const pino = require('pino');
const logger = pino();

async function convertFile(sampleName, resultName) {
  const samplePath = path.join(__dirname, sampleName);
  const resultPath = path.join(__dirname, resultName);

  if (!fs.existsSync(samplePath)) {
    throw new Error(`File not found: ${samplePath}`);
  }

  logger.info({ samplePath }, 'Reading local HEIC file');
  const inputBuffer = fs.readFileSync(samplePath);
  logger.info({ sampleName, size: inputBuffer.length }, 'Read HEIC file into buffer');

  logger.info({ sampleName }, 'Converting HEIC buffer to JPEG...');
  const outputBuffer = await convert({
    buffer: inputBuffer,
    format: 'JPEG',
    quality: 1
  });
  logger.info({ resultName, size: outputBuffer.length }, 'Successfully converted buffer to JPEG');

  fs.writeFileSync(resultPath, outputBuffer);
  logger.info({ resultPath }, 'Saved JPEG output to file');
}

async function runConversionTest() {
  try {
    logger.info('Starting batch conversion test...');
    
    // Process sample-1.heic
    logger.info('--- Processing File 1 ---');
    await convertFile('sample-1.heic', 'result-1.jpg');

    // Process sample-2.heic
    logger.info('--- Processing File 2 ---');
    await convertFile('sample-2.heic', 'result-2.jpg');

    logger.info('All conversions completed successfully!');
    process.exit(0);

  } catch (error) {
    logger.error({ error: error.stack || error.message }, 'Conversion test failed');
    process.exit(1);
  }
}

runConversionTest();
