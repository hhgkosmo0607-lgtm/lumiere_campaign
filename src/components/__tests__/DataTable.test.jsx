import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable from '../DataTable.jsx';

const PLATFORMS = [{ id: 'naver', name: '네이버', color: '#000' }];
const row = (i) => ({
  date: `2026-${String(Math.floor((i - 1) / 28) + 1).padStart(2, '0')}-${String(((i - 1) % 28) + 1).padStart(2, '0')}`,
  week: 1, platform: 'naver', product: '전체',
  adSpend: 1000, impressions: 100, clicks: 10, conversions: 1, revenue: 2000,
  ctr: 0.1, cpc: 100, cvr: 0.1, roas: 2,
});

describe('DataTable — 조건이 바뀌면(rows가 새 배열이 되면) 1페이지로 돌아간다', () => {
  it('rows가 바뀌면 이전 페이지 번호를 유지하지 않고 1페이지부터 다시 보여준다', () => {
    const many = Array.from({ length: 120 }, (_, i) => row(i + 1));
    const { rerender } = render(
      <DataTable rows={many} platforms={PLATFORMS} products={['전체']} showRoi={false}
                 sortKey="week" sortDir="asc" onSort={() => {}} />
    );
    // 2페이지로 이동
    fireEvent.click(screen.getByText('다음'));
    expect(screen.getByText('51–100 / 120건')).toBeInTheDocument();

    // 채널을 바꿔서 완전히 새로운 rows 배열이 들어왔다고 가정(참조가 달라짐).
    // 두 페이지 이상 남기려고 80행으로 줄인다 — 페이지가 1개뿐이면 페이지네이션 자체가
    // 화면에서 사라지므로(pageCount > 1일 때만 보임), "1페이지로 돌아갔는지"를 확인할 수 없다.
    const fewer = many.slice(0, 80);
    rerender(
      <DataTable rows={fewer} platforms={PLATFORMS} products={['전체']} showRoi={false}
                 sortKey="week" sortDir="asc" onSort={() => {}} />
    );
    expect(screen.getByText('1–50 / 80건')).toBeInTheDocument();
  });
});
