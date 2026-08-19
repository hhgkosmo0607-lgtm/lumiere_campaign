import { PLATFORM_COLUMNS } from './platforms';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_ROWS = 2000;

// 플랫폼이 이미 계산해서 주는 비율 컬럼(CTR·ROAS 등)은 안 받는다 — 이 필드들만 가져온다.
const NUMERIC_FIELDS = ['impressions', 'clicks', 'adSpend', 'conversions', 'revenue'];

function fail(error) {
  return { ok: false, error };
}

// "1,234" 같은 천단위 콤마·공백을 제거하고 숫자로 바꾼다. 실제 리포트 내보내기 형식을 대비.
function toNumber(raw) {
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw ?? '').replace(/,/g, '').trim();
  return cleaned === '' ? NaN : Number(cleaned);
}

function toIsoDate(raw) {
  const d = raw instanceof Date ? raw : new Date(String(raw).trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// 플랫폼 리포트 파일(.xlsx/.csv)을 읽어 표준 행 배열로 바꾼다.
// 실패하면 사람이 읽을 수 있는 한국어 에러 메시지를 돌려준다.
// product·margin은 여기서 안 붙인다 — 플랫폼 리포트엔 없는 값이라 업로드 화면에서
// 파일 단위로 따로 입력받아 나중에 합친다.
export async function parsePlatformFile(file, platform) {
  const columns = PLATFORM_COLUMNS[platform];
  if (!columns) return fail(`지원하지 않는 플랫폼입니다: ${platform}`);

  if (!file) return fail('파일이 없습니다.');
  if (file.size > MAX_FILE_BYTES) {
    return fail('파일이 너무 큽니다 (2MB 이하만 가능합니다).');
  }

  let workbook;
  let XLSX;
  try {
    // 대부분의 방문자는 이 파일을 한 번도 안 여니, 실제로 파일을 고를 때만 불러온다.
    XLSX = await import('xlsx');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (isCsv) {
      // CSV는 파일 API의 text()로 읽어야 UTF-8(한글 헤더 포함)이 제대로 디코딩된다.
      // arrayBuffer로 읽으면 한글 컬럼명이 깨져서 매칭에 실패한다.
      const text = await file.text();
      workbook = XLSX.read(text, { type: 'string', cellDates: true });
    } else {
      const buf = await file.arrayBuffer();
      workbook = XLSX.read(buf, { type: 'array', cellDates: true });
    }
  } catch {
    return fail('파일을 읽을 수 없습니다. 엑셀(.xlsx) 또는 CSV 파일인지 확인하세요.');
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return fail('시트를 찾을 수 없습니다.');

  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (raw.length === 0) return fail('데이터가 없습니다. 헤더 아래에 최소 1행이 있어야 합니다.');
  if (raw.length > MAX_ROWS) {
    return fail(`행이 너무 많습니다 (최대 ${MAX_ROWS}행, 지금 ${raw.length}행).`);
  }

  const headers = Object.keys(raw[0]);
  const missing = Object.values(columns).filter((native) => !headers.includes(native));
  if (missing.length > 0) {
    return fail(`이 플랫폼 리포트 형식이 아닌 것 같습니다. 없는 컬럼: ${missing.join(', ')}`);
  }

  const rows = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = i + 2; // 1행은 헤더
    const r = raw[i];

    const date = toIsoDate(r[columns.date]);
    if (!date) {
      return fail(`${line}행의 날짜 값을 읽을 수 없습니다: "${r[columns.date]}"`);
    }

    const values = {};
    for (const key of NUMERIC_FIELDS) {
      const n = toNumber(r[columns[key]]);
      if (!Number.isFinite(n)) {
        return fail(`${line}행의 '${columns[key]}' 값이 숫자가 아닙니다: "${r[columns[key]]}"`);
      }
      if (n < 0) {
        return fail(`${line}행의 '${columns[key]}' 값은 0 이상이어야 합니다: "${r[columns[key]]}"`);
      }
      values[key] = n;
    }

    rows.push({
      date,
      platform,
      campaign: String(r[columns.campaign] ?? '').trim(),
      adGroup: String(r[columns.adGroup] ?? '').trim(),
      ...values,
    });
  }

  return { ok: true, rows };
}
