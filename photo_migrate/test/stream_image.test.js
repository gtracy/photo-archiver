jest.mock('pino', () => {
  return () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  });
});

const streamImage = require('../stream_image');
const Google = require('../google');
const { Upload, _mockDone } = require('@aws-sdk/lib-storage');
const convert = require('heic-convert');
const { Readable } = require('stream');

// Mock external services
jest.mock('../google');
jest.mock('heic-convert');

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => {
      return {
        send: jest.fn()
      };
    })
  };
});

jest.mock('@aws-sdk/lib-storage', () => {
  const mockDone = jest.fn().mockImplementation(async function() {
    const body = this.params.Body;
    if (body && typeof body.on === 'function') {
      // Consume the stream to trigger the end events before returning
      await new Promise((resolve) => {
        body.on('data', () => {});
        body.on('end', resolve);
        body.on('error', resolve);
      });
    }
    return { Location: 'https://test-bucket.s3.amazonaws.com/originals/photo.jpg' };
  });

  return {
    Upload: jest.fn().mockImplementation(function(options) {
      this.params = options.params;
      this.done = mockDone.bind(this);
    }),
    _mockDone: mockDone
  };
});

describe('streamImage', () => {
  let mockGetFileMetadata;
  let mockDownloadFile;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.S3_BUCKET = 'test-bucket';

    mockGetFileMetadata = jest.fn();
    mockDownloadFile = jest.fn();

    Google.prototype.init = jest.fn().mockResolvedValue(undefined);
    Google.prototype.getFileMetadata = mockGetFileMetadata;
    Google.prototype.downloadFile = mockDownloadFile;
  });

  it('should stream standard images directly to S3 without conversion', async () => {
    // 1. Mock Google responses for standard image
    mockGetFileMetadata.mockResolvedValue({
      name: 'sunset.jpg',
      mimeType: 'image/jpeg'
    });

    const mockStream = new Readable();
    mockStream.push('dummy-image-data');
    mockStream.push(null);
    mockDownloadFile.mockResolvedValue({ data: mockStream });

    // 2. Run stream function
    const result = await streamImage.stream('https://drive.google.com/uc?id=123', 'sunset.jpg');

    // 3. Assertions
    expect(mockGetFileMetadata).toHaveBeenCalledWith('123');
    expect(mockDownloadFile).toHaveBeenCalledWith('123');
    expect(convert).not.toHaveBeenCalled(); // No HEIC conversion should happen
    expect(Upload).toHaveBeenCalled();

    // The S3 upload body should be a PassThrough/Stream, not a Buffer
    const uploadCallParams = Upload.mock.calls[0][0].params;
    expect(uploadCallParams.Key).toBe('originals/sunset.jpg');
    expect(uploadCallParams.Body).not.toBeInstanceOf(Buffer);

    expect(result).toEqual({
      statusCode: 200,
      body: 'Image uploaded to S3 successfully.',
      s3_result: { Location: 'https://test-bucket.s3.amazonaws.com/originals/photo.jpg' }
    });
  });

  it('should detect HEIC images, download to buffer, convert to JPEG, and upload to S3', async () => {
    // 1. Mock Google responses for HEIC image
    mockGetFileMetadata.mockResolvedValue({
      name: 'family_photo.heic',
      mimeType: 'image/heic'
    });

    const mockStream = new Readable();
    mockStream.push('heic-raw-bytes');
    mockStream.push(null);
    mockDownloadFile.mockResolvedValue({ data: mockStream });

    // Mock heic-convert behavior
    convert.mockResolvedValue(Buffer.from('converted-jpeg-bytes'));

    // 2. Run stream function
    const result = await streamImage.stream('https://drive.google.com/uc?id=456', 'family_photo.jpg');

    // 3. Assertions
    expect(mockGetFileMetadata).toHaveBeenCalledWith('456');
    expect(mockDownloadFile).toHaveBeenCalledWith('456');
    expect(convert).toHaveBeenCalledWith({
      buffer: Buffer.from('heic-raw-bytes'),
      format: 'JPEG',
      quality: 1
    });
    expect(Upload).toHaveBeenCalled();

    // The S3 upload body should be the converted buffer
    const uploadCallParams = Upload.mock.calls[0][0].params;
    expect(uploadCallParams.Key).toBe('originals/family_photo.jpg');
    expect(uploadCallParams.Body).toBeInstanceOf(Buffer);
    expect(uploadCallParams.Body.toString()).toBe('converted-jpeg-bytes');

    expect(result).toEqual({
      statusCode: 200,
      body: 'Image uploaded to S3 successfully.',
      s3_result: { Location: 'https://test-bucket.s3.amazonaws.com/originals/photo.jpg' }
    });
  });
});
