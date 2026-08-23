/**
 * 의류 브랜드(가상: 먼데이 클로짓) 플랫폼 리포트 샘플을 만든다.
 * 실행:  node scripts/gen-apparel.mjs
 *
 * scripts/native/apparel/ 에 네이버·구글·메타·카카오 리포트 4개(각 450행, 90일 × 제품 5종)를
 * 각 플랫폼이 실제로 내보내는 컬럼명 그대로 저장한다. 업로드 기능 테스트용이며,
 * 기본 데모 데이터(화장품)는 건드리지 않는다.
 *
 * 심어둔 패턴 — 숫자를 임의로 바꾸지 않는다. 이 패턴이 데이터의 결론이기 때문이다.
 *  - 제품마다 강세 채널이 다르다 (트렌치코트=네이버, 린넨셔츠=메타, 데일리티셔츠=구글, 홈웨어세트=카카오)
 *  - 시즌 전환: 봄 아우터는 급락하고 여름 신상은 급등한다. 전체 기간으로 보면 둘 다 평범하지만
 *    최근 4주로 좁히면 결론이 정반대가 된다 (기간 조건이 판단을 바꾸는 사례)
 *  - 와이드데님은 전 채널 부진 — 예산을 줄여야 할 사례
 *  - 데일리티셔츠는 ROAS 208%인데 마진이 32%(손익분기 312%)라 실제로는 손해 —
 *    "플랫폼은 원가를 모른다"를 저가·저마진 상품에서 보여주는 사례
 *
 * 난수 seed가 고정돼 있어 몇 번을 돌려도 같은 파일이 나온다.
 */
import XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeMarginDoc } from './margin-doc.mjs';


const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'native', 'apparel');
const START = new Date(Date.UTC(2026, 4, 1));   // 2026-05-01
const DAYS = 90;                                 // 13주 (화장품 데이터와 동일 기간)

// 재현 가능한 난수 (같은 seed면 항상 같은 데이터)
let seed = 20260501;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const jit = (p) => 1 + (rnd() * 2 - 1) * p;      // ±p 흔들기
// 하루 전환수는 0~2건처럼 작아서 그냥 반올림하면 소수점이 매번 깎여 합계가 설계값보다 낮아진다.
// 소수점만큼의 확률로 올림해서 90일을 합쳤을 때 기대값이 맞게 한다.
const roundProb = (x) => Math.floor(x) + (rnd() < x - Math.floor(x) ? 1 : 0);

// 채널 특성: 검색은 CTR 낮고 클릭이 비싸다, 소셜은 CTR 높고 클릭이 싸다
const PLATFORMS = {
  naver:  { ctr: 0.013,  cpc: 950 },
  google: { ctr: 0.0095, cpc: 430 },
  meta:   { ctr: 0.026,  cpc: 380 },
  kakao:  { ctr: 0.020,  cpc: 300 },
};

// 시즌 곡선: 0~1(주차 진행도)을 받아 배수를 돌려준다
const decay = (t) => 1.0 - 0.78 * Math.pow(t, 0.75);        // 봄 아우터: 급락
const rise  = (t) => 0.35 + 1.05 * Math.pow(t, 1.15);       // 여름 신상: 급등
const flat  = () => 1.0;
const bump  = (t) => 0.92 + 0.30 * Math.sin(Math.PI * t);   // 한여름에 살짝 볼록

// 전체 ROAS를 의도한 수준(약 215%)에 맞추는 배수. 제품·채널 간 상대적인 우열은 그대로 두고
// 데이터셋 전체의 눈금만 옮긴다.
const ROAS_SCALE = 1.16;

const PRODUCTS = [
  { name: '트렌치코트', cpcMult: 1.25,  aov: 189000, margin: 0.48, clicks: 260,
    roas: { naver: 4.9, google: 1.8, meta: 1.7, kakao: 1.6 },
    roasSeason: decay, volSeason: (t) => 1.0 - 0.65 * t },
  { name: '린넨셔츠', cpcMult: 1.0,    aov: 59000,  margin: 0.45, clicks: 420,
    roas: { naver: 1.5, google: 1.5, meta: 3.6, kakao: 1.6 },
    roasSeason: rise,  volSeason: (t) => 0.5 + 0.9 * t },
  { name: '데일리티셔츠', cpcMult: 0.55, aov: 19000,  margin: 0.32, clicks: 700,
    roas: { naver: 1.25, google: 2.7, meta: 1.35, kakao: 1.3 },
    roasSeason: (t) => 0.9 + 0.2 * t, volSeason: flat },
  { name: '홈웨어세트', cpcMult: 0.85,  aov: 49000,  margin: 0.42, clicks: 380,
    roas: { naver: 1.3, google: 1.35, meta: 1.45, kakao: 3.9 },
    roasSeason: bump, volSeason: flat },
  { name: '와이드데님', cpcMult: 1.0,  aov: 69000,  margin: 0.38, clicks: 340,
    roas: { naver: 1.2, google: 1.0, meta: 0.9, kakao: 0.95 },
    roasSeason: flat, volSeason: flat },
];

// 캠페인·광고그룹 이름은 플랫폼마다 실제로 쓰는 말이 다르다
const CAMPAIGN = {
  naver:  { 트렌치코트: '트렌치코트_검색_브랜드', 린넨셔츠: '린넨셔츠_검색', 데일리티셔츠: '데일리티셔츠_쇼핑', 홈웨어세트: '홈웨어세트_검색', 와이드데님: '와이드데님_검색_일반' },
  google: { 트렌치코트: '트렌치코트_리타겟팅', 린넨셔츠: '린넨셔츠_디스플레이', 데일리티셔츠: '데일리티셔츠_리타겟팅', 홈웨어세트: '홈웨어세트_쇼핑', 와이드데님: '와이드데님_리타겟팅' },
  meta:   { 트렌치코트: '트렌치코트_피드', 린넨셔츠: '린넨셔츠_릴스', 데일리티셔츠: '데일리티셔츠_피드_리타겟팅', 홈웨어세트: '홈웨어세트_스토리', 와이드데님: '와이드데님_피드' },
  kakao:  { 트렌치코트: '트렌치코트_비즈보드', 린넨셔츠: '린넨셔츠_비즈보드', 데일리티셔츠: '데일리티셔츠_톡딜', 홈웨어세트: '홈웨어세트_선물하기', 와이드데님: '와이드데님_비즈보드' },
};
const ADGROUP = {
  naver:  ['브랜드키워드', '일반키워드'],
  google: ['리타겟팅', '유사잠재고객'],
  meta:   ['관심사타겟', '리타겟팅'],
  kakao:  ['데모타겟', '리타겟팅'],
};

// 플랫폼별 네이티브 컬럼명 (platforms.js의 PLATFORM_COLUMNS와 같은 이름을 쓴다)
const HEADERS = {
  naver:  ['날짜', '캠페인', '광고그룹', '노출수', '클릭수', '광고비', '구매완료 전환수', '구매완료 전환매출액'],
  google: ['Date', 'Campaign name', 'Ad group name', 'Impr.', 'Clicks', 'Cost', 'Conversions', 'Conversion value'],
  meta:   ['Day', 'Campaign name', 'Ad set name', 'Impressions', 'Link clicks', 'Amount spent', 'Purchases', 'Purchase conversion value'],
  kakao:  ['날짜', '캠페인 이름', '광고그룹 이름', '노출수', '클릭수', '비용', '구매', '구매금액'],
};

const iso = (d) => d.toISOString().slice(0, 10);

mkdirSync(OUT, { recursive: true });
const check = [];

for (const platform of Object.keys(PLATFORMS)) {
  const { ctr, cpc } = PLATFORMS[platform];
  const rows = [HEADERS[platform]];

  for (let d = 0; d < DAYS; d++) {
    const date = new Date(START.getTime() + d * 86400000);
    const t = d / (DAYS - 1);                                  // 0 → 1
    const weekend = [0, 6].includes(date.getUTCDay()) ? 1.18 : 0.95; // 의류는 주말에 산다

    for (const p of PRODUCTS) {
      const roas = p.roas[platform] * ROAS_SCALE * p.roasSeason(t) * jit(0.10);
      const focus = p.roas[platform] >= 2.5 ? 1.7 : 0.82;   // 강세 채널에 예산을 몰아준다
      const clicks = Math.max(8, Math.round(p.clicks * focus * p.volSeason(t) * weekend * jit(0.18)));
      const impressions = Math.round(clicks / ctr * jit(0.12));
      const adSpend = Math.round(clicks * cpc * p.cpcMult * jit(0.08) / 10) * 10;
      // 전환수는 목표 ROAS에서 역산한다 (반올림 때문에 실제 ROAS가 자연스럽게 흔들린다)
      const conversions = Math.max(0, roundProb(adSpend * roas / p.aov));
      const revenue = Math.round(conversions * p.aov * jit(0.05));

      rows.push([iso(date), CAMPAIGN[platform][p.name], ADGROUP[platform][d % 2],
                 impressions, clicks, adSpend, conversions, revenue]);
      check.push({ platform, product: p.name, margin: p.margin, adSpend, revenue, impressions, clicks, conversions, week: Math.floor(d / 7) + 1 });
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Report');
  const file = path.join(OUT, `monday-closet-${platform}-native.xlsx`);
  XLSX.writeFile(wb, file);
  console.log(`${platform}: ${rows.length - 1}행 → ${path.basename(file)}`);
}

writeMarginDoc(OUT, {
  brand: '먼데이 클로짓',
  industry: '의류',
  products: PRODUCTS,
  campaigns: PRODUCTS.flatMap((p) => Object.keys(PLATFORMS).map((pl) => [CAMPAIGN[pl][p.name], p.name])),
  test: '시즌 전환 — 봄 아우터(트렌치코트)는 무너지고 여름 신상(린넨셔츠)은 올라옵니다. 전체 기간으로는 둘 다 평범하니, 기간을 최근 4주로 좁혀야 결론이 뒤집힙니다. 데일리티셔츠는 ROAS 208%인데 마진이 32%(손익분기 312%)라 실제로는 손해입니다.',
});

// ---- 심어둔 패턴이 실제로 나오는지 검증 ----
const agg = (rs) => {
  const a = rs.reduce((o, r) => ({ s: o.s + r.adSpend, rev: o.rev + r.revenue, pf: o.pf + r.revenue * r.margin,
                                   i: o.i + r.impressions, c: o.c + r.clicks, cv: o.cv + r.conversions }),
                      { s: 0, rev: 0, pf: 0, i: 0, c: 0, cv: 0 });
  return { roas: a.rev / a.s * 100, roi: (a.pf - a.s) / a.s * 100, ctr: a.c / a.i * 100, cvr: a.cv / a.c * 100, s: a.s, rev: a.rev };
};

console.log('\n제품별 × 채널별 (R=ROAS, I=ROI)');
console.log('제품            마진   ' + Object.keys(PLATFORMS).map(p => p.padEnd(14)).join(''));
for (const p of PRODUCTS) {
  let line = p.name.padEnd(14) + (p.margin * 100).toFixed(0) + '%   ';
  for (const pl of Object.keys(PLATFORMS)) {
    const a = agg(check.filter(r => r.product === p.name && r.platform === pl));
    line += ('R' + a.roas.toFixed(0) + '/I' + a.roi.toFixed(0)).padEnd(14);
  }
  console.log(line);
}

console.log('\n시즌 전환 확인 (주차별 ROAS, 강세 채널 기준)');
for (const [prod, pl] of [['트렌치코트', 'naver'], ['린넨셔츠', 'meta']]) {
  const w = [1, 4, 7, 10, 13].map(wk => {
    const a = agg(check.filter(r => r.product === prod && r.platform === pl && r.week === wk));
    return `${wk}주 ${a.roas.toFixed(0)}%`;
  });
  console.log(`  ${prod.padEnd(8)}(${pl}) ` + w.join(' → '));
}

const T = agg(check);
console.log(`\n전체 ROAS ${T.roas.toFixed(1)}%  ROI ${T.roi.toFixed(1)}%  CTR ${T.ctr.toFixed(2)}%  전환율 ${T.cvr.toFixed(2)}%`);
console.log(`광고비 ${(T.s / 1e8).toFixed(2)}억  매출 ${(T.rev / 1e8).toFixed(2)}억  총 ${check.length}행`);

console.log('\n채널별 현실성 점검');
for (const pl of Object.keys(PLATFORMS)) {
  const rs = check.filter(r => r.platform === pl);
  const a = agg(rs);
  const spend = rs.reduce((s, r) => s + r.adSpend, 0), clicks = rs.reduce((s, r) => s + r.clicks, 0);
  console.log(`  ${pl.padEnd(7)} CTR ${a.ctr.toFixed(2)}%  전환율 ${a.cvr.toFixed(2)}%  CPC ${Math.round(spend / clicks)}원  ROAS ${a.roas.toFixed(0)}%  광고비 ${(spend / 1e7).toFixed(2)}천만`);
}
