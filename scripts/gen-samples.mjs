/**
 * 업로드 테스트용 리포트 샘플을 회사(업종)별로 만든다.
 * 실행:  node scripts/gen-samples.mjs
 *
 * scripts/native/<제품군>/ 폴더마다 그 회사가 쓰는 채널 수만큼 리포트 파일을 만든다.
 * 폴더명은 회사 이름이 아니라 무엇을 파는 회사인지(제품군)로 짓는다 — 어떤 샘플인지 폴더명만 보고 알 수 있게.
 * 각 파일은 해당 플랫폼이 실제로 내보내는 컬럼명을 그대로 쓴다(platforms.js의 PLATFORM_COLUMNS와 같은 이름).
 * 기본 데모 데이터(campaigns 컬렉션)는 건드리지 않는다 — 업로드 기능 테스트 전용이다.
 *
 * 회사마다 "화면이 다르게 반응하는 조건"을 일부러 하나씩 다르게 심어놨다.
 * 업로드해보면서 확인할 것은 각 회사 설정의 test 필드에 적어뒀다.
 *
 * 난수 seed가 회사마다 고정돼 있어 몇 번을 돌려도 같은 파일이 나온다.
 */
import XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'native');
const START = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const DAYS = 90;                              // 13주

// 채널 특성: 검색은 클릭이 적고 비싸지만 잘 사고, 소셜은 클릭이 많고 싸지만 덜 산다
const PLATFORMS = {
  naver:  { ctr: 0.013,  cpc: 950 },
  google: { ctr: 0.0095, cpc: 430 },
  meta:   { ctr: 0.026,  cpc: 380 },
  kakao:  { ctr: 0.020,  cpc: 300 },
};

const HEADERS = {
  naver:  ['날짜', '캠페인', '광고그룹', '노출수', '클릭수', '광고비', '구매완료 전환수', '구매완료 전환매출액'],
  google: ['Date', 'Campaign name', 'Ad group name', 'Impr.', 'Clicks', 'Cost', 'Conversions', 'Conversion value'],
  meta:   ['Day', 'Campaign name', 'Ad set name', 'Impressions', 'Link clicks', 'Amount spent', 'Purchases', 'Purchase conversion value'],
  kakao:  ['날짜', '캠페인 이름', '광고그룹 이름', '노출수', '클릭수', '비용', '구매', '구매금액'],
};
const ADGROUP = {
  naver:  ['브랜드키워드', '일반키워드'],
  google: ['리타겟팅', '유사잠재고객'],
  meta:   ['관심사타겟', '리타겟팅'],
  kakao:  ['데모타겟', '리타겟팅'],
};

// 시즌 곡선 (0~1 진행도 → 배수)
const flat  = () => 1.0;
const decay = (t) => 1.0 - 0.78 * Math.pow(t, 0.75);       // 시즌 종료: 급락
const rise  = (t) => 0.35 + 1.05 * Math.pow(t, 1.15);      // 시즌 시작: 급등
const bump  = (t) => 0.92 + 0.30 * Math.sin(Math.PI * t);  // 한여름에 볼록
const creep = (t) => 0.9 + 0.2 * t;                        // 완만한 우상향

// 캠페인 작명 방식도 회사마다 다르다 — 자동 제품 추측이 어디까지 버티는지 보려고 일부러 다르게 썼다
const NAME = {
  ko:    (p, sfx) => `${p}_${sfx}`,                        // 수분크림_검색
  koNum: (p, sfx) => `${p}_${sfx}_0501`,                   // 사과_검색_0501  (숫자는 걷어내야 한다)
  en:    (p, sfx) => `${p}_${sfx}`,                        // Python_Search
  brand: (p, sfx, brand) => `[${brand}]${p}_${sfx}`,       // [펫테이블]연어사료_검색
};
const SUFFIX = { naver: '검색', google: '리타겟팅', meta: '피드', kakao: '비즈보드' };
const SUFFIX_EN = { naver: 'Search', google: 'Retargeting', meta: 'Feed', kakao: 'Display' };

// ---------------------------------------------------------------- 회사 설정
const COMPANIES = [
  {
    slug: 'fresh-food', brand: '그린바스켓', file: 'greenbasket', seed: 611, naming: 'koNum',
    industry: '신선식품 새벽배송',
    test: '마진 18~28%로 극단적으로 낮다. ROAS 300%가 넘어도 손해라서, 손익분기선이 화면 오른쪽 끝까지 밀려난다.',
    platforms: ['naver', 'google', 'meta', 'kakao'],
    products: [
      { name: '유기농사과', aov: 24000, margin: 0.22, clicks: 620, cpcMult: 0.7, roas: { naver: 3.4, google: 2.9, meta: 2.6, kakao: 2.7 }, roasSeason: creep },
      { name: '한우등심', aov: 78000, margin: 0.18, clicks: 340, cpcMult: 1.1, roas: { naver: 4.8, google: 3.1, meta: 2.9, kakao: 3.0 }, roasSeason: flat },
      { name: '샐러드팩', aov: 12000, margin: 0.28, clicks: 780, cpcMult: 0.55, roas: { naver: 2.6, google: 3.9, meta: 3.1, kakao: 2.8 }, roasSeason: bump },
      { name: '제철수박', aov: 29000, margin: 0.20, clicks: 450, cpcMult: 0.8, roas: { naver: 2.4, google: 2.2, meta: 4.6, kakao: 3.3 }, roasSeason: rise },
      { name: '수입치즈', aov: 19000, margin: 0.25, clicks: 380, cpcMult: 0.75, roas: { naver: 2.1, google: 2.0, meta: 1.9, kakao: 2.2 }, roasSeason: flat },
    ],
  },
  {
    slug: 'home-appliance', brand: '볼트가전', file: 'volt', seed: 822, naming: 'ko',
    industry: '소형가전',
    test: '객단가가 높아 하루 전환이 0~2건뿐이다. 전환이 0인 날이 많은 데이터에서 주차별 그래프가 어떻게 보이는지 확인용.',
    platforms: ['naver', 'google', 'meta', 'kakao'],
    products: [
      { name: '무선청소기', aov: 459000, margin: 0.16, clicks: 210, cpcMult: 1.5, roas: { naver: 4.2, google: 2.4, meta: 2.1, kakao: 1.9 }, roasSeason: flat },
      { name: '에어프라이어', aov: 129000, margin: 0.22, clicks: 330, cpcMult: 1.0, roas: { naver: 2.6, google: 2.3, meta: 4.0, kakao: 2.5 }, roasSeason: creep },
      { name: '스탠드에어컨', aov: 1290000, margin: 0.12, clicks: 180, cpcMult: 1.8, roas: { naver: 5.4, google: 3.2, meta: 2.8, kakao: 2.6 }, roasSeason: rise },
      { name: '가습기', aov: 89000, margin: 0.20, clicks: 240, cpcMult: 0.9, roas: { naver: 2.0, google: 1.8, meta: 1.6, kakao: 1.7 }, roasSeason: decay },
    ],
  },
  {
    slug: 'online-course', brand: '클래스루프', file: 'classloop', seed: 1204, naming: 'en',
    industry: '온라인 강의 (VOD)',
    test: '마진 85~92%로 아주 높다. 손익분기 ROAS가 110% 근처라, ROAS가 낮아 보여도 대부분 이익이 남는다 — 저마진 회사와 정반대 화면.',
    platforms: ['naver', 'google', 'meta'],   // 카카오를 안 쓰는 회사 (채널 3개짜리 화면 확인)
    products: [
      { name: 'Python', aov: 199000, margin: 0.90, clicks: 400, cpcMult: 1.2, roas: { naver: 2.4, google: 1.9, meta: 1.5 }, roasSeason: flat },
      { name: 'Excel', aov: 89000, margin: 0.92, clicks: 560, cpcMult: 0.9, roas: { naver: 1.8, google: 2.2, meta: 1.6 }, roasSeason: creep },
      { name: 'Design', aov: 259000, margin: 0.88, clicks: 300, cpcMult: 1.3, roas: { naver: 1.2, google: 1.3, meta: 2.6 }, roasSeason: rise },
      { name: 'English', aov: 149000, margin: 0.86, clicks: 480, cpcMult: 1.0, roas: { naver: 1.5, google: 1.4, meta: 1.3 }, roasSeason: flat },
      { name: 'Finance', aov: 329000, margin: 0.85, clicks: 220, cpcMult: 1.4, roas: { naver: 1.0, google: 0.9, meta: 0.8 }, roasSeason: decay },
    ],
  },
  {
    slug: 'pet-supplies', brand: '펫테이블', file: 'pettable', seed: 335, naming: 'brand',
    industry: '반려동물 사료·용품',
    test: '캠페인명 앞에 [펫테이블] 같은 브랜드 대괄호가 붙는다. 자동 제품 추측이 대괄호를 걷어내는지 확인용.',
    platforms: ['naver', 'google', 'meta', 'kakao'],
    products: [
      { name: '연어사료', aov: 42000, margin: 0.38, clicks: 520, cpcMult: 0.9, roas: { naver: 2.2, google: 4.1, meta: 2.0, kakao: 2.1 }, roasSeason: creep },
      { name: '오리간식', aov: 18000, margin: 0.45, clicks: 640, cpcMult: 0.6, roas: { naver: 1.9, google: 2.8, meta: 2.4, kakao: 2.3 }, roasSeason: flat },
      { name: '자동급식기', aov: 139000, margin: 0.33, clicks: 260, cpcMult: 1.2, roas: { naver: 3.3, google: 2.1, meta: 2.5, kakao: 1.9 }, roasSeason: flat },
      { name: '쿨매트', aov: 34000, margin: 0.40, clicks: 300, cpcMult: 0.8, roas: { naver: 1.7, google: 1.6, meta: 3.8, kakao: 2.9 }, roasSeason: rise },
      { name: '배변패드', aov: 22000, margin: 0.35, clicks: 580, cpcMult: 0.55, roas: { naver: 1.5, google: 1.8, meta: 1.4, kakao: 1.5 }, roasSeason: flat },
    ],
  },
  {
    slug: 'b2b-software', brand: '노드데스크', file: 'nodedesk', seed: 909, naming: 'ko',
    industry: 'B2B 협업 솔루션',
    test: '제품 2개뿐이고 전환이 아주 드물다(리드 기반). B2B처럼 고관여·소수 고액계약인 데이터에서도 같은 화면이 성립하는지 확인용.',
    platforms: ['naver', 'google', 'meta'],
    products: [
      { name: '협업툴', aov: 2400000, margin: 0.88, clicks: 190, cpcMult: 2.2, roas: { naver: 3.1, google: 2.7, meta: 1.4 }, roasSeason: creep },
      { name: '문서관리', aov: 1800000, margin: 0.85, clicks: 150, cpcMult: 2.0, roas: { naver: 2.2, google: 1.9, meta: 1.1 }, roasSeason: flat },
    ],
  },
  {
    slug: 'furniture', brand: '리브데코', file: 'livdeco', seed: 1516, naming: 'ko',
    industry: '가구·인테리어',
    test: '채널마다 집행 기간이 다르다 — 구글은 7주차에 새로 시작하고, 메타는 8주차까지만 하고 껐다. 주차별 그래프에서 선이 중간부터 시작하거나 중간에 끝나야 한다.',
    platforms: ['naver', 'google', 'meta', 'kakao'],
    // 이 채널이 실제로 광고를 돌린 주차 구간. 적지 않으면 전 기간 집행으로 본다.
    activeWeeks: { google: [[7, 13]], meta: [[1, 8]] },
    products: [
      { name: '패브릭소파', aov: 890000, margin: 0.44, clicks: 220, cpcMult: 1.4, roas: { naver: 3.6, google: 2.2, meta: 2.4, kakao: 1.8 }, roasSeason: flat },
      { name: '원목식탁', aov: 640000, margin: 0.42, clicks: 260, cpcMult: 1.3, roas: { naver: 2.8, google: 3.4, meta: 1.9, kakao: 1.7 }, roasSeason: creep },
      { name: '수납장', aov: 210000, margin: 0.48, clicks: 380, cpcMult: 0.9, roas: { naver: 2.0, google: 2.1, meta: 3.2, kakao: 2.2 }, roasSeason: flat },
      { name: '조명스탠드', aov: 89000, margin: 0.52, clicks: 440, cpcMult: 0.7, roas: { naver: 1.6, google: 1.7, meta: 2.0, kakao: 3.1 }, roasSeason: bump },
    ],
  },
  {
    slug: 'travel', brand: '트립노트', file: 'tripnote', seed: 1718, naming: 'ko',
    industry: '여행 상품',
    test: '메타가 5~7주차에 쉬었다가 8주차에 재개한다(선 중간에 구멍). 카카오는 11주차에 뒤늦게 합류. 구글은 6주차에 나흘만 쉬어서, 그 주는 남은 사흘로 계산돼야 한다.',
    platforms: ['naver', 'google', 'meta', 'kakao'],
    activeWeeks: { meta: [[1, 4], [8, 13]], kakao: [[11, 13]] },
    skipDates: { google: ['2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08'] },
    products: [
      { name: '제주패키지', aov: 420000, margin: 0.28, clicks: 480, cpcMult: 1.1, roas: { naver: 3.8, google: 2.4, meta: 2.6, kakao: 2.2 }, roasSeason: rise },
      { name: '동남아항공', aov: 680000, margin: 0.18, clicks: 520, cpcMult: 1.2, roas: { naver: 4.4, google: 3.0, meta: 2.8, kakao: 2.4 }, roasSeason: creep },
      { name: '호텔예약', aov: 260000, margin: 0.22, clicks: 620, cpcMult: 0.9, roas: { naver: 2.6, google: 3.9, meta: 2.3, kakao: 2.5 }, roasSeason: bump },
      { name: '렌터카', aov: 130000, margin: 0.35, clicks: 400, cpcMult: 0.8, roas: { naver: 2.2, google: 2.0, meta: 1.8, kakao: 2.9 }, roasSeason: rise },
      { name: '골프투어', aov: 1200000, margin: 0.25, clicks: 190, cpcMult: 1.6, roas: { naver: 1.9, google: 1.6, meta: 1.5, kakao: 1.4 }, roasSeason: decay },
    ],
  },
  {
    slug: 'bedding', brand: '한올침구', file: 'hanol', seed: 447, naming: 'ko',
    industry: '침구·홈리빙',
    test: '제품이 1개뿐이라 제품 필터와 제품별 비교 패널이 아예 안 떠야 한다. 화면이 채널 비교만 남는 단순한 형태가 되는지 확인용.',
    platforms: ['naver', 'google', 'meta', 'kakao'],
    products: [
      { name: '여름이불', aov: 89000, margin: 0.42, clicks: 480, cpcMult: 1.0, roas: { naver: 2.3, google: 2.0, meta: 3.4, kakao: 2.6 }, roasSeason: rise },
    ],
  },
];

// ---------------------------------------------------------------- 생성
const ROAS_SCALE = 1.16; // 전체 눈금만 옮긴다. 제품·채널 간 상대적 우열은 그대로.

function build(company) {
  let seed = company.seed;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const jit = (p) => 1 + (rnd() * 2 - 1) * p;
  // 하루 전환수는 0~2건처럼 작아서 그냥 반올림하면 소수점이 매번 깎여 합계가 설계값보다 낮아진다.
  // 소수점만큼의 확률로 올림해서 90일을 합쳤을 때 기대값이 맞게 한다.
  const roundProb = (x) => Math.floor(x) + (rnd() < x - Math.floor(x) ? 1 : 0);

  const naming = NAME[company.naming];
  const sfx = company.naming === 'en' ? SUFFIX_EN : SUFFIX;
  const out = path.join(ROOT, company.slug);
  mkdirSync(out, { recursive: true });
  const audit = [];

  for (const platform of company.platforms) {
    const { ctr, cpc } = PLATFORMS[platform];
    const rows = [HEADERS[platform]];

    for (let d = 0; d < DAYS; d++) {
      const date = new Date(START.getTime() + d * 86400000);
      const iso = date.toISOString().slice(0, 10);
      const week = Math.floor(d / 7) + 1;

      // 광고를 안 돌린 기간은 행 자체를 만들지 않는다 — 실제 리포트도 그 날짜가 아예 없다.
      const ranges = company.activeWeeks?.[platform];
      if (ranges && !ranges.some(([a, b]) => week >= a && week <= b)) continue;
      if (company.skipDates?.[platform]?.includes(iso)) continue;

      const t = d / (DAYS - 1);
      const weekend = [0, 6].includes(date.getUTCDay()) ? 1.18 : 0.95;

      for (const p of company.products) {
        const season = (p.roasSeason || flat)(t);
        const roas = p.roas[platform] * ROAS_SCALE * season * jit(0.10);
        const focus = p.roas[platform] >= 2.5 ? 1.7 : 0.82;   // 잘 되는 채널에 예산을 더 쓴다
        const clicks = Math.max(8, Math.round(p.clicks * focus * (p.volSeason || flat)(t) * weekend * jit(0.18)));
        const impressions = Math.round(clicks / ctr * jit(0.12));
        const adSpend = Math.round(clicks * cpc * p.cpcMult * jit(0.08) / 10) * 10;
        const conversions = Math.max(0, roundProb(adSpend * roas / p.aov));
        const revenue = Math.round(conversions * p.aov * jit(0.05));

        rows.push([iso, naming(p.name, sfx[platform], company.brand), ADGROUP[platform][d % 2],
                   impressions, clicks, adSpend, conversions, revenue]);
        audit.push({ platform, product: p.name, margin: p.margin, adSpend, revenue, impressions, clicks, conversions, week });
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Report');
    XLSX.writeFile(wb, path.join(out, `${company.file}-${platform}-native.xlsx`));
  }
  return audit;
}

const agg = (rs) => {
  const a = rs.reduce((o, r) => ({ s: o.s + r.adSpend, rev: o.rev + r.revenue, pf: o.pf + r.revenue * r.margin,
                                   i: o.i + r.impressions, c: o.c + r.clicks, cv: o.cv + r.conversions }),
                      { s: 0, rev: 0, pf: 0, i: 0, c: 0, cv: 0 });
  return { roas: a.rev / a.s * 100, roi: (a.pf - a.s) / a.s * 100, ctr: a.c / a.i * 100,
           cvr: a.cv / a.c * 100, spend: a.s, conv: a.cv, breakeven: a.rev ? 100 / (a.pf / a.rev) : 0 };
};

for (const c of COMPANIES) {
  const audit = build(c);
  const T = agg(audit);
  console.log(`\n■ ${c.brand} (${c.industry})  →  scripts/native/${c.slug}/`);
  console.log(`  ${c.platforms.length}채널 × ${c.products.length}제품 × ${DAYS}일 = ${audit.length}행 · 파일 ${c.platforms.length}개`);
  if (c.activeWeeks || c.skipDates) {
    const gaps = c.platforms.map((pl) => {
      const w = [...new Set(audit.filter((r) => r.platform === pl).map((r) => r.week))].sort((a, b) => a - b);
      const missing = Array.from({ length: 13 }, (_, i) => i + 1).filter((x) => !w.includes(x));
      return missing.length ? `${pl} 빠진주차 ${missing.join(',')}` : null;
    }).filter(Boolean);
    console.log(`  집행 공백: ${gaps.join(' · ') || '없음'}`);
  }
  console.log(`  전체 ROAS ${T.roas.toFixed(0)}%  ROI ${T.roi.toFixed(0)}%  손익분기 ROAS ${T.breakeven.toFixed(0)}%  전환 ${T.conv}건  CTR ${T.ctr.toFixed(2)}%`);
  console.log(`  확인할 것: ${c.test}`);
  const worst = c.products.map((p) => ({ n: p.name, ...agg(audit.filter((r) => r.product === p.name)) }))
                          .sort((a, b) => a.roi - b.roi);
  console.log(`  제품별 ROI: ` + worst.map((p) => `${p.n} ${p.roi.toFixed(0)}%`).join(' · '));
}
