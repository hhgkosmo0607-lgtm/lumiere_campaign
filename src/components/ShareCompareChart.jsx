/**
 * 채널/제품별 "광고비 비중"과 "매출 비중"을 나란히 비교하는 막대.
 * "이 채널이 예산의 X%를 쓰는데 매출은 Y%만 낸다"를 문장이 아니라 눈으로 보게 한다.
 * 두 막대의 길이가 비슷하면 예산과 성과가 균형 잡혀 있다는 뜻, 광고비 막대가
 * 매출 막대보다 훨씬 길면 그만큼 비효율적으로 예산을 쓰고 있다는 뜻이다.
 */
export default function ShareCompareChart({ data }) {
  const totalSpend = data.reduce((a, d) => a + d.adSpend, 0);
  const totalRevenue = data.reduce((a, d) => a + d.revenue, 0);
  if (!totalSpend || !totalRevenue) return null;

  const W = 420;
  const rowH = 56;
  const barH = 12;
  const gap = 3;
  const padL = 60;
  const padR = 54;
  const padT = 8;
  const axisH = 20;
  const H = padT + data.length * rowH + axisH;
  const plotW = W - padL - padR;

  const x = (pctVal) => padL + pctVal * plotW;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img"
         aria-label="채널별 광고비 비중과 매출 비중 비교 막대 그래프">
      {ticks.map((t) => (
        <line key={t} x1={x(t)} y1={padT} x2={x(t)} y2={padT + data.length * rowH}
              stroke="#e9edf0" strokeWidth="1" />
      ))}

      {data.map((d, i) => {
        const spendShare = d.adSpend / totalSpend;
        const revenueShare = d.revenue / totalRevenue;
        const y = padT + i * rowH + rowH / 2 - (barH + gap);
        return (
          <g key={d.id}>
            <text x={padL - 10} y={y + barH + 2} textAnchor="end" fontSize="12" fill="#14181f"
                  fontFamily="IBM Plex Sans KR, sans-serif">
              {d.name}
            </text>

            {/* 광고비 비중: 회색 */}
            <rect x={padL} y={y} width={Math.max(1, x(spendShare) - padL)} height={barH}
                  fill="#949da8" rx="1" />
            <text x={x(spendShare) + 6} y={y + barH - 2} fontSize="9" fill="#5a636e"
                  fontFamily="IBM Plex Mono, monospace">
              광고비 {Math.round(spendShare * 100)}%
            </text>

            {/* 매출 비중: 채널/제품 색 */}
            <rect x={padL} y={y + barH + gap} width={Math.max(1, x(revenueShare) - padL)} height={barH}
                  fill={d.color} rx="1" />
            <text x={x(revenueShare) + 6} y={y + barH + gap + barH - 2} fontSize="9" fill="#14181f"
                  fontFamily="IBM Plex Mono, monospace" fontWeight="500">
              매출 {Math.round(revenueShare * 100)}%
            </text>
          </g>
        );
      })}

      {ticks.map((t) => (
        <text key={`t${t}`} x={x(t)} y={padT + data.length * rowH + 15} textAnchor="middle"
              fontSize="9" fill="#949da8" fontFamily="IBM Plex Mono, monospace">
          {Math.round(t * 100)}%
        </text>
      ))}
    </svg>
  );
}
