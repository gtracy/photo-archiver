jest.mock('pino', () => {
  return () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  });
});

const { google } = require('googleapis');
const Google = require('../google');

// Mock googleapis
jest.mock('googleapis', () => {
  const mockGet = jest.fn();
  const mockUpdate = jest.fn();
  const mockFilesGet = jest.fn();

  return {
    google: {
      auth: {
        GoogleAuth: jest.fn().mockImplementation(() => {
          return {
            getClient: jest.fn().mockResolvedValue({
              // Mock auth client
            })
          };
        })
      },
      sheets: jest.fn().mockImplementation(() => {
        return {
          spreadsheets: {
            values: {
              get: mockGet,
              update: mockUpdate
            }
          }
        };
      }),
      drive: jest.fn().mockImplementation(() => {
        return {
          files: {
            get: mockFilesGet
          }
        };
      })
    },
    // Keep reference to mocks so we can inspect them in tests
    _mockGet: mockGet,
    _mockUpdate: mockUpdate,
    _mockFilesGet: mockFilesGet
  };
});

const { _mockGet, _mockUpdate, _mockFilesGet } = require('googleapis');

describe('Google Client Wrapper', () => {
  let googleClient;

  beforeEach(() => {
    jest.clearAllMocks();
    googleClient = new Google();
  });

  it('should initialize auth client and Google API services', async () => {
    await googleClient.init();
    expect(google.auth.GoogleAuth).toHaveBeenCalled();
    expect(google.sheets).toHaveBeenCalled();
    expect(google.drive).toHaveBeenCalled();
  });

  it('should fetch sheet data successfully', async () => {
    await googleClient.init();
    _mockGet.mockResolvedValue({
      data: {
        values: [['Row 1 Col 1', 'Row 1 Col 2']]
      }
    });

    const values = await googleClient.getSheetData('sheet-id', 'A1:B1');

    expect(_mockGet).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      range: 'A1:B1'
    });
    expect(values).toEqual([['Row 1 Col 1', 'Row 1 Col 2']]);
  });

  it('should update cell data successfully', async () => {
    await googleClient.init();
    const mockResponse = { status: 200, data: { updatedCells: 1 } };
    _mockUpdate.mockResolvedValue(mockResponse);

    const res = await googleClient.updateCellData('sheet-id', 'Sheet1', 'C5', 'newValue');

    expect(_mockUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      range: 'Sheet1!C5',
      valueInputOption: 'RAW',
      resource: {
        values: [['newValue']]
      }
    });
    expect(res).toEqual(mockResponse);
  });

  it('should fetch file metadata from Drive', async () => {
    await googleClient.init();
    const mockMetadata = { name: 'photo.heic', mimeType: 'image/heic', size: '1000' };
    _mockFilesGet.mockResolvedValue({ data: mockMetadata });

    const metadata = await googleClient.getFileMetadata('fileId123');

    expect(_mockFilesGet).toHaveBeenCalledWith({
      fileId: 'fileId123',
      fields: 'name, mimeType, size'
    });
    expect(metadata).toEqual(mockMetadata);
  });

  it('should download a file stream from Drive', async () => {
    await googleClient.init();
    const mockStream = {};
    _mockFilesGet.mockResolvedValue(mockStream);

    const stream = await googleClient.downloadFile('fileId123');

    expect(_mockFilesGet).toHaveBeenCalledWith(
      { fileId: 'fileId123', alt: 'media' },
      { responseType: 'stream' }
    );
    expect(stream).toBe(mockStream);
  });
});
