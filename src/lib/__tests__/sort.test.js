import { describe, it, expect } from 'vitest';
import { sortRows } from '../sort.js';

const PLATFORMS = [
  { id: 'naver', name: '네이버', color: '#000' },
  { id: 'meta', name: '메타', color: '#111' },
];

describe('sortRows', () => {
  it('원본 배열을 직접 바꾸지 않는다 (복사본을 정렬해서 돌려준다)', () => {
    const rows = [{ week: 2, platform: 'meta' }, { week: 1, platform: 'naver' }];
    const original = [...rows];
    sortRows(rows, 'week', 'asc', PLATFORMS);
    expect(rows).toEqual(original); // 원본 순서 그대로여야 한다
  });

  it('숫자 컬럼을 오름차순/내림차순으로 정렬한다', () => {
    const rows = [{ week: 3, roas: 3 }, { week: 1, roas: 1 }, { week: 2, roas: 2 }];
    expect(sortRows(rows, 'roas', 'asc').map((r) => r.roas)).toEqual([1, 2, 3]);
    expect(sortRows(rows, 'roas', 'desc').map((r) => r.roas)).toEqual([3, 2, 1]);
  });

  it('채널은 문자열 순서가 아니라 화면에 나열된 순서를 따른다', () => {
    // 가나다순이면 "메타"가 "네이버"보다 앞이지만, PLATFORMS 배열 순서(naver가 먼저)를 따라야 한다.
    const rows = [{ platform: 'meta', week: 1 }, { platform: 'naver', week: 1 }];
    const sorted = sortRows(rows, 'platform', 'asc', PLATFORMS);
    expect(sorted.map((r) => r.platform)).toEqual(['naver', 'meta']);
  });

  it('정렬 기준 값이 같으면 주차→채널 순으로 항상 같은 순서를 만든다', () => {
    const rows = [
      { roas: 1, week: 2, platform: 'meta' },
      { roas: 1, week: 1, platform: 'naver' },
      { roas: 1, week: 1, platform: 'meta' },
    ];
    const sorted = sortRows(rows, 'roas', 'asc', PLATFORMS);
    expect(sorted.map((r) => `${r.week}-${r.platform}`)).toEqual(['1-naver', '1-meta', '2-meta']);
  });
});
