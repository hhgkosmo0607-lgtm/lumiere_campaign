import { describe, it, expect } from 'vitest';
import { toIsoDate, toNumber } from '../parseExcel.js';

describe('toIsoDate — 날짜를 YYYY-MM-DD로 (실제로 있었던 버그의 재발 방지)', () => {
  // 실제로 있었던 버그: 예전 코드는 toISOString()으로 날짜를 만들었다. 그런데 xlsx는
  // 엑셀의 '진짜 날짜 셀'을 로컬 자정 Date로 돌려주기 때문에, 한국(UTC+9)에서는
  // 2026-05-01 00:00 KST가 UTC로는 2026-04-30 15:00이 돼서 하루씩 밀렸다.
  // 우리가 만든 샘플 파일은 날짜를 문자열로 저장해 이 경로를 타지 않아 못 잡았고,
  // 실제 플랫폼이 내보내는 리포트에서만 터질 버그였다.
  it('로컬 자정 Date 객체를 그날 날짜 그대로 읽는다 (하루 밀리지 않는다)', () => {
    expect(toIsoDate(new Date(2026, 4, 1, 0, 0, 0))).toBe('2026-05-01');
    expect(toIsoDate(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01'); // 해가 바뀌는 경계
    expect(toIsoDate(new Date(2026, 11, 31, 0, 0, 0))).toBe('2026-12-31');
  });

  it('YYYY-MM-DD 문자열은 그대로 통과시킨다', () => {
    expect(toIsoDate('2026-05-01')).toBe('2026-05-01');
    expect(toIsoDate('  2026-05-01  ')).toBe('2026-05-01');
    expect(toIsoDate('2026-05-01T00:00:00')).toBe('2026-05-01');
  });

  it('다른 구분자를 쓴 날짜도 읽는다', () => {
    expect(toIsoDate('2026/05/01')).toBe('2026-05-01');
  });

  it('날짜가 아니면 null을 돌려준다', () => {
    expect(toIsoDate('합계')).toBeNull();
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate('2026-13-45')).toBeNull(); // 형태만 맞고 실제로는 없는 날짜
  });
});

describe('toNumber — 리포트의 숫자 표기 흡수', () => {
  it('천단위 콤마와 공백을 걷어낸다', () => {
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber(' 1,234,567 ')).toBe(1234567);
    expect(toNumber(0)).toBe(0);
  });

  it('빈 값·숫자가 아닌 값은 NaN', () => {
    expect(toNumber('')).toBeNaN();
    expect(toNumber(null)).toBeNaN();
    expect(toNumber('없음')).toBeNaN();
  });
});
