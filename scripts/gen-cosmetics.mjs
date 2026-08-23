/**
 * 기본 데모(화장품) 데이터를 플랫폼 리포트 형태로 되돌린다.
 * 실행:  node scripts/gen-cosmetics.mjs
 *
 * scripts/campaigns.json(캐노니컬 1,800행)을 읽어, 네이버·구글·메타·카카오가 실제로
 * 내보내는 컬럼명 그대로 scripts/native/cosmetics/ 에 4개 파일로 저장한다.
 * 숫자는 campaigns.json 그대로이고, 원본에 없는 캠페인·광고그룹 이름만 제품별로 붙인다.
 *
 * 다른 업종 샘플과 달리 이 데이터는 난수로 만들지 않는다 — 기본 데모의 숫자가
 * 이 프로젝트의 결론이라 campaigns.json을 그대로 옮기기만 한다.
 */
import XLSX from 'xlsx';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeMarginDoc } from './margin-doc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'native', 'cosmetics');

// 제품마다 캠페인·광고그룹 이름을 하나씩 붙인다 (실제 리포트엔 이 컬럼이 있고 우리 데이터엔 없다).
const NAMING = {
  '비타민C 세럼': ['세럼_검색_브랜드', '브랜드키워드'],
  '수분크림': ['수분크림_인스타', '2030여성'],
  '립밤 기프트세트': ['립밤세트_선물하기', '카카오톡친구'],
  '클렌징폼': ['클렌징폼_리타겟팅', '재방문고객'],
  '아이크림': ['아이크림_일반', '전체타겟'],
};

const HEADERS = {
  naver:  ['날짜', '캠페인', '광고그룹', '노출수', '클릭수', '광고비', '구매완료 전환수', '구매완료 전환매출액'],
  google: ['Date', 'Campaign name', 'Ad group name', 'Impr.', 'Clicks', 'Cost', 'Conversions', 'Conversion value'],
  meta:   ['Day', 'Campaign name', 'Ad set name', 'Impressions', 'Link clicks', 'Amount spent', 'Purchases', 'Purchase conversion value'],
  kakao:  ['날짜', '캠페인 이름', '광고그룹 이름', '노출수', '클릭수', '비용', '구매', '구매금액'],
};

const all = JSON.parse(readFileSync(path.join(HERE, 'campaigns.json'), 'utf-8'));
mkdirSync(OUT, { recursive: true });

for (const platform of Object.keys(HEADERS)) {
  const rows = [HEADERS[platform]];
  for (const r of all.filter((x) => x.platform === platform)) {
    const [campaign, adGroup] = NAMING[r.product];
    rows.push([r.date, campaign, adGroup, r.impressions, r.clicks, r.adSpend, r.conversions, r.revenue]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), platform);   // 원본 파일과 같은 시트 이름
  XLSX.writeFile(wb, path.join(OUT, `lumiere-${platform}-native.xlsx`));
  console.log(`${platform}: ${rows.length - 1}행 → lumiere-${platform}-native.xlsx`);
}

// 마진율은 campaigns.json의 각 행에 들어 있다 (제품마다 같은 값)
const margins = {};
for (const r of all) margins[r.product] = r.margin;
writeMarginDoc(OUT, {
  brand: '루미에르',
  industry: '화장품',
  products: Object.keys(NAMING).map((name) => ({ name, margin: margins[name] })),
  campaigns: Object.entries(NAMING).map(([name, [campaign]]) => [campaign, name]),
  test: '기본 데모입니다. 제품마다 강세 채널이 다릅니다 — 세럼은 네이버, 수분크림은 메타, 립밤세트는 카카오, 클렌징폼은 구글. 아이크림은 전 채널 부진이라 예산을 줄여야 할 사례입니다. 전체 ROAS는 201%로 괜찮아 보이지만 원가를 반영한 ROI는 마이너스입니다.',
});
