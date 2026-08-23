import { describe, it, expect } from 'vitest';
import { buildCsv, buildFileName } from '../exportCsv.js';

const PLATFORMS = [{ id: 'naver', name: '네이버', color: '#000' }];

const row = (over = {}) => ({
  date: '2026-01-01', week: 1, platform: 'naver', product: '세럼',
  adSpend: 1000, impressions: 100, clicks: 10, conversions: 1, revenue: 2000,
  ctr: 0.1, cpc: 100, cvr: 0.1, roas: 2, profit: 500, roi: 0.5,
  ...over,
});

describe('buildCsv', () => {
  it('비율을 화면 문자열("200%")이 아니라 계산 가능한 숫자(2)로 넣는다', () => {
    const csv = buildCsv([row()], { platforms: PLATFORMS, showProduct: true, showRoi: true });
    const [, dataLine] = csv.split('\r\n');
    expect(dataLine).toContain('2'); // roas 2 (200%가 아니라)
    expect(dataLine).not.toContain('%');
  });

  it('제품 컬럼은 showProduct가 false면 안 넣는다', () => {
    const csv = buildCsv([row()], { platforms: PLATFORMS, showProduct: false, showRoi: false });
    const [header] = csv.split('\r\n');
    expect(header).not.toContain('제품');
  });

  it('이익·ROI 컬럼은 showRoi가 true일 때만 넣는다', () => {
    const withRoi = buildCsv([row()], { platforms: PLATFORMS, showProduct: false, showRoi: true });
    const withoutRoi = buildCsv([row()], { platforms: PLATFORMS, showProduct: false, showRoi: false });
    expect(withRoi.split('\r\n')[0]).toContain('ROI');
    expect(withoutRoi.split('\r\n')[0]).not.toContain('ROI');
  });

  it('값에 쉼표가 있으면 따옴표로 감싼다 (CSV 형식이 깨지지 않게)', () => {
    const csv = buildCsv([row({ product: '린넨셔츠, 화이트' })], { platforms: PLATFORMS, showProduct: true, showRoi: false });
    expect(csv).toContain('"린넨셔츠, 화이트"');
  });
});

describe('buildFileName', () => {
  it('조건이 "전체"면 파일명에서 뺀다 (이름이 길어지지 않게)', () => {
    const name = buildFileName({ platform: 'all', product: 'all', from: 1, to: 13, platforms: PLATFORMS });
    expect(name).not.toContain('전체');
    expect(name).toContain('1-13주');
  });

  it('구체적인 조건이면 파일명에 채널·제품이 들어간다', () => {
    const name = buildFileName({ platform: 'naver', product: '세럼', from: 5, to: 8, platforms: PLATFORMS });
    expect(name).toContain('네이버');
    expect(name).toContain('세럼');
    expect(name).toContain('5-8주');
  });

  it('.csv로 끝난다', () => {
    const name = buildFileName({ platform: 'all', product: 'all', from: 1, to: 1, platforms: PLATFORMS });
    expect(name.endsWith('.csv')).toBe(true);
  });
});
