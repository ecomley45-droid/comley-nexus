// Minimal RFC4180-ish CSV codec — no dependency. Quotes any field containing
// a comma, quote, or newline; doubles embedded quotes. Shared by server.js's
// CMS export/import routes and lib/commerce/routes.js's commerce ones.

function quoteField(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// columns: [{ key, header }]
export function rowsToCsv(rows, columns) {
  const headerLine = columns.map((c) => quoteField(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => quoteField(row[c.key])).join(','));
  return [headerLine, ...lines].join('\r\n') + '\r\n';
}

// Parses into an array of plain objects keyed by the header row. Handles
// quoted fields (including embedded commas/newlines/escaped quotes).
export function csvToRows(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...dataRows] = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!header) return [];
  return dataRows.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])));
}
