import { describe, it, expect } from 'vitest';
import {
  withMetrics, aggregate, deriveWeeks, byPlatform, byProduct,
  trendByPlatform, trendDirection, funnelDiagnosis, PLATFORMS,
} from '../metrics.js';

// 최소한의 원본 행을 만드는 헬퍼. margin을 안 넘기면 마진 모르는 행이 된다.
const row = (over = {}) => ({
  date: '2026-01-01', platform: 'naver', product: '전체',
  adSpend: 1000, impressions: 100, clicks: 10, conversions: 1, revenue: 2000, margin: null,
  ...over,
});

describe('withMetrics — 행 하나의 비율 계산', () => {
  it('CTR·ROAS 등을 원본 카운트에서 계산한다', () => {
    const m = withMetrics(row({ adSpend: 1000, revenue: 2000, clicks: 10, impressions: 100 }));
    expect(m.ctr).toBeCloseTo(0.1);
    expect(m.roas).toBeCloseTo(2);
  });

  it('분모가 0이면 NaN이 아니라 0을 돌려준다', () => {
    const m = withMetrics(row({ impressions: 0, clicks: 0, adSpend: 0 }));
    expect(m.ctr).toBe(0);
    expect(m.roas).toBe(0);
    expect(Number.isNaN(m.ctr)).toBe(false);
  });

  it('마진이 없으면 이익·ROI는 계산하지 않고 null로 둔다 (0이 아니다)', () => {
    const m = withMetrics(row({ margin: null }));
    expect(m.profit).toBeNull();
    expect(m.roi).toBeNull();
  });

  it('마진이 있으면 이익 = 매출×마진 - 광고비', () => {
    const m = withMetrics(row({ adSpend: 1000, revenue: 2000, margin: 0.5 }));
    expect(m.profit).toBeCloseTo(2000 * 0.5 - 1000); // 0
    expect(m.roi).toBeCloseTo(0);
  });
});

describe('aggregate — 합계를 먼저 내고 비율을 계산한다', () => {
  it('여러 행의 ROAS는 "비율의 평균"이 아니라 "합계의 비율"이다', () => {
    // 월: 광고비 100, 매출 200 (ROAS 200%) / 화: 광고비 10000, 매출 5000 (ROAS 50%)
    const rows = [
      row({ adSpend: 100, revenue: 200 }),
      row({ adSpend: 10000, revenue: 5000 }),
    ];
    const a = aggregate(rows);
    // 틀린 방식(평균)이면 (2 + 0.5) / 2 = 1.25 가 나와야 하는데, 맞는 방식은 다르다.
    const wrongAverage = (2 + 0.5) / 2;
    expect(a.roas).not.toBeCloseTo(wrongAverage);
    expect(a.roas).toBeCloseTo((200 + 5000) / (100 + 10000));
  });

  it('행이 하나라도 마진이 없으면 전체 계산을 포기한다 (일부만 반영하지 않는다)', () => {
    const rows = [row({ margin: 0.5 }), row({ margin: null })];
    const a = aggregate(rows);
    expect(a.roi).toBeNull();
    expect(a.breakevenRoas).toBe(1); // 원가를 모를 때의 기본값(ROAS 100%)
  });

  it('손익분기 ROAS는 1÷마진율이다', () => {
    const rows = [row({ adSpend: 1000, revenue: 2000, margin: 0.4 })];
    const a = aggregate(rows);
    expect(a.breakevenRoas).toBeCloseTo(1 / 0.4);
  });

  it('빈 배열을 넣어도 에러 없이 0을 돌려준다', () => {
    const a = aggregate([]);
    expect(a.adSpend).toBe(0);
    expect(a.roas).toBe(0);
  });
});

describe('deriveWeeks — 날짜를 주차로 바꾼다', () => {
  it('가장 이른 날짜를 1주차로 놓고 7일 단위로 묶는다', () => {
    const rows = [
      row({ date: '2026-01-01' }), // 1주차
      row({ date: '2026-01-07' }), // 1주차 (7일째)
      row({ date: '2026-01-08' }), // 2주차 (8일째)
    ];
    const withWeeks = deriveWeeks(rows);
    expect(withWeeks[0].week).toBe(1);
    expect(withWeeks[1].week).toBe(1);
    expect(withWeeks[2].week).toBe(2);
  });

  it('product가 없는 행은 "전체"로 채운다', () => {
    const [r] = deriveWeeks([{ date: '2026-01-01', adSpend: 0, revenue: 0 }]);
    expect(r.product).toBe('전체');
  });
});

describe('trendByPlatform — 주차별 그래프 (실제로 있었던 버그의 재발 방지)', () => {
  it('한 주에 여러 행이 있으면 그중 하나가 아니라 합계로 계산한다', () => {
    // 실제로 있었던 버그: find()로 그 주의 "첫 행 하나"만 대표값으로 쓰던 문제.
    // 첫 행은 전환 0(ROAS 0)이지만, 그 주 전체를 합치면 ROAS가 정상 값이어야 한다.
    const rows = deriveWeeks([
      row({ date: '2026-01-01', adSpend: 100, revenue: 0 }),   // 그 주의 "첫 행"— 예전 버그라면 이걸로 결정됨
      row({ date: '2026-01-02', adSpend: 100, revenue: 400 }),
    ]);
    const { series } = trendByPlatform(rows, PLATFORMS);
    const naver = series.find((s) => s.id === 'naver');
    // 주 전체 합산: 광고비 200, 매출 400 → ROAS 200%. 첫 행만 봤다면 0이 나왔을 것이다.
    expect(naver.points[0].roas).toBeCloseTo(2);
  });

  it('그 주에 행이 아예 없으면 0이 아니라 null(값 없음)이다', () => {
    // 1주차만 있고 2주차엔 데이터가 아예 없는 상황을 만들기 위해, deriveWeeks가 만드는
    // week 목록에 없는 주차를 trendByPlatform이 스스로 채우지는 않는다 — 대신 광고를
    // 중간에 쉰 채널(주차는 존재하되 그 채널 행이 없는 경우)을 재현한다.
    const rows = deriveWeeks([
      row({ date: '2026-01-01', platform: 'naver' }),
      row({ date: '2026-01-15', platform: 'meta' }), // naver가 없는 주차를 하나 만든다(3주차)
    ]);
    const { series } = trendByPlatform(rows, PLATFORMS);
    const naver = series.find((s) => s.id === 'naver');
    const missingWeekPoint = naver.points.find((p) => p.week === 3);
    expect(missingWeekPoint.roas).toBeNull();
  });
});

describe('trendDirection — 앞뒤 절반 평균을 비교해 추세를 판단한다', () => {
  it('값 없음(null) 주차는 추세 판단에서 제외한다', () => {
    const points = [
      { week: 1, roas: 1 }, { week: 2, roas: 1 },
      { week: 3, roas: null }, // 이게 0으로 계산되면 우하향처럼 보인다 — 제외해야 정상
      { week: 4, roas: 2 }, { week: 5, roas: 2 },
    ];
    const { dir } = trendDirection(points, 'roas');
    expect(dir).toBe('up');
  });

  it('점이 4개 미만이면 판단하지 않고 보합으로 둔다', () => {
    const points = [{ week: 1, roas: 1 }, { week: 2, roas: 5 }];
    expect(trendDirection(points, 'roas').dir).toBe('flat');
  });
});

describe('funnelDiagnosis — CTR·전환율을 평균과 비교해 네 가지로 분류', () => {
  it('둘 다 평균보다 15% 이상 높으면 both-high', () => {
    expect(funnelDiagnosis(0.02, 0.05, 0.01, 0.02)).toBe('both-high');
  });
  it('CTR은 높고 전환율은 낮으면 ctr-high-cvr-low', () => {
    expect(funnelDiagnosis(0.02, 0.005, 0.01, 0.02)).toBe('ctr-high-cvr-low');
  });
  it('평균과 비슷하면(15% 안쪽) mixed', () => {
    expect(funnelDiagnosis(0.011, 0.021, 0.01, 0.02)).toBe('mixed');
  });
});

describe('byPlatform / byProduct — 그룹별 합산 후 데이터 없는 그룹은 뺀다', () => {
  it('행이 하나도 없는 플랫폼은 결과에서 제외한다', () => {
    const rows = deriveWeeks([row({ platform: 'naver' })]);
    const result = byPlatform(rows, PLATFORMS);
    expect(result.map((p) => p.id)).toEqual(['naver']);
  });

  it('제품별 합산도 같은 규칙을 따른다', () => {
    const rows = deriveWeeks([row({ product: '세럼' }), row({ product: '크림' })]);
    const result = byProduct(rows, ['세럼', '크림', '안 쓰는 제품']);
    expect(result.map((p) => p.id)).toEqual(['세럼', '크림']);
  });
});
