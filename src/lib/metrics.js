// 플랫폼 표시 정보 (색상은 index.css 변수와 동일하게 유지)
export const PLATFORMS = [
  { id: 'naver', name: '네이버', color: '#14705c', desc: '검색광고' },
  { id: 'meta', name: '메타', color: '#a54a76', desc: '인스타 피드·릴스' },
  { id: 'google', name: '구글', color: '#b8801a', desc: '디스플레이·리타겟팅' },
  { id: 'kakao', name: '카카오', color: '#3a5a78', desc: '카카오톡 비즈보드·모먼트' },
];

export const platformInfo = (id, platformList = PLATFORMS) =>
  platformList.find((p) => p.id === id) || { id, name: id, color: '#5a636e', desc: '' };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// 원본 데이터는 날짜(date) 단위다. 데이터셋에서 가장 이른 날짜를 1주차 시작으로 놓고
// 7일 단위로 묶어 주차를 계산한다 — 실제 플랫폼 리포트는 일 단위라 이 변환이 꼭 필요하다.
// 제품은 선택 값이라 없는 데이터(데모 등)는 전부 '전체' 한 종류로 취급된다.
export function deriveWeeks(rows) {
  if (rows.length === 0) return [];
  const times = rows.map((r) => new Date(r.date).getTime());
  const minTime = Math.min(...times);
  return rows.map((r) => ({
    ...r,
    week: Math.floor((new Date(r.date).getTime() - minTime) / WEEK_MS) + 1,
    product: r.product || '전체',
  }));
}

// 한 행(날짜×플랫폼)의 파생 지표
export function withMetrics(row) {
  // margin(원가를 뺀 마진율)이 있는 행만 원가를 계산할 수 있다. 없으면 이익·ROI는 알 수 없다(null).
  const cogs = row.margin != null ? row.revenue * (1 - row.margin) : null;
  const profit = cogs != null ? row.revenue - cogs - row.adSpend : null;
  return {
    ...row,
    ctr: row.impressions ? row.clicks / row.impressions : 0,
    cvr: row.clicks ? row.conversions / row.clicks : 0,
    roas: row.adSpend ? row.revenue / row.adSpend : 0,
    cpc: row.clicks ? row.adSpend / row.clicks : 0,
    cac: row.conversions ? row.adSpend / row.conversions : 0,
    cogs,
    profit,
    roi: profit != null && row.adSpend ? profit / row.adSpend : null,
  };
}

// 여러 행을 합산한 뒤 지표를 다시 계산 (평균의 평균을 쓰지 않기 위함)
export function aggregate(rows) {
  // 마진(margin)이 한 행이라도 없으면 원가를 알 수 없으니, 이익·ROI·손익분기 재계산은 전부 포기하고
  // 예전처럼 ROAS 100%를 손익분기로 쓴다. 업로드 배치의 margin은 전부 채우거나 아예 비워야 한다.
  const hasMargin = rows.length > 0 && rows.every((r) => r.margin != null);

  const sum = rows.reduce(
    (a, r) => ({
      adSpend: a.adSpend + r.adSpend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      conversions: a.conversions + r.conversions,
      revenue: a.revenue + r.revenue,
      cogs: a.cogs + (hasMargin ? r.revenue * (1 - r.margin) : 0),
    }),
    { adSpend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, cogs: 0 }
  );

  const base = withMetrics(sum);
  if (!hasMargin) return { ...base, cogs: null, profit: null, roi: null, breakevenRoas: 1 };

  const profit = sum.revenue - sum.cogs - sum.adSpend;
  const blendedMargin = sum.revenue ? 1 - sum.cogs / sum.revenue : 1;
  return {
    ...base,
    cogs: sum.cogs,
    profit,
    roi: sum.adSpend ? profit / sum.adSpend : 0,
    // 진짜 손익분기 ROAS. 마진 60%면 100%가 아니라 대략 167%가 돼야 실제로 남는다.
    breakevenRoas: blendedMargin > 0 ? 1 / blendedMargin : 1,
  };
}

// 플랫폼별 합산
export function byPlatform(rows, platformList = PLATFORMS) {
  return platformList.map((p) => {
    const subset = rows.filter((r) => r.platform === p.id);
    return { ...p, rows: subset, ...aggregate(subset) };
  }).filter((p) => p.rows.length > 0);
}

// 플랫폼별 주차 시계열
export function trendByPlatform(rows, platformList = PLATFORMS) {
  const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);
  const series = byPlatform(rows, platformList).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    points: weeks.map((w) => {
      // rows는 이미 App.jsx에서 withMetrics를 거친 값이라 다시 계산할 필요가 없다.
      const hit = p.rows.find((r) => r.week === w);
      return { week: w, roas: hit ? hit.roas : 0, roi: hit ? (hit.roi ?? 0) : 0 };
    }),
  }));
  return { weeks, series };
}

// 제품 비교용 팔레트. 플랫폼 팔레트(src/lib/platforms.js)와는 별개로 쓴다 — 색의 의미가 다르다.
const PRODUCT_PALETTE = ['#3d5a80', '#8a6d3b', '#5c6b73', '#7a5195', '#4c7a5a', '#2f6690', '#996633'];

// 제품별 합산. products는 문자열 배열(App.jsx가 rows에서 뽑은 목록)이다.
export function byProduct(rows, products) {
  return products.map((p, i) => {
    const subset = rows.filter((r) => r.product === p);
    return {
      id: p,
      name: p,
      color: PRODUCT_PALETTE[i % PRODUCT_PALETTE.length],
      desc: '',
      rows: subset,
      ...aggregate(subset),
    };
  }).filter((p) => p.rows.length > 0);
}

// ---------- 표시 형식 ----------
export const won = (n) => Math.round(n).toLocaleString('ko-KR');
export const pct = (n, digits = 1) => (n * 100).toFixed(digits);
export const manwon = (n) => `${Math.round(n / 10000).toLocaleString('ko-KR')}만원`;
