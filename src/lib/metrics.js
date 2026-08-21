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
      // 한 주차엔 여러 날 × 여러 제품의 행이 들어 있다. 그중 한 행을 집어 쓰면 안 되고,
      // 그 주차 전체의 광고비·매출을 먼저 합산한 뒤 비율을 낸다 (아래 "합계를 먼저" 원칙).
      const weekRows = p.rows.filter((r) => r.week === w);
      // 그 주에 광고를 아예 안 돌렸으면 0%가 아니라 '값 없음'이다. 0으로 두면 "돈만 쓰고
      // 한 건도 못 판 주"와 구분이 안 된다. 그래프는 이 구간에서 선을 끊는다.
      // 하루라도 데이터가 있으면 그 남은 날짜로 계산한다(주 일부만 쉰 경우).
      if (weekRows.length === 0) return { week: w, roas: null, roi: null };
      const a = aggregate(weekRows);
      return { week: w, roas: a.roas, roi: a.roi ?? 0 };
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

// ---------- '읽어낸 것' 진단 공식 ----------
// 특정 채널 이름을 하드코딩하지 않고, 어떤 데이터가 들어와도 같은 기준으로 판단하기 위한
// 정형화된 마케팅 진단 규칙 두 가지. (채널별로 미리 써둔 문장을 매칭하던 방식을 대체)

// 구간을 앞뒤로 나눠 평균을 비교해 추세를 판단한다. threshold(기본 10%) 밑이면 '보합'으로 본다.
export function trendDirection(points, metric, threshold = 0.1) {
  // 광고를 안 돌린 주차(값 없음)는 추세 판단에서 제외한다.
  points = points.filter((p) => p[metric] != null);
  if (points.length < 4) return { dir: 'flat', change: 0 };
  const mid = Math.floor(points.length / 2);
  const avg = (arr) => arr.reduce((a, p) => a + p[metric], 0) / arr.length;
  const first = avg(points.slice(0, mid));
  const second = avg(points.slice(mid));
  if (first === 0) return { dir: 'flat', change: 0 };
  const change = (second - first) / Math.abs(first);
  if (change > threshold) return { dir: 'up', change };
  if (change < -threshold) return { dir: 'down', change };
  return { dir: 'flat', change };
}

// CTR·CVR을 전체 평균과 비교해 퍼널(노출→클릭→구매) 어디가 강하고 약한지 네 가지로 분류한다.
// margin(기본 15%) 이상 벌어져야 '높다/낮다'로 보고, 그 안이면 평균과 비슷하다고 본다.
export function funnelDiagnosis(ctr, cvr, avgCtr, avgCvr, margin = 0.15) {
  const ctrHigh = avgCtr > 0 && ctr > avgCtr * (1 + margin);
  const ctrLow = avgCtr > 0 && ctr < avgCtr * (1 - margin);
  const cvrHigh = avgCvr > 0 && cvr > avgCvr * (1 + margin);
  const cvrLow = avgCvr > 0 && cvr < avgCvr * (1 - margin);
  if (ctrHigh && cvrHigh) return 'both-high';
  if (ctrHigh && cvrLow) return 'ctr-high-cvr-low';
  if (ctrLow && cvrHigh) return 'ctr-low-cvr-high';
  if (ctrLow && cvrLow) return 'both-low';
  return 'mixed';
}

// ---------- 표시 형식 ----------
export const won = (n) => Math.round(n).toLocaleString('ko-KR');
export const pct = (n, digits = 1) => (n * 100).toFixed(digits);
