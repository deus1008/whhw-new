import { getDocumentProxy, extractText as pdfExtractText } from 'unpdf';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  switch (fileType) {
    case 'pdf':  return extractPdf(buffer);
    case 'docx': return extractDocx(buffer);
    case 'xlsx':
    case 'xls':  return extractExcel(buffer);
    default:
      throw new Error(`지원하지 않는 파일 형식: ${fileType}`);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await pdfExtractText(pdf, { mergePages: true });
  return text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractExcel(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet   = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    if (rawRows.length < 1) continue;

    const headers  = (rawRows[0] as unknown[]).map(h => String(h ?? '').trim());
    const dataRows = rawRows.slice(1) as unknown[][];

    parts.push(`[시트: ${sheetName}]`);

    for (const rawRow of dataRows) {
      const row = rawRow.map(c => String(c ?? '').trim());

      // 완전히 빈 행 건너뜀
      if (row.every(c => c === '')) continue;

      // 첫 번째 컬럼을 주어(subject)로, 나머지를 속성으로 표현
      // 예: "거래처 A사: 1월 5%, 2월 5.5%"
      const subject    = headers[0] && row[0] ? `${headers[0]} ${row[0]}` : row[0] ?? '';
      const attributes: string[] = [];

      for (let i = 1; i < headers.length; i++) {
        if (headers[i] && row[i] !== '') {
          attributes.push(`${headers[i]} ${row[i]}`);
        }
      }

      const sentence = attributes.length > 0
        ? `${subject}: ${attributes.join(', ')}`
        : subject;

      if (sentence.trim()) parts.push(sentence);
    }

    parts.push('');
  }

  return parts.join('\n');
}
