const { handler } = require('../resize');
const { S3Client, GetObjectCommand, PutObjectCommand, _mockSend } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const { Readable } = require('stream');

// Mock `@aws-sdk/client-s3`
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => {
      return {
        send: mockSend
      };
    }),
    GetObjectCommand: jest.fn().mockImplementation((params) => params),
    PutObjectCommand: jest.fn().mockImplementation((params) => params),
    _mockSend: mockSend
  };
});

// Mock `sharp`
jest.mock('sharp', () => {
  const mockMetadata = jest.fn().mockResolvedValue({ width: 900, height: 600 });
  const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('resized-image-bytes'));
  const mockResize = jest.fn().mockReturnThis();
  const mockWithMetadata = jest.fn().mockReturnThis();

  const sharpMock = jest.fn().mockImplementation(() => {
    return {
      metadata: mockMetadata,
      resize: mockResize,
      withMetadata: mockWithMetadata,
      toBuffer: mockToBuffer
    };
  });

  sharpMock._mockMetadata = mockMetadata;
  sharpMock._mockToBuffer = mockToBuffer;
  sharpMock._mockResize = mockResize;

  return sharpMock;
});

describe('Photo Resize Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch, resize, and upload the image successfully', async () => {
    // 1. Mock S3 GetObject to return a dummy read stream
    const mockStream = new Readable({
      read() {
        this.push(Buffer.from('mock-input-bytes'));
        this.push(null);
      }
    });
    _mockSend.mockResolvedValue({ Body: mockStream });

    // 2. Mock Event trigger (S3 PUT in originals/ folder)
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: 'memories-bucket'
            },
            object: {
              key: 'originals/2026-june-20.jpg'
            }
          },
          eventName: 'ObjectCreated:Put'
        }
      ]
    };

    // 3. Run resize handler
    await handler(event);

    // 4. Assert S3 download was called correctly
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'memories-bucket',
      Key: 'originals/2026-june-20.jpg'
    });

    // 5. Assert sharp image processing was called correctly (width / 3, height / 3)
    expect(sharp).toHaveBeenCalled();
    expect(sharp._mockResize).toHaveBeenCalledWith(300, 200); // 900/3, 600/3
    expect(sharp._mockToBuffer).toHaveBeenCalled();

    // 6. Assert S3 upload was called with stripped prefix ('originals/') and resized body
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'memories-bucket',
      Key: '2026-june-20.jpg',
      Body: Buffer.from('resized-image-bytes'),
      StorageClass: 'GLACIER_IR'
    });
  });
});
