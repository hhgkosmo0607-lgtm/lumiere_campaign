import { useState } from 'react';
import PropTypes from 'prop-types';
import { platformInfo, won, pct } from '../lib/metrics.js';

const PAGE_SIZE = 50;

const PRODUCT_COLUMN = { key: 'product', label: '제품', align: 'left' };
const PROFIT_COLUMN = {
  key: 'profit',
  label: '이익',
  tip: '매출에서 원가와 광고비를 뺀 순이익 (원). 마이너스면 팔수록 손해라는 뜻',
};
const ROI_COLUMN = {
  key: 'roi',
  label: 'ROI',
  tip: '광고비 대비 순이익 비율 ((매출-원가-광고비) ÷ 광고비). 원가(마진)까지 뺀 진짜 수익성',
};

const OTHER_COLUMNS = [
  { key: 'adSpend', label: '광고비', tip: '이 기간에 실제로 쓴 광고비' },
  { key: 'impressions', label: '노출수', tip: '광고가 사람들 화면에 보여진 횟수' },
  { key: 'clicks', label: '클릭수', tip: '광고를 클릭한 횟수' },
  { key: 'conversions', label: '전환수', tip: '클릭한 사람 중 실제로 구매까지 이어진 수' },
  { key: 'revenue', label: '매출', tip: '이 전환들로 발생한 매출' },
  { key: 'ctr', label: 'CTR', tip: '노출 대비 클릭 비율 (클릭수 ÷ 노출수). 광고가 얼마나 눈길을 끌었는지' },
  { key: 'cpc', label: '클릭단가', tip: '클릭 1번을 얻는 데 든 비용 (광고비 ÷ 클릭수)' },
  { key: 'cvr', label: '전환율', tip: '클릭 대비 구매 비율 (전환수 ÷ 클릭수). 들어온 사람이 얼마나 실제로 샀는지' },
  { key: 'roas', label: 'ROAS', tip: '광고비 대비 매출 비율 (매출 ÷ 광고비). 100%를 넘으면 광고비보다 매출이 많다는 뜻' },
];

export default function DataTable({ rows, platforms, products, showRoi, sortKey, sortDir, onSort }) {
  // 제품이 여러 개일 때만 제품 컬럼을 보여준다 (하나뿐이면 모든 행이 같은 값이라 의미가 없다).
  const showProduct = products.length > 1;
  const COLUMNS = [
    { key: 'date', label: '날짜', align: 'left' },
    { key: 'week', label: '주차', align: 'left' },
    { key: 'platform', label: '채널', align: 'left' },
    ...(showProduct ? [PRODUCT_COLUMN] : []),
    ...OTHER_COLUMNS,
    ...(showRoi ? [PROFIT_COLUMN, ROI_COLUMN] : []),
  ];

  const [page, setPage] = useState(0);
  // 조건이 바뀌어 행 목록 자체가 달라지면 이전 페이지 번호는 의미가 없어진다.
  // useEffect(() => setPage(0), [rows])로 짜면 "먼저 옛 페이지로 한 번 그리고, 그 다음에
  // effect가 실행돼 0페이지로 다시 그리는" 화면 깜빡임(불필요한 리렌더링 한 번)이 생긴다.
  // 대신 "렌더링 도중에 이전 값과 비교해서 즉시 조정하는" 방식(React 공식 문서가 권장하는
  // 패턴)을 쓰면, 화면에 옛 페이지가 잠깐이라도 그려지지 않고 바로 0페이지로 그려진다.
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(0);
  }

  // rows가 비면 App.jsx가 이 컴포넌트 자체를 안 그린다 (필터링은 App.jsx에서 한 번만 한다는 원칙).
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sortKey === c.key;
              return (
                <th
                  key={c.key}
                  className={c.align === 'left' ? 'left' : undefined}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className="sort-btn" onClick={() => onSort(c.key)}>
                    {c.tip ? (
                      <span className="term term--below" data-tip={c.tip}>{c.label}</span>
                    ) : (
                      c.label
                    )}
                    <span className={`caret ${active ? 'on' : ''}`}>
                      {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => {
            const c = platformInfo(r.platform, platforms);
            return (
              <tr key={`${r.date}-${r.platform}-${r.product}`}>
                <td>{r.date}</td>
                <td className="num">{r.week}</td>
                <td>
                  <span className="chip">
                    <i style={{ background: c.color }} />
                    {c.name}
                  </span>
                </td>
                {showProduct && <td>{r.product}</td>}
                <td className="num">{won(r.adSpend)}</td>
                <td className="num">{won(r.impressions)}</td>
                <td className="num">{won(r.clicks)}</td>
                <td className="num">{won(r.conversions)}</td>
                <td className="num">{won(r.revenue)}</td>
                <td className="num">{pct(r.ctr, 2)}%</td>
                <td className="num">{won(r.cpc)}</td>
                <td className="num">{pct(r.cvr, 2)}%</td>
                <td className={`num ${r.roas >= 1 ? 'pos' : 'neg'}`}>{pct(r.roas, 0)}%</td>
                {/* <>...</>는 Fragment라 부른다. React는 컴포넌트가 태그 하나만 돌려주길
                    기대하는데, <td> 두 개를 감쌀 <div> 같은 걸 넣으면 표(<table>) 구조가
                    깨진다(불필요한 태그가 <tr> 안에 끼어든다). Fragment는 "화면엔 아무
                    흔적도 안 남기면서 여러 요소를 하나로 묶어주는" 투명한 포장지다. */}
                {showRoi && (
                  <>
                    <td className={`num ${r.profit >= 0 ? 'pos' : 'neg'}`}>{won(r.profit)}</td>
                    <td className={`num ${r.roi >= 0 ? 'pos' : 'neg'}`}>{pct(r.roi, 0)}%</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {pageCount > 1 && (
        <div className="table-pagination">
          <button
            type="button"
            className="ghost"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            이전
          </button>
          <span className="num">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, rows.length)} / {rows.length}건
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

DataTable.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  platforms: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
  })).isRequired,
  products: PropTypes.arrayOf(PropTypes.string).isRequired,
  showRoi: PropTypes.bool.isRequired,
  sortKey: PropTypes.string.isRequired,
  sortDir: PropTypes.oneOf(['asc', 'desc']).isRequired,
  onSort: PropTypes.func.isRequired,
};
