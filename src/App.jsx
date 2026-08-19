import { useEffect, useMemo, useState } from 'react';
import { fetchCampaigns, isConfigured } from './firebase';
import { fetchUpload } from './lib/uploadFirestore';
import { derivePlatforms } from './lib/platforms';
import sampleData from './sample-data.json';
import { withMetrics, deriveWeeks, aggregate, byPlatform, byProduct, trendByPlatform, won, PLATFORMS } from './lib/metrics';
import { sortRows } from './lib/sort';
import useDashboardState from './lib/useDashboardState';
import SummaryCards from './components/SummaryCards';
import CompareBarChart from './components/CompareBarChart';
import TrendLineChart from './components/TrendLineChart';
import ShareCompareChart from './components/ShareCompareChart';
import DataTable from './components/DataTable';
import Controls from './components/Controls';
import UploadPanel from './components/UploadPanel';

// '읽어낸 것' 문단에서 1등·꼴찌 채널이 데이터에 따라 바뀌어도 설명이 항상 맞도록,
// 채널별 강점·약점 한 문장을 따로 관리한다(문장 안에 채널명을 직접 박아두지 않는다).
const PLATFORM_STRENGTH = {
  naver: '검색은 이미 살 마음이 있는 사람이 들어오는 자리라 전환율이 다른 채널보다 뚜렷하게 높다.',
  kakao: '카카오톡 선물하기처럼 특정 상황에 맞는 제품이 있으면 전환이 몰리는 채널이다.',
  google: '리타겟팅 대상이 쌓일수록 좋아지는 채널이라, 주차가 지날수록 성과가 오른다.',
  meta: '피드·릴스 노출이 많아 클릭 자체는 잘 나오는 채널이다.',
};
const PLATFORM_WEAKNESS = {
  meta: '클릭은 가장 많이 나오지만 소재 피로도가 쌓이며 전환으로 이어지는 비율이 떨어진다.',
  naver: '검색 키워드 단가가 높아 물량을 늘리면 ROAS가 금방 떨어지는 채널이다.',
  google: '리타겟팅 모수가 쌓이기 전 초반 구간은 성과가 낮다.',
  kakao: '목적성 구매 의도가 약해 노출 대비 전환은 낮은 편이다.',
};

export default function App() {
  const [raw, setRaw] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | live | sample | error | upload
  const [activePlatforms, setActivePlatforms] = useState(PLATFORMS);
  const [datasetId] = useState(() => new URLSearchParams(window.location.search).get('d'));
  const [uploadNotice, setUploadNotice] = useState('');
  // 마진 데이터가 있을 때만 ROI로 전환할 수 있다. 없으면 항상 ROAS.
  const [metricView, setMetricView] = useState('roas');

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
  // '읽어낸 것' 문단은 LUMIÈRE 데모 데이터(네이버·메타·구글 캐릭터)를 전제로 쓴 고정 텍스트라
  // 업로드된 데이터셋에는 맞지 않는다. 데모일 때만 보여준다.
  const showTakeaway = status !== 'upload' && safePlatform === 'all' && safeProduct === 'all' && best && worst && best.id !== worst.id;

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1 className="wordmark">Campaign Insight</h1>
          <p className="masthead-meta">
            {status === 'upload' ? '업로드한 캠페인' : '샘플: 루미에르 스킨케어 5개 제품 캠페인'} ·{' '}
            <span>{lo}–{hi}주 / 전체 {maxWeek}주</span>
          </p>
        </div>
      </header>

      <div className="sticky-top">
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
              <p className="hint">같은 채널도 시간이 지나며 효율이 달라진다.</p>
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
                    {PLATFORM_STRENGTH[best.id] ?? ''}
                  </span>
                </li>
                <li>
                  <span className="idx">02</span>
                  <span>
                    <b>{worst.name}</b>는 이 구간 광고비의{' '}
                    {Math.round((worst.adSpend / spendAll) * 100)}%를 쓰고 매출은{' '}
                    {Math.round((worst.revenue / revAll) * 100)}%다. {PLATFORM_WEAKNESS[worst.id] ?? ''}
                  </span>
                </li>
                <li>
                  <span className="idx">03</span>
                  <span>
                    <b>구글</b>은 주차가 지날수록 올라간다. 리타겟팅 대상이 쌓이는 채널이라 초반
                    숫자만 보고 껐다면 손해였을 구간이다.
                  </span>
                </li>
                <li>
                  <span className="idx">04</span>
                  <span>
                    <b>제안</b> — {worst.name} 예산의 일부를 {best.name}로 옮기고, {worst.name}는
                    예산을 줄이는 대신 소재를 교체해 클릭 이후의 이탈을 먼저 잡는다. 구글은 상승
                    추세이므로 유지한다.
                  </span>
                </li>
              </ol>
            </section>
          )}
        </>
      )}

      <p className="footnote">
        {status === 'live' && 'Firestore campaigns 컬렉션에서 불러온 데이터입니다. '}
        {status === 'sample' &&
          'Firebase 설정 전이라 샘플 데이터로 표시하고 있습니다. .env 파일을 채우면 Firestore에서 불러옵니다. '}
        {status === 'error' &&
          'Firestore 연결에 실패해 샘플 데이터로 표시하고 있습니다. 콘솔 오류를 확인하세요. '}
        {status === 'upload' &&
          '업로드한 데이터로 표시하고 있습니다. 이 링크를 아는 사람은 누구나 볼 수 있습니다. '}
        조회 조건은 주소에 저장됩니다. 링크를 복사해 보내면 상대방도 같은 화면을 봅니다.{' '}
        {status === 'upload' ? (
          <>전체 광고비 {won(rows.reduce((a, r) => a + r.adSpend, 0))}원.</>
        ) : (
          <>
            루미에르(LUMIÈRE)는 실존하지 않는 가상 브랜드이며, 모든 수치는 채널·제품 특성을 반영해
            직접 설계한 가상 데이터입니다. 전체 광고비{' '}
            {won(rows.reduce((a, r) => a + r.adSpend, 0))}원.
          </>
        )}
      </p>
    </div>
  );
}
