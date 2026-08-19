import { PLATFORMS } from './metrics';

// 어떤 출처의 데이터든(Firestore, 샘플, 업로드) PLATFORMS에 없는 플랫폼이 섞여 있을 수 있다.
// 기존 플랫폼과 id가 겹치면 브랜드 색을 그대로 쓰고, 새 플랫폼이면 이 팔레트에서 순서대로 배정한다.
// App.jsx가 데이터를 불러오는 모든 경로(샘플/Firestore/업로드)에서 이 함수로 플랫폼 목록을 만든다 —
// 그래야 PLATFORMS 배열에 없는 플랫폼이 표에는 나오는데 필터·차트에서는 조용히 빠지는 일이 없다.
const FALLBACK_PALETTE = ['#3d5a80', '#8a6d3b', '#5c6b73', '#7a5195', '#4c7a5a'];

export function derivePlatforms(rows) {
  const seen = [];
  for (const r of rows) {
    if (!seen.includes(r.platform)) seen.push(r.platform);
  }

  let fallbackIdx = 0;
  return seen.map((id) => {
    const known = PLATFORMS.find((p) => p.id === id);
    if (known) return known;

    const color = FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length];
    fallbackIdx += 1;
    return { id, name: id, color, desc: '' };
  });
}

// 업로드 지원 플랫폼과, 각 플랫폼이 실제로 내보내는 리포트의 네이티브 컬럼명 매핑.
// 네 플랫폼이 공통으로 갖는 값만 쓴다 — 소재(ad)는 구글 리포트에 없고, 도달(reach)은
// 메타만 있어서 둘 다 뺐다. CTR·ROAS처럼 플랫폼이 이미 계산해서 주는 비율 컬럼도 일부러
// 안 쓴다 — "합계를 먼저 내고 지표를 계산한다"는 원칙과 어긋나기 때문에, 원본 카운트만
// 받고 비율은 항상 aggregate()가 다시 계산한다.
export const UPLOAD_PLATFORMS = [
  { id: 'naver', name: '네이버' },
  { id: 'google', name: '구글' },
  { id: 'meta', name: '메타' },
  { id: 'kakao', name: '카카오' },
];

export const PLATFORM_COLUMNS = {
  naver: {
    date: '날짜',
    campaign: '캠페인',
    adGroup: '광고그룹',
    impressions: '노출수',
    clicks: '클릭수',
    adSpend: '광고비',
    conversions: '구매완료 전환수',
    revenue: '구매완료 전환매출액',
  },
  google: {
    date: 'Date',
    campaign: 'Campaign name',
    adGroup: 'Ad group name',
    impressions: 'Impr.',
    clicks: 'Clicks',
    adSpend: 'Cost',
    conversions: 'Conversions',
    revenue: 'Conversion value',
  },
  meta: {
    date: 'Day',
    campaign: 'Campaign name',
    adGroup: 'Ad set name',
    impressions: 'Impressions',
    clicks: 'Link clicks',
    adSpend: 'Amount spent',
    conversions: 'Purchases',
    revenue: 'Purchase conversion value',
  },
  kakao: {
    date: '날짜',
    campaign: '캠페인 이름',
    adGroup: '광고그룹 이름',
    impressions: '노출수',
    clicks: '클릭수',
    adSpend: '비용',
    conversions: '구매',
    revenue: '구매금액',
  },
};
