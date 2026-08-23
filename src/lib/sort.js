import { PLATFORMS } from './metrics.js';

/**
 * 표 정렬. 플랫폼은 이름이 아니라 화면에 쓰인 플랫폼 목록(platformList)의 순서를 따른다.
 * 값이 같으면 항상 주차 → 플랫폼 순으로 정리해서, 정렬 결과가 매번 동일하게 나오도록 했다.
 *
 * `[...rows].sort(...)`처럼 배열을 스프레드(`...`)로 한 번 복사한 뒤 정렬하는 이유:
 * 자바스크립트의 `.sort()`는 원본 배열을 직접 뒤바꿔버린다(in-place). 원본 rows를
 * 그대로 정렬하면 이 함수를 호출한 쪽이 갖고 있던 원래 순서도 같이 망가진다. 복사본을
 * 만들어서 그 복사본만 정렬하면 원본은 그대로 두고 "정렬된 새 배열"만 돌려줄 수 있다.
 */
export function sortRows(rows, key, dir, platformList = PLATFORMS) {
  const sign = dir === 'desc' ? -1 : 1;   // 'desc'(내림차순)면 비교 결과를 뒤집는다
  const order = platformList.map((p) => p.id);

  // 채널(platform)은 문자열 그대로 비교하면 "구글, 네이버, 메타, 카카오"처럼 가나다순이
  // 돼버린다. 화면에 실제로 나열된 순서(platformList)를 기준으로 삼기 위해, 채널 이름 대신
  // 그 순서상의 번호(0, 1, 2, 3...)로 바꿔서 비교한다.
  const value = (r) => (key === 'platform' ? order.indexOf(r.platform) : r[key]);

  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av !== bv) return (av < bv ? -1 : 1) * sign;
    // 정렬 기준 값이 같은 행이 여러 개면(예: ROAS가 똑같은 두 행) 순서가 뒤섞일 수 있다.
    // 항상 같은 부가 기준(주차→채널)으로 한 번 더 정리해서, 같은 데이터면 몇 번을
    // 다시 정렬해도 항상 같은 순서가 나오게 한다.
    if (a.week !== b.week) return a.week - b.week;
    return order.indexOf(a.platform) - order.indexOf(b.platform);
  });
}
