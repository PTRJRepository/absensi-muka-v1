import ExcelJS from 'exceljs';

export async function buildWorkbook(sheetName: string, rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const columns = Object.keys(rows[0] ?? { message: 'No data' });
  sheet.columns = columns.map((key) => ({ header: key, key }));
  rows.forEach((row) => sheet.addRow(row));
  return workbook.xlsx.writeBuffer();
}
