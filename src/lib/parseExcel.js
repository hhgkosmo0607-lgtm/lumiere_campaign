import { PLATFORM_COLUMNS } from './platforms.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_ROWS = 2000;

// 플랫폼이 이미 계산해서 주는 비율 컬럼(CTR·ROAS 등)은 안 받는다 — 이 필드들만 가져온다.
const NUMERIC_FIELDS = ['impressions', 'clicks', 'adSpend', 'conversions', 'revenue'];

// 엑셀 라이브러리는 용량이 커서(빌드하면 약 430KB짜리 별도 파일) 처음부터 받지 않고,
// 사용자가 실제로 파일을 고르는 순간에 받아온다. 배포 환경에선 네트워크 요청이라 실패할 수 있다.
// 실패한 약속(promise)을 그대로 남겨두면 새로고침 전까지 계속 같은 실패가 재사용되므로,
// 실패하면 비워서 다음 시도에 다시 받아오게 한다.
let xlsxPromise = null;
export function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx').catch((e) => {
      xlsxPromise = null;
      throw e;
    });
  }
  return xlsxPromise;
}

function fail(error) {
  return { ok: false, error };
}

// "1,234" 같은 천단위 콤마·공백을 제거하고 숫자로 바꾼다. 실제 리포트 내보내기 형식을 대비.
export function toNumber(raw) {
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw ?? '').replace(/,/g, '').trim();
  return cleaned === '' ? NaN : Number(cleaned);
}

const pad2 = (n) => String(n).padStart(2, '0');

// Date 객체에서 연·월·일을 '로컬 시간 기준'으로 읽는다. toISOString()을 쓰면 UTC로
// 환산되는데, xlsx는 엑셀의 날짜 셀을 로컬 자정 Date로 돌려주므로 한국(UTC+9)에서는
// 자정이 전날 15시로 바뀌어 날짜가 하루씩 밀린다.
const localIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function toIsoDate(raw) {
  // 엑셀의 진짜 날짜 셀(일련번호+날짜서식)은 xlsx가 Date 객체로 바꿔서 준다.
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : localIso(raw);
  }

  const s = String(raw ?? '').trim();

  // 이미 YYYY-MM-DD 형태면 Date를 거치지 않고 그대로 쓴다 — new Date('2026-05-01')은
  // UTC 자정으로 해석돼서, 시간대에 따라 앞뒤로 하루가 밀릴 수 있기 때문이다.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    // 2026-13-45처럼 형태만 맞고 실제로는 없는 날짜를 걸러낸다.
    const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (probe.getUTCFullYear() !== Number(y)
      || probe.getUTCMonth() !== Number(mo) - 1
      || probe.getUTCDate() !== Number(d)) return null;
    return `${y}-${mo}-${d}`;
  }

  // 그 밖의 형식("2026/05/01" 등)은 브라우저 파서에 맡긴다. 이런 형식은 로컬 자정으로
  // 해석되므로 여기서도 로컬 기준으로 읽어야 날짜가 안 밀린다.
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : localIso(parsed);
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

  // 엑셀 라이브러리를 먼저 확보한다. 이걸 파일 읽기와 같은 try에 묶으면, 라이브러리를
  // 못 받아왔을 때도 "파일이 잘못됐다"고 안내하게 돼서 사용자가 멀쩡한 파일을 계속 바꿔보게 된다.
  let XLSX;
  try {
    XLSX = await loadXlsx();
  } catch {
    return fail('엑셀을 읽는 기능을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. (파일 문제가 아닙니다)');
  }

  let workbook;
  try {
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
