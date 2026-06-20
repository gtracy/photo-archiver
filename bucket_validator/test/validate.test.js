const { handler } = require('../validate');
const { S3Client, ListObjectsV2Command, _mockS3Send } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand, _mockSesSend } = require('@aws-sdk/client-ses');

// Mock `@aws-sdk/client-s3`
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => {
      return {
        send: mockSend
      };
    }),
    ListObjectsV2Command: jest.fn().mockImplementation((params) => params),
    _mockS3Send: mockSend
  };
});

// Mock `@aws-sdk/client-ses`
jest.mock('@aws-sdk/client-ses', () => {
  const mockSend = jest.fn();
  return {
    SESClient: jest.fn().mockImplementation(() => {
      return {
        send: mockSend
      };
    }),
    SendEmailCommand: jest.fn().mockImplementation((params) => params),
    _mockSesSend: mockSend
  };
});

describe('Bucket Validator Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.S3_BUCKET = 'memories-bucket';
  });

  it('should find missing resized files and send a summary email successfully', async () => {
    // 1. Mock S3 ListObjectsV2 responses
    _mockS3Send.mockImplementation(async (params) => {
      if (params.Prefix === '') {
        // Root bucket listing
        return {
          Contents: [
            { Key: '2026-june-20.jpg' }, // Resized image present
            { Key: 'originals/' },
            { Key: 'originals/2026-june-20.jpg' },
            { Key: 'originals/2026-june-21.jpg' } // Original present, but resized is missing
          ]
        };
      } else if (params.Prefix === 'originals/') {
        // Originals folder listing
        return {
          Contents: [
            { Key: 'originals/' },
            { Key: 'originals/2026-june-20.jpg' },
            { Key: 'originals/2026-june-21.jpg' },
            { Key: 'originals/2026-june-22.jpg' } // Original present, but resized is missing
          ]
        };
      }
      return { Contents: [] };
    });

    // 2. Mock SES send
    _mockSesSend.mockResolvedValue({ MessageId: 'msg-123' });

    // 3. Execute validator handler
    await handler({});

    // 4. Verify ListObjectsV2Command called for both root and originals
    expect(_mockS3Send).toHaveBeenCalledTimes(2);
    expect(ListObjectsV2Command).toHaveBeenCalledWith({
      Bucket: 'memories-bucket',
      Prefix: '',
      ContinuationToken: undefined
    });
    expect(ListObjectsV2Command).toHaveBeenCalledWith({
      Bucket: 'memories-bucket',
      Prefix: 'originals/',
      ContinuationToken: undefined
    });

    // 5. Verify email is compiled and sent with missing files list
    expect(SendEmailCommand).toHaveBeenCalled();
    const emailParams = SendEmailCommand.mock.calls[0][0];
    
    expect(emailParams.Source).toBe('gtracy@gmail.com');
    expect(emailParams.Destination.ToAddresses).toEqual(['gtracy@gmail.com']);
    expect(emailParams.Message.Subject.Data).toBe('Validation results for the memories photo archive');
    
    const emailBody = emailParams.Message.Body.Text.Data;
    expect(emailBody).toContain('Root object count: 4');
    
    // Check that missing files (2026-june-21.jpg and 2026-june-22.jpg) are in the email body
    expect(emailBody).toContain('2026-june-21.jpg');
    expect(emailBody).toContain('2026-june-22.jpg');
    // Ensure that present files (2026-june-20.jpg) are NOT marked as missing
    expect(emailBody).not.toContain('\n2026-june-20.jpg\n');
  });
});
