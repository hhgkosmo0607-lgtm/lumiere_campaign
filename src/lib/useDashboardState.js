import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * 대시보드의 모든 조회 조건(플랫폼, 주차 구간, 정렬)을 한 곳에서 관리한다.
 *
 * 필터가 늘어날수록 각 컴포넌트가 따로 계산하면 카드·그래프·표의 숫자가
 * 어긋나기 쉽다. 조건은 여기서만 바뀌고, 화면은 그 결과를 받아 그리기만 한다.
 *
 * 상태는 동시에 주소창에도 반영된다. 링크를 복사해서 보내면
 * 상대방도 똑같이 걸러진 화면을 본다.
 *   예) ?platform=meta&from=5&to=8&sort=roas&dir=desc
 */

const DEFAULTS = {
  platform: 'all',
  product: 'all', // 업로드 데이터에 제품이 있을 때만 의미가 생긴다. 데모 데이터는 항상 'all'.
  from: null, // null = 데이터의 첫 주차
  to: null, // null = 데이터의 마지막 주차
  sortKey: 'week',
  sortDir: 'asc',
};

const SORT_KEYS = [
  'week',
  'platform',
  'product',
  'adSpend',
  'impressions',
  'clicks',
  'conversions',
  'revenue',
  'ctr',
  'cpc',
  'cvr',
  'roas',
  'profit',
  'roi',
];

function readFromUrl() {
  if (typeof window === 'undefined') return DEFAULTS;
  const p = new URLSearchParams(window.location.search);

  const num = (key) => {
    const v = Number(p.get(key));
    return p.get(key) !== null && Number.isFinite(v) ? v : null;
  };

  const sortKey = p.get('sort');
  const sortDir = p.get('dir');

  return {
    platform: p.get('platform') || DEFAULTS.platform,
    product: p.get('product') || DEFAULTS.product,
    from: num('from'),
    to: num('to'),
    sortKey: SORT_KEYS.includes(sortKey) ? sortKey : DEFAULTS.sortKey,
    sortDir: sortDir === 'desc' || sortDir === 'asc' ? sortDir : DEFAULTS.sortDir,
  };
}

function writeToUrl(state) {
  if (typeof window === 'undefined') return;
  // 기존 주소에 있던, 이 훅이 관리하지 않는 값(예: 업로드 데이터셋 id)은 그대로 둔다.
  const p = new URLSearchParams(window.location.search);

  const sync = (key, value, isDefault) => {
    if (isDefault) p.delete(key);
    else p.set(key, value);
  };

  // 기본값은 주소에 넣지 않는다. 주소가 짧을수록 공유했을 때 읽기 쉽다.
  sync('platform', state.platform, state.platform === DEFAULTS.platform);
  sync('product', state.product, state.product === DEFAULTS.product);
  sync('from', state.from, state.from === null);
  sync('to', state.to, state.to === null);
  sync('sort', state.sortKey, state.sortKey === DEFAULTS.sortKey);
  sync('dir', state.sortDir, state.sortDir === DEFAULTS.sortDir);

  const qs = p.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export default function useDashboardState() {
  const [state, setState] = useState(readFromUrl);

  // 상태가 바뀔 때마다 주소창을 갱신
  useEffect(() => {
    writeToUrl(state);
  }, [state]);

  // 뒤로/앞으로 가기로 주소가 바뀐 경우 상태를 되돌린다
  useEffect(() => {
    const onPop = () => setState(readFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setPlatform = useCallback(
    (platform) => setState((s) => ({ ...s, platform })),
    []
  );

  const setProduct = useCallback(
    (product) => setState((s) => ({ ...s, product })),
    []
  );

  const setRange = useCallback(
    (from, to) =>
      setState((s) => ({
        ...s,
        from: Math.min(from, to),
        to: Math.max(from, to),
      })),
    []
  );

  // 같은 컬럼을 다시 누르면 방향만 뒤집는다.
  // 다른 컬럼으로 옮길 때는 숫자 컬럼이면 큰 값부터 보는 쪽이 자연스럽다.
  const toggleSort = useCallback((key) => {
    if (!SORT_KEYS.includes(key)) return;
    setState((s) => {
      if (s.sortKey === key) {
        return { ...s, sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' };
      }
      const textual = key === 'week' || key === 'platform';
      return { ...s, sortKey: key, sortDir: textual ? 'asc' : 'desc' };
    });
  }, []);

  const reset = useCallback(() => setState({ ...DEFAULTS }), []);

  const isDefault = useMemo(
    () =>
      state.platform === DEFAULTS.platform &&
      state.product === DEFAULTS.product &&
      state.from === null &&
      state.to === null &&
      state.sortKey === DEFAULTS.sortKey &&
      state.sortDir === DEFAULTS.sortDir,
    [state]
  );

  return { ...state, setPlatform, setProduct, setRange, toggleSort, reset, isDefault };
}
