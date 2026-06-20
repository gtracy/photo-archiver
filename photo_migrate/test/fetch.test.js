// Mock dotenv-json before requiring fetch
jest.mock('dotenv-json', () => {
  return jest.fn().mockReturnValue({});
});

const fetchSheetRow = require('../fetch');
const Google = require('../google');

// Mock Google class
jest.mock('../google');

describe('fetchSheetRow', () => {
  let mockGetSheetData;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSheetData = jest.fn();
    Google.prototype.init = jest.fn().mockResolvedValue(undefined);
    Google.prototype.getSheetData = mockGetSheetData;
    
    // Set dummy env variables
    process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
  });

  it('should parse row data with google drive media URL correctly', async () => {
    mockGetSheetData.mockResolvedValue([
      ['2026-06-20T12:00:00.000Z', 'Test message', 'https://drive.google.com/open?id=abc123xyz']
    ]);

    const result = await fetchSheetRow(5);

    expect(mockGetSheetData).toHaveBeenCalledWith('test-sheet-id', 'Form Responses 1!A5:C5');
    expect(result).toEqual({
      media_url: 'https://drive.google.com/uc?export=view&id=abc123xyz',
      date_string: '2026-june-20',
      msg: 'Test message'
    });
  });

  it('should handle processed or missing media links gracefully', async () => {
    mockGetSheetData.mockResolvedValue([
      ['2026-11-05T12:00:00.000Z', 'Another message', '']
    ]);

    const result = await fetchSheetRow(10);

    expect(result).toEqual({
      media_url: undefined,
      date_string: '2026-november-5',
      msg: 'Another message'
    });
  });

  it('should throw an error if multiple rows or no rows are returned', async () => {
    mockGetSheetData.mockResolvedValue([]);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchSheetRow(12)).rejects.toThrow('fetchSheetRow was unable to fetch a single row of data');
    consoleErrorSpy.mockRestore();
  });
});
