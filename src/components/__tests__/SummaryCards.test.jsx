import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryCards from '../SummaryCards.jsx';

const totals = {
  adSpend: 1000000, revenue: 2500000, roas: 2.5, cvr: 0.021, cac: 15000,
};

describe('SummaryCards', () => {
  it('계산은 하지 않고 넘겨받은 totals 값을 그대로 화면에 찍는다', () => {
    render(<SummaryCards totals={totals} />);
    // won(1000000) = "1,000,000"
    expect(screen.getByText('1,000,000')).toBeInTheDocument();
    // pct(2.5, 0) = "250"
    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('카드 3장(광고비·ROAS·전환율)이 모두 렌더링된다', () => {
    render(<SummaryCards totals={totals} />);
    expect(screen.getByText('총 광고비')).toBeInTheDocument();
    expect(screen.getByText('ROAS')).toBeInTheDocument();
    expect(screen.getByText('전환율')).toBeInTheDocument();
  });
});
