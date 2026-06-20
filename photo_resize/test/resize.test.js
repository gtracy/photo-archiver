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

// Helper: create a Readable stream from a Buffer
function bufferToStream(buffer) {
  return new Readable({
    read() {
      this.push(buffer);
      this.push(null);
    }
  });
}

// Helper: build a minimal S3 event
function makeEvent(bucket, key) {
  return {
    Records: [
      {
        s3: {
          bucket: { name: bucket },
          object: { key }
        },
        eventName: 'ObjectCreated:Put'
      }
    ]
  };
}

describe('Photo Resize Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // Resize path (image >= 256KB)
  // -------------------------------------------------------------------
  describe('when image is >= 256KB', () => {
    it('should fetch, resize, and upload the image', async () => {
      // Create a buffer that is exactly 256KB so the >= branch triggers
      const largeBuffer = Buffer.alloc(256 * 1024, 'x');
      _mockSend.mockResolvedValue({ Body: bufferToStream(largeBuffer) });

      await handler(makeEvent('memories-bucket', 'originals/2026-june-20.jpg'));

      // S3 download
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'memories-bucket',
        Key: 'originals/2026-june-20.jpg'
      });

      // sharp was invoked and resize called with dimensions / 3
      expect(sharp).toHaveBeenCalledWith(largeBuffer);
      expect(sharp._mockResize).toHaveBeenCalledWith(300, 200); // 900/3, 600/3

      // S3 upload with prefix stripped
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'memories-bucket',
        Key: '2026-june-20.jpg',
        Body: Buffer.from('resized-image-bytes'),
        StorageClass: 'GLACIER_IR'
      });
    });

    it('should resize a buffer that is larger than 256KB', async () => {
      const largeBuffer = Buffer.alloc(512 * 1024, 'y');
      _mockSend.mockResolvedValue({ Body: bufferToStream(largeBuffer) });

      await handler(makeEvent('my-bucket', 'originals/big-photo.png'));

      expect(sharp).toHaveBeenCalledWith(largeBuffer);
      expect(sharp._mockResize).toHaveBeenCalledWith(300, 200);
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'big-photo.png',
          Body: Buffer.from('resized-image-bytes')
        })
      );
    });
  });

  // -------------------------------------------------------------------
  // Skip-resize path (image < 256KB)
  // -------------------------------------------------------------------
  describe('when image is < 256KB', () => {
    it('should skip resize and upload the original buffer', async () => {
      const smallBuffer = Buffer.from('tiny-image');
      _mockSend.mockResolvedValue({ Body: bufferToStream(smallBuffer) });

      await handler(makeEvent('memories-bucket', 'originals/small-thumb.jpg'));

      // S3 download still happens
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'memories-bucket',
        Key: 'originals/small-thumb.jpg'
      });

      // sharp should NOT be called
      expect(sharp).not.toHaveBeenCalled();

      // Upload uses the original buffer, not a resized one
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'memories-bucket',
        Key: 'small-thumb.jpg',
        Body: smallBuffer,
        StorageClass: 'GLACIER_IR'
      });
    });

    it('should skip resize for a buffer that is 1 byte under the threshold', async () => {
      const justUnder = Buffer.alloc((256 * 1024) - 1, 'z');
      _mockSend.mockResolvedValue({ Body: bufferToStream(justUnder) });

      await handler(makeEvent('memories-bucket', 'originals/edge-case.jpg'));

      expect(sharp).not.toHaveBeenCalled();
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Body: justUnder
        })
      );
    });

    it('should log the skip message', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      const smallBuffer = Buffer.from('small');
      _mockSend.mockResolvedValue({ Body: bufferToStream(smallBuffer) });

      await handler(makeEvent('b', 'originals/photo.jpg'));

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('already under 256KB')
      );
      spy.mockRestore();
    });
  });

  // -------------------------------------------------------------------
  // Key handling
  // -------------------------------------------------------------------
  describe('key handling', () => {
    it('should strip the originals/ prefix from the destination key', async () => {
      const buf = Buffer.from('img');
      _mockSend.mockResolvedValue({ Body: bufferToStream(buf) });

      await handler(makeEvent('b', 'originals/subdir/photo.jpg'));

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'subdir/photo.jpg' })
      );
    });

    it('should leave keys without originals/ prefix unchanged', async () => {
      const buf = Buffer.from('img');
      _mockSend.mockResolvedValue({ Body: bufferToStream(buf) });

      await handler(makeEvent('b', 'other-prefix/photo.jpg'));

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'other-prefix/photo.jpg' })
      );
    });

    it('should decode URL-encoded keys (spaces as +)', async () => {
      const buf = Buffer.from('img');
      _mockSend.mockResolvedValue({ Body: bufferToStream(buf) });

      await handler(makeEvent('b', 'originals/my+photo+2026.jpg'));

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'originals/my photo 2026.jpg' })
      );
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'my photo 2026.jpg' })
      );
    });

    it('should decode percent-encoded key characters', async () => {
      const buf = Buffer.from('img');
      _mockSend.mockResolvedValue({ Body: bufferToStream(buf) });

      await handler(makeEvent('b', 'originals/caf%C3%A9.jpg'));

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'originals/café.jpg' })
      );
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'café.jpg' })
      );
    });
  });

  // -------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------
  describe('error handling', () => {
    it('should propagate S3 GetObject errors', async () => {
      _mockSend.mockRejectedValue(new Error('AccessDenied'));

      await expect(
        handler(makeEvent('b', 'originals/photo.jpg'))
      ).rejects.toThrow('AccessDenied');
    });

    it('should propagate S3 PutObject errors', async () => {
      const buf = Buffer.from('img');
      _mockSend
        .mockResolvedValueOnce({ Body: bufferToStream(buf) }) // GetObject succeeds
        .mockRejectedValueOnce(new Error('NoSuchBucket'));     // PutObject fails

      await expect(
        handler(makeEvent('b', 'originals/photo.jpg'))
      ).rejects.toThrow('NoSuchBucket');
    });
  });
});
