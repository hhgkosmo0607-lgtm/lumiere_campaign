import { useEffect, useMemo, useState } from 'react';
import { fetchCampaigns, isConfigured } from './firebase';
import { fetchUpload } from './lib/uploadFirestore';
import { derivePlatforms } from './lib/platforms';
import sampleData from './sample-data.json';
import { withMetrics, deriveWeeks, aggregate, byPlatform, byProduct, trendByPlatform, trendDirection, funnelDiagnosis, PLATFORMS, platformInfo } from './lib/metrics';
import { sortRows } from './lib/sort';
import useDashboardState from './lib/useDashboardState';
import SummaryCards from './components/SummaryCards';
import CompareBarChart from './components/CompareBarChart';
import TrendLineChart from './components/TrendLineChart';
import ShareCompareChart from './components/ShareCompareChart';
import DataTable from './components/DataTable';
import Controls from './components/Controls';
import UploadPanel from './components/UploadPanel';

// '읽어낸 것' 문단은 채널 이름을 하드코딩한 문장이 아니라, metrics.js의 정형 진단 공식
// (funnelDiagnosis·trendDirection)이 내놓은 분류를 문장으로 바꾸는 표다 — 그래서 업로드한
// 어떤 데이터가 와도, 1등·꼴찌·추세가 바뀌어도 항상 그 채널에 맞는 설명이 나온다.
const FUNNEL_TEXT = {
  'both-high': '노출부터 구매까지 전 구간이 평균보다 강하다.',
  'ctr-high-cvr-low': '클릭은 평균보다 잘 나오지만, 클릭 이후 전환은 평균보다 약하다 — 랜딩페이지나 타겟팅을 점검할 지점이다.',
  'ctr-low-cvr-high': '클릭은 평균보다 적지만, 일단 들어온 사람은 확실히 산다 — 이미 살 마음이 있는 트래픽일 가능성이 높다.',
  'both-low': '클릭도 전환도 평균을 밑돈다.',
  mixed: '',
};

export default function App() {
  const [raw, setRaw] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | live | sample | error | upload
  const [activePlatforms, setActivePlatforms] = useState(PLATFORMS);
  const [datasetId] = useState(() => new URLSearchParams(window.location.search).get('d'));
  const [uploadNotice, setUploadNotice] = useState('');
  // 마진 데이터가 있을 때만 ROI로 전환할 수 있다. 없으면 항상 ROAS.
  const [metricView, setMetricView] = useState('roas');
  // 조회 조건 영역은 스크롤해도 따라오는데, 표를 오래 보는 동안은 접어서 자리를 줄일 수 있게 한다.
  const [controlsOpen, setControlsOpen] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // 맨 위로 스크롤을 올리면 조건을 다시 볼 확률이 높으니 자동으로 펼친다.
      if (window.scrollY <= 4) setControlsOpen(true);
      // 표가 1,800건이라 스크롤이 길어서, 어느 정도 내려가면 맨 위로 버튼을 보여준다.
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const {
    platform, product, from, to, sortKey, sortDir,
    setPlatform, setProduct, setRange, toggleSort, reset, isDefault,
  } = useDashboardState();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (datasetId) {
        try {
          const { rows, platforms } = await fetchUpload(datasetId);
          if (!alive) return;
          setRaw(rows);
          setActivePlatforms(platforms);
          setStatus('upload');
          return;
        } catch (e) {
          console.error(e);
          if (!alive) return;
          setUploadNotice(e.message || '공유된 데이터를 불러오지 못했습니다.');
          const url = new URL(window.location.href);
          url.searchParams.delete('d');
          window.history.replaceState(null, '', url);
        }
      }
      if (!isConfigured) {
        if (alive) {
          setRaw(sampleData);
          setActivePlatforms(derivePlatforms(sampleData));
          setStatus('sample');
        }
        return;
      }
      try {
        const docs = await fetchCampaigns();
        if (!alive) return;
        setRaw(docs);
        setActivePlatforms(derivePlatforms(docs));
        setStatus('live');
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setRaw(sampleData);
        setActivePlatforms(derivePlatforms(sampleData));
        setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, [datasetId]);

  const handleUploaded = (uploadedRows, uploadedPlatforms) => {
    setRaw(uploadedRows);
    setActivePlatforms(uploadedPlatforms);
    setStatus('upload');
    setUploadNotice('');
    reset();
  };

  // 날짜→주차 변환과 지표 계산은 lib/metrics.js가 담당한다 (deriveWeeks, withMetrics).
  const rows = useMemo(() => deriveWeeks(raw.map(withMetrics)), [raw]);

  // 데이터가 가진 주차 범위. 주소에 이상한 값이 들어와도 여기서 걸러진다.
  const [minWeek, maxWeek] = useMemo(() => {
    if (rows.length === 0) return [1, 1];
    const ws = rows.map((r) => r.week);
    return [Math.min(...ws), Math.max(...ws)];
  }, [rows]);

  const products = useMemo(() => [...new Set(rows.map((r) => r.product))], [rows]);

  // 주소로 들어온 채널·제품 값도 실제 데이터에 있는 값인지 확인한다 (예: from/to를 주차 범위로 보정하는 것과 같은 방식).
  const safePlatform = platform === 'all' || activePlatforms.some((p) => p.id === platform) ? platform : 'all';
  const safeProduct = product === 'all' || products.includes(product) ? product : 'all';

  const lo = Math.min(Math.max(from ?? minWeek, minWeek), maxWeek);
  const hi = Math.max(Math.min(to ?? maxWeek, maxWeek), minWeek);

  // 조건을 한 번만 적용하고, 카드·그래프·표는 모두 이 결과를 나눠 쓴다.
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (safePlatform === 'all' || r.platform === safePlatform) &&
          (safeProduct === 'all' || r.product === safeProduct) &&
          r.week >= lo &&
          r.week <= hi
      ),
    [rows, safePlatform, safeProduct, lo, hi]
  );

  const totals = useMemo(() => aggregate(filtered), [filtered]);
  const platforms = useMemo(() => byPlatform(filtered, activePlatforms), [filtered, activePlatforms]);
  const productData = useMemo(() => byProduct(filtered, products), [filtered, products]);
  const trend = useMemo(() => trendByPlatform(filtered, activePlatforms), [filtered, activePlatforms]);
  const tableRows = useMemo(
    () => sortRows(filtered, sortKey, sortDir, activePlatforms),
    [filtered, sortKey, sortDir, activePlatforms]
  );

  if (status === 'loading') return <div className="state">데이터를 불러오는 중…</div>;

  // 마진이 없으면 ROI 자체가 없으니 무조건 ROAS. 손익분기는 ROAS면 실제 마진 기준(없으면 100%),
  // ROI면 이익이 0이 되는 지점 그 자체다.
  const showMetricToggle = totals.roi != null;
  const metric = showMetricToggle ? metricView : 'roas';
  const breakevenValue = metric === 'roi' ? 0 : totals.breakevenRoas;
  const metricLabel = metric === 'roas' ? 'ROAS' : 'ROI';

  const sorted = [...platforms].sort((a, b) => b.roas - a.roas);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spendAll = filtered.reduce((a, r) => a + r.adSpend, 0);
  const revAll = filtered.reduce((a, r) => a + r.revenue, 0);
  // 채널 전체·제품 전체를 볼 때만 채널 간 비교가 의미 있다. 진단 공식이 데이터 기반이라
  // 업로드한 데이터에도 그대로 맞는다 — 데모 전용이던 예전 제약은 없앴다.
  const showTakeaway = safePlatform === 'all' && safeProduct === 'all' && best && worst && best.id !== worst.id;

  // 채널별 추세 중 가장 뚜렷한(변화율이 가장 큰) 채널 하나를 찾는다. 전부 보합이면 null.
  const trendPick = showTakeaway
    ? trend.series
        .map((s) => ({ ...s, ...trendDirection(s.points, metric) }))
        .filter((s) => s.dir !== 'flat')
        .reduce((a, b) => (!a || Math.abs(b.change) > Math.abs(a.change) ? b : a), null)
    : null;
  const worstBelowBreakeven = showTakeaway && worst[metric] < breakevenValue;

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          {/* 로고: 채널 막대가 손익분기선을 넘었는지 — 이 화면이 하는 일을 그대로 그린 마크 */}
          <svg className="brand-mark" viewBox="0 0 60 52" aria-hidden="true">
            <line x1="4" y1="44" x2="56" y2="44" stroke="var(--line)" strokeWidth="1" />
            <line x1="4" y1="22" x2="56" y2="22" stroke="var(--breakeven)" strokeWidth="2" />
            <rect x="10" y="10" width="8" height="34" fill="var(--naver)" />
            <rect x="26" y="26" width="8" height="18" fill="var(--meta)" />
            <rect x="42" y="16" width="8" height="28" fill="var(--google)" />
          </svg>
          <h1 className="wordmark">Campaign Insight</h1>
        </div>
      </header>

      <div className="sticky-top">
        <div className="controls-bar">
          <span className="controls-summary num">
            {safePlatform === 'all' ? '전체 채널' : platformInfo(safePlatform, activePlatforms).name}
            {' · '}
            {safeProduct === 'all' ? '전체 제품' : safeProduct}
            {' · '}
            {lo}–{hi}주
          </span>
          <button type="button" className="ghost" onClick={() => setControlsOpen((v) => !v)}>
            {controlsOpen ? '조건 접기' : '조건 펼치기'}
          </button>
        </div>

        {controlsOpen && (
          <>
            <Controls
              platforms={activePlatforms}
              platform={safePlatform}
              onPlatform={setPlatform}
              products={products}
              product={safeProduct}
              onProduct={setProduct}
              from={lo}
              to={hi}
              min={minWeek}
              max={maxWeek}
              onRange={setRange}
              onReset={reset}
              isDefault={isDefault}
            />

            <UploadPanel onUploaded={handleUploaded} />

            {uploadNotice && <p className="upload-error">{uploadNotice}</p>}
          </>
        )}
      </div>

      {filtered.length > 0 && <SummaryCards totals={totals} />}

      {filtered.length === 0 ? (
        <p className="state">선택한 조건에 해당하는 데이터가 없습니다. 조건을 넓혀보세요.</p>
      ) : (
        <>
          {showMetricToggle && (
            <div className="metric-toggle">
              <button
                type="button"
                className={`ghost ${metricView === 'roas' ? 'on' : ''}`}
                onClick={() => setMetricView('roas')}
              >
                ROAS
              </button>
              <button
                type="button"
                className={`ghost ${metricView === 'roi' ? 'on' : ''}`}
                onClick={() => setMetricView('roi')}
              >
                ROI
              </button>
              <span className="hint">
                {metricView === 'roas'
                  ? '광고비 대비 매출 비율'
                  : '원가까지 뺀, 실제로 남는 이익 기준'}
              </span>
            </div>
          )}

          <div className="panels">
            <section className="panel">
              <h2>채널별 {metricLabel}</h2>
              <p className="hint">
                {metric === 'roas'
                  ? '광고비 대비 매출. 어디에 예산을 더 쓸지 판단하는 기준.'
                  : '원가까지 뺀 실제 수익성. 마이너스면 팔수록 손해라는 뜻.'}
              </p>
              <CompareBarChart data={platforms} metric={metric} breakevenValue={breakevenValue} />
            </section>

            <section className="panel">
              <h2>주차별 {metricLabel} 추이</h2>
              <p className="hint">같은 채널도 시간이 지나며 효율이 달라진다. 점에 마우스를 올리면 정확한 수치가 뜬다.</p>
              <TrendLineChart weeks={trend.weeks} series={trend.series} metric={metric} breakevenValue={breakevenValue} />
            </section>

            {products.length > 1 && (
              <section className="panel">
                <h2>제품별 {metricLabel}</h2>
                <p className="hint">어느 제품이 예산을 더 받을 자격이 있는지 판단하는 기준.</p>
                <CompareBarChart data={productData} metric={metric} breakevenValue={breakevenValue} />
              </section>
            )}

            <section className="panel">
              <h2>광고비 비중 vs 매출 비중</h2>
              <p className="hint">두 막대 길이가 비슷할수록 예산과 성과가 균형 잡혀 있다는 뜻.</p>
              <ShareCompareChart data={platforms} />
            </section>
          </div>

          <p className="eyebrow">원본 데이터 · {tableRows.length}건</p>
          <DataTable
            rows={tableRows}
            platforms={activePlatforms}
            products={products}
            showRoi={totals.roi != null}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />

          {showTakeaway && (
            <section className="takeaway">
              <p className="eyebrow">읽어낸 것</p>
              <ol>
                <li>
                  <span className="idx">01</span>
                  <span>
                    <b>{best.name}</b>의 ROAS가 {Math.round(best.roas * 100)}%로 가장 높다.{' '}
                    {FUNNEL_TEXT[funnelDiagnosis(best.ctr, best.cvr, totals.ctr, totals.cvr)]}
                  </span>
                </li>
                <li>
                  <span className="idx">02</span>
                  <span>
                    <b>{worst.name}</b>는 이 구간 광고비의{' '}
                    {Math.round((worst.adSpend / spendAll) * 100)}%를 쓰고 매출은{' '}
                    {Math.round((worst.revenue / revAll) * 100)}%다.{' '}
                    {FUNNEL_TEXT[funnelDiagnosis(worst.ctr, worst.cvr, totals.ctr, totals.cvr)]}
                  </span>
                </li>
                <li>
                  <span className="idx">03</span>
                  <span>
                    {trendPick ? (
                      <>
                        <b>{trendPick.name}</b>은 주차가 지날수록 {trendPick.dir === 'up' ? '오르고' : '떨어지고'} 있다.{' '}
                        {trendPick.dir === 'up'
                          ? '초반 숫자만 보고 껐다면 손해였을 구간이다.'
                          : '이대로면 갈수록 효율이 나빠질 채널이다.'}
                      </>
                    ) : (
                      '이 구간 동안 채널별 순위가 크게 바뀌지 않았다 — 지금 배분을 유지해도 무방하다.'
                    )}
                  </span>
                </li>
                <li>
                  <span className="idx">04</span>
                  <span>
                    <b>제안</b> — {worst.name} 예산의 일부를 {best.name}로 옮긴다
                    {worstBelowBreakeven ? `. ${worst.name}는 지금 손익분기 밑이라 조정이 시급하다` : ''}.{' '}
                    {worst.name}는 예산을 줄이는 대신 소재를 교체해 클릭 이후의 이탈을 먼저 잡는다.
                    {trendPick && trendPick.dir === 'up' && ` ${trendPick.name}은 상승 추세이므로 유지한다.`}
                    {trendPick && trendPick.dir === 'down' && ` ${trendPick.name}은 하락 추세이니 함께 점검한다.`}
                  </span>
                </li>
              </ol>
            </section>
          )}
        </>
      )}

      {showScrollTop && (
        <button
          type="button"
          className="scroll-top"
          aria-label="맨 위로"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}
    </div>
  );
}
