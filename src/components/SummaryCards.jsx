import PropTypes from 'prop-types';
import { won, pct } from '../lib/metrics.js';

/**
 * 화면 맨 위 카드 3장(총 광고비, ROAS, 전환율). 계산은 하나도 안 하고, App.jsx가 이미
 * aggregate()로 다 계산해서 넘겨준 totals 값을 그대로 화면에 찍기만 한다 — 이 컴포넌트가
 * "표시 전용"이라는 걸 보여주는 가장 단순한 예다. won()·pct()는 metrics.js의 표시 형식
 * 함수로, 숫자를 "1,234,567" "12.3%" 같은 사람이 읽기 좋은 글자로 바꿔준다.
 */
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

SummaryCards.propTypes = {
  totals: PropTypes.shape({
    adSpend: PropTypes.number.isRequired,
    revenue: PropTypes.number.isRequired,
    roas: PropTypes.number.isRequired,
    cvr: PropTypes.number.isRequired,
    cac: PropTypes.number.isRequired,
  }).isRequired,
};
