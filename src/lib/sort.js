import { PLATFORMS } from './metrics';

/**
 * 표 정렬. 플랫폼은 이름이 아니라 화면에 쓰인 플랫폼 목록(platformList)의 순서를 따른다.
 * 값이 같으면 항상 주차 → 플랫폼 순으로 정리해서, 정렬 결과가 매번 동일하게 나오도록 했다.
 */
export function sortRows(rows, key, dir, platformList = PLATFORMS) {
  const sign = dir === 'desc' ? -1 : 1;
  const order = platformList.map((p) => p.id);

  const value = (r) => (key === 'platform' ? order.indexOf(r.platform) : r[key]);

  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av !== bv) return (av < bv ? -1 : 1) * sign;
    if (a.week !== b.week) return a.week - b.week;
    return order.indexOf(a.platform) - order.indexOf(b.platform);
  });
}
