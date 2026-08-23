/**
 * 이 앱의 심장. 데이터를 어디서 가져올지 결정하고(빈 화면 / 샘플 / 업로드),
 * 사용자가 고른 조건(채널·제품·기간)으로 딱 한 번만 걸러낸 뒤, 그 결과를 카드·그래프·
 * 표 컴포넌트들에게 나눠준다. 계산은 절대 여기서 직접 하지 않는다 — lib/metrics.js의
 * 함수들을 부를 뿐이다. "화면을 조립하는 곳"과 "숫자를 계산하는 곳"을 분리해두면,
 * 계산식이 바뀌어도 이 파일은 거의 안 바뀌고, 화면 배치가 바뀌어도 계산 파일은 안 바뀐다.
 */
import { useEffect, useMemo, useReducer, useState } from 'react';
import { isConfigured } from './firebase.js';
import { fetchUpload } from './lib/uploadFirestore.js';
import { parseSavedCsv } from './lib/importSavedCsv.js';
import { derivePlatforms } from './lib/platforms.js';
import { withMetrics, deriveWeeks, aggregate, byPlatform, byProduct, trendByPlatform, trendDirection, funnelDiagnosis, PLATFORMS, platformInfo } from './lib/metrics.js';
import { buildCsv, buildFileName, downloadCsv } from './lib/exportCsv.js';
import { sortRows } from './lib/sort.js';
import useDashboardState from './lib/useDashboardState.js';
import SummaryCards from './components/SummaryCards.jsx';
import CompareBarChart from './components/CompareBarChart.jsx';
import TrendLineChart from './components/TrendLineChart.jsx';
import ShareCompareChart from './components/ShareCompareChart.jsx';
import DataTable from './components/DataTable.jsx';
import Controls from './components/Controls.jsx';
import UploadPanel from './components/UploadPanel.jsx';
import Masthead from './components/Masthead.jsx';

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

// dataset(raw·status·activePlatforms·notice) 상태를 한 번에 갈아 끼우는 리듀서.
// 액션은 세 가지뿐이다 — 이 화면이 데이터를 얻는 방법이 딱 세 가지(빈 화면 시작,
// 성공적으로 불러옴, 실패)이기 때문이다. 새 데이터 소스가 생겨도 이 세 액션 중
// 하나로 표현될 가능성이 높다.
const initialDataset = { raw: [], status: 'loading', activePlatforms: PLATFORMS, notice: '' };

function datasetReducer(state, action) {
  switch (action.type) {
    case 'empty':
      // 볼 데이터가 없는 상태로 되돌린다. notice가 있으면(불러오기 실패) 그 이유를 남긴다.
      return { raw: [], status: 'empty', activePlatforms: PLATFORMS, notice: action.notice ?? '' };
    case 'loaded':
      // 공유 링크 / 샘플 / 방금 업로드 — 어느 경로든 "성공적으로 데이터를 얻었다"는
      // 같은 모양의 결과라 하나의 액션으로 합쳐도 된다. status만 다르게 받는다.
      return { raw: action.rows, status: action.status, activePlatforms: action.platforms, notice: '' };
    default:
      return state;
  }
}

export default function App() {
  // raw(원본 행)·status(화면 국면)·activePlatforms(이 데이터에 실제로 있는 채널)·
  // uploadNotice(안내 문구)는 항상 "한 데이터 소스를 성공/실패로 갈아 끼울 때" 다같이 바뀐다.
  // 예전엔 이 넷을 각각 useState로 따로 관리해서, "샘플을 불러왔다"는 사건 하나를 표현하는 데
  // setRaw·setActivePlatforms·setStatus 세 줄을 매번 나란히 호출해야 했다(그 셋이 세트라는
  // 사실이 코드 어디에도 적혀있지 않았다). 리듀서로 묶으면 "이 넷은 하나의 데이터셋 상태"라는
  // 관계가 dataset 액션 목록 하나로 명확해진다. (리듀서 정의는 파일 맨 아래 datasetReducer)
  const [dataset, dispatchDataset] = useReducer(datasetReducer, initialDataset);
  const { raw, status, activePlatforms, notice: uploadNotice } = dataset;
  const [loadingSample, setLoadingSample] = useState(false);
  const [datasetId] = useState(() => new URLSearchParams(window.location.search).get('d'));
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
      // 공유 링크(?d=...)로 들어온 경우에만 서버에서 데이터를 받아온다.
      // 그 외에는 아무것도 불러오지 않고 빈 화면에서 시작한다 — 사용자가 자기 리포트를
      // 올리는 게 이 도구의 출발점이고, 쓰지도 않을 데이터를 매번 받아올 이유가 없다.
      if (!datasetId) {
        if (alive) dispatchDataset({ type: 'empty' });
        return;
      }
      try {
        const { rows, platforms } = await fetchUpload(datasetId);
        if (!alive) return;
        dispatchDataset({ type: 'loaded', status: 'upload', rows, platforms });
      } catch (e) {
        console.error(e);
        if (!alive) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('d');
        window.history.replaceState(null, '', url);
        dispatchDataset({ type: 'empty', notice: e.message || '공유된 데이터를 불러오지 못했습니다.' });
      }
    })();
    return () => { alive = false; };
  }, [datasetId]);

  // 샘플 데이터(약 290KB)는 "둘러보기"를 누른 사람만 받아간다.
  const showSample = async () => {
    setLoadingSample(true);
    try {
      const mod = await import('./sample-data.json');
      const rows = mod.default;
      dispatchDataset({ type: 'loaded', status: 'sample', rows, platforms: derivePlatforms(rows) });
    } catch (e) {
      console.error(e);
      dispatchDataset({ type: 'empty', notice: '샘플 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.' });
    } finally {
      setLoadingSample(false);
    }
  };

  // "CSV로 내려받기"로 저장해둔 파일을 다시 올리면, 서버에 새로 올리지 않고 샘플을
  // 볼 때와 같은 방식으로 브라우저 안에서 바로 화면을 복원한다 — 매칭·마진 입력을
  // 다시 할 필요가 없다(그 정보가 이미 파일 안에 들어있다).
  const importSavedCsv = async (file) => {
    setLoadingSample(true);
    try {
      const res = await parseSavedCsv(file);
      if (!res.ok) {
        dispatchDataset({ type: 'empty', notice: res.error });
        return;
      }
      dispatchDataset({ type: 'loaded', status: 'imported', rows: res.rows, platforms: derivePlatforms(res.rows) });
    } finally {
      setLoadingSample(false);
    }
  };

  const handleUploaded = (uploadedRows, uploadedPlatforms) => {
    dispatchDataset({ type: 'loaded', status: 'upload', rows: uploadedRows, platforms: uploadedPlatforms });
    reset();
  };

  // 날짜→주차 변환과 지표 계산은 lib/metrics.js가 담당한다 (deriveWeeks, withMetrics).
  // raw.map(withMetrics)로 모든 행에 CTR·ROAS 등을 먼저 붙이고, 그 결과를 deriveWeeks에
  // 넘겨 주차 번호까지 붙인다 — "1부-1-2 데이터가 흐르는 길"의 ②③ 단계가 이 한 줄이다.
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

  // ★ 이 프로젝트에서 가장 중요한 한 줄. 조건(채널·제품·기간)을 여기서 딱 한 번만
  // 적용하고, 아래의 카드·그래프·표는 전부 이 filtered 하나만 받아서 쓴다. 컴포넌트마다
  // 각자 원본 rows를 다시 걸러내게 두면, 필터 로직이 여러 곳에 복사되고 하나만 실수로
  // 다르게 짜여도 화면끼리 숫자가 어긋난다 — 그걸 막으려고 한 곳으로 강제한 것이다.
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

  // 아직 볼 데이터가 없는 상태. 이 도구는 사용자가 자기 리포트를 올리는 데서 시작하므로,
  // 남의 데이터를 미리 채워두지 않고 무엇을 하면 되는지만 보여준다.
  if (status === 'empty') {
    return (
      <div className="shell">
        <Masthead />
        <section className="landing">
          <p className="landing-lead">
            네이버·구글·메타·카카오에서 받은 광고 리포트를 그대로 올리면,
            채널을 가로질러 비교하는 한 화면이 만들어집니다.
            원가(마진율)까지 넣으면 광고 플랫폼이 알려주지 못하는 실제 이익까지 계산합니다.
          </p>
          {isConfigured ? (
            <UploadPanel onUploaded={handleUploaded} startOpen />
          ) : (
            <p className="hint">
              지금은 업로드 기능이 꺼져 있습니다 (Firebase 설정 없음). 아래 샘플로 화면을 볼 수 있습니다.
            </p>
          )}
          <p className="landing-alt">
            올릴 파일이 없다면{' '}
            <button type="button" className="linklike" onClick={showSample} disabled={loadingSample}>
              {loadingSample ? '불러오는 중…' : '샘플 데이터로 둘러보기'}
            </button>
            {' '}— 가상의 스킨케어 브랜드가 4개 채널에 90일간 광고한 데이터입니다.
            <br />
            전에 이 화면에서 CSV로 내려받아둔 파일이 있다면{' '}
            <label className="linklike">
              그 파일 불러오기
              <input
                type="file"
                accept=".csv"
                hidden
                disabled={loadingSample}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) importSavedCsv(file);
                }}
              />
            </label>
            {' '}— 서버에 다시 올리지 않고 그 자리에서 바로 복원됩니다. 캠페인 매칭·마진 입력을 다시 할 필요가 없습니다.
          </p>
          {uploadNotice && <p className="upload-error">{uploadNotice}</p>}
        </section>
      </div>
    );
  }

  // 마진이 없으면 ROI 자체가 없으니 무조건 ROAS. 손익분기는 ROAS면 실제 마진 기준(없으면 100%),
  // ROI면 이익이 0이 되는 지점 그 자체다.
  const showMetricToggle = totals.roi != null;
  const metric = showMetricToggle ? metricView : 'roas';
  const breakevenValue = metric === 'roi' ? 0 : totals.breakevenRoas;
  const metricLabel = metric === 'roas' ? 'ROAS' : 'ROI';

  // 화면 표는 50행씩 나눠 보여주지만, 파일에는 지금 조건으로 걸러진 전체가 들어간다.
  const handleExport = () => {
    const text = buildCsv(tableRows, {
      platforms: activePlatforms,
      showProduct: products.length > 1,
      showRoi: totals.roi != null,
    });
    downloadCsv(text, buildFileName({
      platform: safePlatform, product: safeProduct, from: lo, to: hi, platforms: activePlatforms,
    }));
  };

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
      <Masthead />

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

          <p className="eyebrow">
            원본 데이터 · {tableRows.length}건
            <button type="button" className="ghost csv-btn" onClick={handleExport}>
              CSV로 내려받기
            </button>
          </p>
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
