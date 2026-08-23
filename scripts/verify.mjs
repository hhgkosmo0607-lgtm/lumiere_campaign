/**
 * 화면에 나오는 숫자가 맞는지 확인한다.  실행:  npm run verify
 *
 * 세 가지를 본다.
 *  1. 앱이 낸 값 vs 엑셀에서 직접 더한 값   — 계산식 자체가 맞는지 (scripts/verify/oracle.py)
 *  2. preview.html vs React                — 두 화면의 숫자가 같은지
 *  3. 광고를 안 돌린 주차 처리              — 0%가 아니라 '값 없음'으로 나오는지
 *
 * 1번이 핵심이다. 앱 안에서만 검사하면 계산식이 틀려도 "일관되게 틀린" 상태를 통과시킨다.
 * 파이썬 쪽은 프로젝트 코드를 한 줄도 쓰지 않고 엑셀을 직접 뜯어서 계산하므로,
 * 두 값이 같으면 컬럼 매핑·주차 나누기·합산 순서가 모두 맞다는 뜻이 된다.
 */
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parsePlatformFile } = await import(`${ROOT}/src/lib/parseExcel.js`);
const { derivePlatforms } = await import(`${ROOT}/src/lib/platforms.js`);
const M = await import(`${ROOT}/src/lib/metrics.js`);
const { buildCsv } = await import(`${ROOT}/src/lib/exportCsv.js`);
const { sortRows } = await import(`${ROOT}/src/lib/sort.js`);

let problems = 0;
const fail = (msg) => { problems += 1; console.log(`   ✗ ${msg}`); };

// 캠페인명에서 제품을 뽑는 규칙 — oracle.py와 같은 방식으로 맞춘다.
const productOf = (campaign) => campaign.replace(/[[\]]/g, '_').split('_')[0] || campaign;

async function loadFolder(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.xlsx')).sort();
  const raw = [];
  for (const f of files) {
    const platform = f.replace(/\.xlsx$/, '').split('-').at(-2);
    const res = await parsePlatformFile(new File([await readFile(path.join(dir, f))], f), platform);
    if (res.error) throw new Error(`${f}: ${res.error}`);
    raw.push(...res.rows.map((r) => ({ ...r, product: productOf(r.campaign), margin: 0.4 })));
  }
  return { rows: M.deriveWeeks(raw.map(M.withMetrics)), files };
}

// ---------- 1. 앱 계산 vs 엑셀 직접 계산 ----------
console.log('■ 앱이 낸 값 vs 엑셀에서 직접 더한 값');
let folders = [];
try {
  folders = (await readdir(`${ROOT}/scripts/native`, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
} catch { /* 폴더 자체가 없는 경우 아래에서 안내한다 */ }
if (folders.length === 0) {
  console.log('   샘플 리포트 파일이 없습니다. 먼저 `npm run samples` 를 실행해 주세요.');
  console.log('   (샘플은 저장소에 넣지 않고 필요할 때 만들어 씁니다)');
  process.exit(1);
}

const KEYS = ['adSpend', 'revenue', 'impressions', 'clicks', 'conversions',
              'ctr', 'cvr', 'cpc', 'roas', 'profit', 'roi', 'breakevenRoas'];

for (const folder of folders) {
  const dir = path.join(ROOT, 'scripts/native', folder);
  const { rows, files } = await loadFolder(dir);
  const truth = JSON.parse(execFileSync('python3',
    [path.join(ROOT, 'scripts/verify/oracle.py'), dir, '{}'], { encoding: 'utf-8', maxBuffer: 1 << 26 }));

  const platforms = derivePlatforms(rows);
  const products = [...new Set(rows.map((r) => r.product))];
  const trend = M.trendByPlatform(rows, platforms);

  const mine = { rowCount: rows.length, all: M.aggregate(rows) };
  for (const p of platforms) mine[`platform:${p.id}`] = M.aggregate(rows.filter((r) => r.platform === p.id));
  for (const p of products) mine[`product:${p}`] = M.aggregate(rows.filter((r) => r.product === p));
  for (const s of trend.series) {
    for (const pt of s.points) {
      mine[`trend:${s.id}:${pt.week}`] = pt.roas == null ? null
        : M.aggregate(rows.filter((r) => r.platform === s.id && r.week === pt.week));
    }
  }

  let checked = 0;
  if (mine.rowCount !== truth.rowCount) fail(`${folder}: 행 수 ${mine.rowCount} ≠ ${truth.rowCount}`);
  for (const key of Object.keys(truth)) {
    if (key === 'rowCount' || key === 'weeks') continue;
    const a = truth[key];
    const b = mine[key];
    if (a === null || b == null) {
      // 데이터가 없는 칸은 양쪽 다 '값 없음'이어야 한다
      if ((a === null) !== (b == null)) fail(`${folder} ${key}: 한쪽만 값 없음 (엑셀 ${a === null}, 앱 ${b == null})`);
      continue;
    }
    for (const k of KEYS) {
      checked += 1;
      const tol = Math.abs(a[k]) < 10 ? 1e-9 : Math.abs(a[k]) * 1e-9;
      if (Math.abs(a[k] - b[k]) > tol) fail(`${folder} ${key}.${k}: 엑셀 ${a[k]} ≠ 앱 ${b[k]}`);
    }
  }
  console.log(`   ${folder.padEnd(16)} ${files.length}파일 ${String(rows.length).padStart(5)}행 · ${checked}개 값 대조`);
}

// ---------- 2. preview.html vs React ----------
console.log('\n■ preview.html vs React (같은 데이터로 같은 값이 나오는지)');
const html = await readFile(`${ROOT}/preview.html`, 'utf-8');
const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g)
  .map((b) => b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))
  .reduce((a, b) => (a.length > b.length ? a : b));
const lines = script.split('\n');
const cut = lines.findIndex((l) => l.startsWith('function render()'));
if (cut < 0) fail('preview.html에서 render() 위치를 못 찾음 — 검사 스크립트를 손봐야 합니다');

globalThis.location = { search: '', href: 'http://x/', pathname: '/' };
globalThis.history = { replaceState() {} };
const P = new Function(lines.slice(0, cut).join('\n') +
  '\n; return { RAW, withMetrics, deriveWeeks, aggregate, byPlatform, byProduct, trendByPlatform, sortRows, buildCsv, PLATFORMS };')();

const rowsP = P.deriveWeeks(P.RAW.map(P.withMetrics));
const rowsR = M.deriveWeeks(P.RAW.map(M.withMetrics));
const cmp = (label, a, b) => {
  for (const k of KEYS) {
    if (a[k] == null && b[k] == null) continue;
    if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-9) fail(`${label}.${k}: preview ${a[k]} ≠ React ${b[k]}`);
  }
};
cmp('전체', P.aggregate(rowsP), M.aggregate(rowsR));
for (const p of M.PLATFORMS) {
  cmp(`채널 ${p.id}`, P.aggregate(rowsP.filter((r) => r.platform === p.id)),
                      M.aggregate(rowsR.filter((r) => r.platform === p.id)));
}
const tP = P.trendByPlatform(rowsP, P.PLATFORMS);
const tR = M.trendByPlatform(rowsR, M.PLATFORMS);
let pts = 0;
for (const s of tP.series) {
  const sr = tR.series.find((x) => x.id === s.id);
  s.points.forEach((pt, i) => {
    pts += 1;
    const o = sr.points[i];
    if ((pt.roas == null) !== (o.roas == null)) fail(`주차별 ${s.id} ${pt.week}주: 한쪽만 값 없음`);
    else if (pt.roas != null && Math.abs(pt.roas - o.roas) > 1e-9) fail(`주차별 ${s.id} ${pt.week}주: ${pt.roas} ≠ ${o.roas}`);
  });
}
const csvP = P.buildCsv(P.sortRows(rowsP, 'roas', 'desc'), { showProduct: true, showRoi: true });
const csvR = buildCsv(sortRows(rowsR, 'roas', 'desc', M.PLATFORMS),
                      { platforms: M.PLATFORMS, showProduct: true, showRoi: true });
if (csvP !== csvR) {
  const a = csvP.split('\r\n'), b = csvR.split('\r\n');
  const i = a.findIndex((l, n) => l !== b[n]);
  fail(`CSV 내보내기 결과가 다름 (${i}행)\n      preview: ${a[i]}\n      React  : ${b[i]}`);
}
console.log(`   집계·채널별·주차별 ${pts}점·CSV ${csvR.split('\r\n').length}행 대조`);

// ---------- 3. 광고를 안 돌린 주차 ----------
console.log('\n■ 광고를 안 돌린 주차가 0%가 아니라 값 없음으로 나오는지');
for (const folder of ['furniture', 'travel']) {
  const dir = path.join(ROOT, 'scripts/native', folder);
  const { rows } = await loadFolder(dir);
  const platforms = derivePlatforms(rows);
  const trend = M.trendByPlatform(rows, platforms);
  let gaps = 0;
  for (const s of trend.series) {
    for (const pt of s.points) {
      const has = rows.some((r) => r.platform === s.id && r.week === pt.week);
      if (!has && pt.roas !== null) fail(`${folder} ${s.id} ${pt.week}주: 데이터가 없는데 ${pt.roas}로 찍힘`);
      if (!has) gaps += 1;
    }
  }
  console.log(`   ${folder.padEnd(10)} 데이터 없는 칸 ${gaps}개 — 모두 값 없음 처리`);
}

console.log(problems ? `\n문제 ${problems}건` : '\n전부 통과');
process.exit(problems ? 1 : 0);
