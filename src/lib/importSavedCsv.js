import { toNumber, toIsoDate } from './parseExcel.js';
import { PLATFORMS } from './metrics.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_ROWS = 20000; // 플랫폼 리포트가 아니라 이미 합쳐진 우리 자체 파일이라 더 넉넉히 잡는다

// exportCsv.js가 만드는 파일에는 반드시 있는 컬럼들. 하나라도 없으면 이 도구에서
// 내려받은 파일이 아니라고 본다(네이버 등 플랫폼 리포트를 여기 잘못 올렸을 때 구분하기 위함).
const REQUIRED_COLUMNS = ['날짜', '채널', '광고비', '노출수', '클릭수', '전환수', '매출'];

function fail(error) {
  return { ok: false, error };
}

// 우리 자체 CSV만 읽는 최소 파서. exportCsv.js의 cell()이 만드는 형식(값에 쉼표·따옴표·
// 줄바꿈이 있으면 큰따옴표로 감싸고 내부 따옴표는 두 번 겹침)을 그대로 되돌린다.
//
// 이걸 xlsx 라이브러리로 읽지 않는 이유: SheetJS는 "2026-05-01"처럼 날짜처럼 생긴 문자열을
// 엑셀 날짜 일련번호로 자동 변환해버린다(스프레드시트 프로그램이 만든 파일을 상대하려면
// 필요한 동작이지만, 우리가 직접 만든 형식을 다시 읽을 땐 오히려 값을 망가뜨린다). 우리
// 형식은 우리가 정확히 알고 있으니 직접 파싱하는 게 더 정확하고, xlsx(430KB) 다운로드도
// 필요 없어져 이 기능만 쓸 때는 더 가볍다.
function parseCsvText(text) {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM 제거
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (inQuotes) {
      if (c === '"') {
        if (body[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// 화면에 보이는 채널 이름("네이버")을 내부에서 쓰는 id("naver")로 되돌린다.
// PLATFORMS에 없는(업로드로 새로 생긴) 채널은 애초에 이름=id로 내보내졌으니 그대로 쓰면 된다.
function platformIdFromName(name) {
  return PLATFORMS.find((p) => p.name === name)?.id ?? name;
}

/**
 * "CSV로 내려받기"가 만든 파일을 다시 읽어 원래 화면을 복원한다.
 *
 * 네이버·구글·메타·카카오 리포트(parseExcel.js가 처리)와는 다른 파일이다 — 이미 여러
 * 채널·제품이 한 파일에 합쳐져 있고, CTR·ROAS 같은 계산된 비율 컬럼도 같이 들어있다.
 * 그 계산된 값은 안 믿고 무시한다("합계를 먼저 내고 지표를 계산한다"는 원칙과 같은 이유로,
 * 다시 읽어들인 원본 카운트로 metrics.js가 처음부터 다시 계산하게 한다) — 광고비·노출수·
 * 클릭수·전환수·매출·마진율만 가져온다.
 */
export async function parseSavedCsv(file) {
  if (!file) return fail('파일이 없습니다.');
  if (file.size > MAX_FILE_BYTES) {
    return fail('파일이 너무 큽니다 (2MB 이하만 가능합니다).');
  }

  let text;
  try {
    text = await file.text();
  } catch {
    return fail('파일을 읽을 수 없습니다. 이 도구에서 내려받은 CSV 파일인지 확인하세요.');
  }

  const table = parseCsvText(text);
  if (table.length < 2) return fail('데이터가 없습니다. 헤더 아래에 최소 1행이 있어야 합니다.');
  if (table.length - 1 > MAX_ROWS) {
    return fail(`행이 너무 많습니다 (최대 ${MAX_ROWS}행, 지금 ${table.length - 1}행).`);
  }

  const headers = table[0];
  const missing = REQUIRED_COLUMNS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return fail(`이 도구에서 내려받은 CSV가 아닌 것 같습니다. 없는 컬럼: ${missing.join(', ')}`);
  }
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const hasProduct = headers.includes('제품');
  const hasMargin = headers.includes('마진율');

  const rows = [];
  for (let i = 1; i < table.length; i += 1) {
    const line = i + 1; // 1행은 헤더
    const cols = table[i];
    const get = (col) => cols[idx[col]];

    const date = toIsoDate(get('날짜'));
    if (!date) return fail(`${line}행의 날짜 값을 읽을 수 없습니다: "${get('날짜')}"`);

    const nums = {};
    for (const [key, col] of [['adSpend', '광고비'], ['impressions', '노출수'], ['clicks', '클릭수'], ['conversions', '전환수'], ['revenue', '매출']]) {
      const n = toNumber(get(col));
      if (!Number.isFinite(n) || n < 0) return fail(`${line}행의 '${col}' 값이 올바르지 않습니다: "${get(col)}"`);
      nums[key] = n;
    }

    let margin = null;
    if (hasMargin) {
      const rawVal = String(get('마진율') ?? '').trim();
      if (rawVal !== '') {
        const n = toNumber(rawVal);
        if (!Number.isFinite(n)) return fail(`${line}행의 '마진율' 값이 올바르지 않습니다: "${get('마진율')}"`);
        margin = n;
      }
    }

    rows.push({
      date,
      platform: platformIdFromName(String(get('채널') ?? '').trim()),
      product: hasProduct ? String(get('제품') ?? '').trim() : '전체',
      margin,
      ...nums,
    });
  }

  return { ok: true, rows };
}
