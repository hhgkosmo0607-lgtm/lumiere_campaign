import { won, pct } from '../lib/metrics';

export default function SummaryCards({ totals }) {
  return (
    <div className="cards">
      <div className="card">
        <p className="card-label">총 광고비</p>
        <p className="card-value num">
          {won(totals.adSpend)}
          <span className="unit">원</span>
        </p>
        <p className="card-sub">
          매출 <span className="num">{won(totals.revenue)}</span>원
        </p>
      </div>

      <div className="card">
        <p className="card-label">
          <span className="term" data-tip="광고비 대비 매출 비율 (매출 ÷ 광고비). 100%를 넘으면 광고비보다 매출이 많다는 뜻">ROAS</span>
        </p>
        <p className="card-value num">
          {pct(totals.roas, 0)}
          <span className="unit">%</span>
        </p>
        <p className="card-sub">
          광고비 1원당 <span className="num">{totals.roas.toFixed(1)}</span>원 매출
        </p>
      </div>

      <div className="card">
        <p className="card-label">
          <span className="term" data-tip="클릭 대비 구매 비율 (전환수 ÷ 클릭수). 들어온 사람이 얼마나 실제로 샀는지">전환율</span>
        </p>
        <p className="card-value num">
          {pct(totals.cvr, 2)}
          <span className="unit">%</span>
        </p>
        <p className="card-sub">
          고객 1명 확보 <span className="num">{won(totals.cac)}</span>원
        </p>
      </div>
    </div>
  );
}
