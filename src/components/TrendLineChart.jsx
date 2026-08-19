import { pct } from '../lib/metrics';

/**
 * 채널/제품별 주차 추이 선그래프.
 * 선이 벌어지는 모양 자체가 이 대시보드의 결론이라 마지막 점에는 이름을 직접 붙였다
 * (범례를 눈으로 왕복하지 않도록).
 * metric이 'roas'면 광고비 대비 매출, 'roi'면 원가까지 뺀 진짜 수익성을 그린다.
 * ROI는 마이너스(손해)가 나올 수 있어서 축이 0 아래로도 내려간다.
 */
export default function TrendLineChart({ weeks, series, metric = 'roas', breakevenValue = 1 }) {
  const W = 560;
  const H = 250;
  const padL = 42;
  const padR = 58;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const values = series.flatMap((s) => s.points.map((p) => p[metric]));
  const floor = metric === 'roas' ? 5 : 0.5;
  const rawMax = Math.max(floor, breakevenValue, ...values);
  const rawMin = Math.min(0, breakevenValue, ...values);
  const span = rawMax - rawMin || 1;
  const maxVal = rawMax + span * 0.08;
  const minVal = rawMin - (rawMin < 0 ? span * 0.08 : 0);

  const x = (w) =>
    weeks.length === 1
      ? padL + plotW / 2
      : padL + ((w - weeks[0]) / (weeks.length - 1)) * plotW;
  const y = (v) => padT + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  const tickStep = metric === 'roas' ? 1 : 0.5;
  const gridVals = [];
  for (let v = Math.ceil(minVal / tickStep) * tickStep; v <= maxVal + 1e-9; v += tickStep) {
    gridVals.push(Math.round(v * 1000) / 1000);
  }

  // 주차가 많아지면(예: 1년치 52주) 라벨을 전부 찍으면 서로 겹쳐 읽을 수 없다.
  // 라벨이 대략 13개를 넘지 않도록 일정 간격으로만 보여주고, 마지막 주차는 항상 보여준다.
  const labelStep = Math.max(1, Math.ceil(weeks.length / 13));
  const labelWeeks = weeks.filter((w, i) => i % labelStep === 0 || i === weeks.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img"
         aria-label={`주차별 ${metric === 'roas' ? 'ROAS' : 'ROI'} 추이 선 그래프`}>
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={padL + plotW} y2={y(v)}
                stroke="#e9edf0" strokeWidth="1" />
          <text x={padL - 8} y={y(v) + 3} textAnchor="end" fontSize="9"
                fill="#949da8"
                fontFamily="IBM Plex Mono, monospace">
            {/* 두 라벨이 같은 줄에 겹쳐 보이지 않도록, 실제 세로 픽셀 거리로 겹침을 판단한다 */}
            {Math.abs(y(v) - y(breakevenValue)) < 10 ? '' : `${Math.round(v * 100)}%`}
          </text>
        </g>
      ))}

      {/* 손익분기선 */}
      <line x1={padL} y1={y(breakevenValue)} x2={padL + plotW} y2={y(breakevenValue)}
            stroke="#c0392b" strokeWidth="1" strokeDasharray="3 3" />
      <text x={padL - 8} y={y(breakevenValue) + 3} textAnchor="end" fontSize="9"
            fill="#c0392b" fontFamily="IBM Plex Mono, monospace">
        {pct(breakevenValue, 0)}%
      </text>

      {labelWeeks.map((w) => (
        <text key={w} x={x(w)} y={H - 10} textAnchor="middle" fontSize="9" fill="#949da8"
              fontFamily="IBM Plex Mono, monospace">
          {w}주
        </text>
      ))}

      {series.map((s) => {
        const d = s.points.map((p) => `${x(p.week)},${y(p[metric])}`).join(' ');
        const last = s.points[s.points.length - 1];
        return (
          <g key={s.id}>
            <polyline points={d} fill="none" stroke={s.color} strokeWidth="1.8"
                      strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p) => (
              <circle key={p.week} cx={x(p.week)} cy={y(p[metric])} r="2.4" fill={s.color} />
            ))}
            <text x={x(last.week) + 8} y={y(last[metric]) + 3} fontSize="10" fill={s.color}
                  fontFamily="IBM Plex Sans KR, sans-serif" fontWeight="600">
              {s.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
