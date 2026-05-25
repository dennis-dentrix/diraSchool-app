import * as XLSX from 'xlsx';

const REQUIRED_HEADERS = ['admissionnumber', 'firstname', 'lastname', 'gender'];

/**
 * Normalise a raw header string to a plain lowercase alpha key.
 * e.g. "Admission Number" → "admissionnumber"
 */
const normaliseKey = (h) => String(h).trim().toLowerCase().replace(/[^a-z]/g, '');

/**
 * Parse a single worksheet (array of row objects from SheetJS) into the
 * validated row shape expected by the import worker.
 *
 * Returns { rows, parseErrors }.
 */
function parseSheet(sheetRows) {
  const rows = [];
  const parseErrors = [];

  for (let i = 0; i < sheetRows.length; i++) {
    const raw = sheetRows[i];
    // Normalise all keys
    const row = {};
    for (const [k, v] of Object.entries(raw)) {
      row[normaliseKey(k)] = String(v ?? '').trim().replace(/^"|"$/g, '');
    }

    if (!row.admissionnumber && !row.firstname && !row.lastname) continue; // blank row

    if (!row.admissionnumber || !row.firstname || !row.lastname || !row.gender) {
      parseErrors.push({ row: i + 2, error: 'Missing required field' });
      continue;
    }

    const gender = row.gender.toLowerCase();
    if (gender !== 'male' && gender !== 'female') {
      parseErrors.push({ row: i + 2, error: `Invalid gender "${row.gender}" — must be male or female` });
      continue;
    }

    rows.push({
      admissionNumber: row.admissionnumber,
      firstName:       row.firstname,
      lastName:        row.lastname,
      gender,
      dateOfBirth:     row.dateofbirth || undefined,
      parentFirstName: row.parentfirstname || undefined,
      parentLastName:  row.parentlastname || undefined,
      parentPhone:     row.parentphone || undefined,
      parentEmail:     row.parentemail || undefined,
    });
  }

  return { rows, parseErrors };
}

/**
 * Parse an uploaded file buffer into one or more class import payloads.
 *
 * Supports: CSV, XLSX, XLS, ODS
 *
 * Returns one of:
 *   { mode: 'single', rows, parseErrors }            — CSV or single-sheet Excel
 *   { mode: 'multi',  sheets: [{ sheetName, rows, parseErrors }] }  — multi-sheet Excel
 *
 * Throws on unrecognised format or missing required columns.
 */
export function parseImportFile(buffer, originalname, mimetype) {
  const isCsv =
    mimetype === 'text/csv' ||
    mimetype === 'text/plain' ||
    mimetype === 'application/vnd.ms-excel' && originalname.toLowerCase().endsWith('.csv') ||
    originalname.toLowerCase().endsWith('.csv');

  if (isCsv) {
    const csvText = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = csvText.split('\n').filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      throw new Error('File must have a header row and at least one data row.');
    }

    const headers = lines[0].split(',').map(normaliseKey);
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(', ')}.`);
    }

    const sheetRows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
      sheetRows.push(row);
    }

    const { rows, parseErrors } = parseSheet(sheetRows);
    return { mode: 'single', rows, parseErrors };
  }

  // Excel / ODS — use SheetJS
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error('The Excel file contains no worksheets.');
  }

  const parsedSheets = sheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const sheetRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const { rows, parseErrors } = parseSheet(sheetRows);
    return { sheetName: name, rows, parseErrors };
  });

  if (sheetNames.length === 1) {
    const { rows, parseErrors } = parsedSheets[0];

    // Validate required columns exist
    if (rows.length === 0 && parseErrors.length === 0) {
      throw new Error('The worksheet appears to be empty.');
    }

    return { mode: 'single', rows, parseErrors };
  }

  return { mode: 'multi', sheets: parsedSheets };
}

/**
 * MIME types and extensions accepted for import files.
 */
export const IMPORT_ALLOWED_MIME = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.oasis.opendocument.spreadsheet',                    // ods
]);

export const IMPORT_ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.ods'];
