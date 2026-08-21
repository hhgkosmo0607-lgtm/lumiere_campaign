import { useRef, useState } from 'react';
import { pct } from '../lib/metrics';

/**
 * 채널/제품별 주차 추이 선그래프.
 * 선이 벌어지는 모양 자체가 이 대시보드의 결론이라 마지막 점에는 이름을 직접 붙였다
 * (범례를 눈으로 왕복하지 않도록).
 * metric이 'roas'면 광고비 대비 매출, 'roi'면 원가까지 뺀 진짜 수익성을 그린다.
 * ROI는 마이너스(손해)가 나올 수 있어서 축이 0 아래로도 내려간다.
 * 마우스를 올리면 가장 가까운 점 하나만 짚어서 정확한 수치를 보여준다
 * (그 주차의 모든 채널을 한꺼번에 보여주면 지금 보고 싶은 점이 뭔지 헷갈린다).
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
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null); // { si, pi } — series index, point index

  // 값이 없는 주차(광고를 안 돌린 기간)는 축 범위 계산에서 뺀다.
  const values = series.flatMap((s) => s.points.map((p) => p[metric])).filter((v) => v != null);
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

  // 화면 좌표를 SVG viewBox 좌표로 바꾼 뒤, 모든 (채널×주차) 점 중 마우스에 가장 가까운 하나를 찾는다.
  const handleMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    let best = null;
    let bestDist = Infinity;
    series.forEach((s, si) => {
      s.points.forEach((p, pi) => {
        if (p[metric] == null) return;
        const dx = x(p.week) - mx;
        const dy = y(p[metric]) - my;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = { si, pi };
        }
      });
    });
    setHover(best);
  };

  const hoverPoint = hover ? series[hover.si].points[hover.pi] : null;
  const hoverSeries = hover ? series[hover.si] : null;

  const tipW = 96;
  const tipH = 34;
  let tipX = 0;
  let tipY = 0;
  let px = 0;
  let py = 0;
  if (hoverPoint) {
    px = x(hoverPoint.week);
    py = y(hoverPoint[metric]);
    tipX = px + 10 + tipW > W - 4 ? px - 10 - tipW : px + 10;
    tipY = py - tipH - 10 < padT ? py + 12 : py - tipH - 10;
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 980, height: 'auto', display: 'block' }} role="img"
         aria-label={`주차별 ${metric === 'roas' ? 'ROAS' : 'ROI'} 추이 선 그래프`}
         onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
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
        // 값이 없는 주차에서 선을 끊는다 — 광고를 쉰 구간을 0%로 이어 그리면
        // "완전히 실패한 주"처럼 보이기 때문이다. 이어지는 구간마다 선을 따로 그린다.
        const segments = [];
        let current = [];
        s.points.forEach((p) => {
          if (p[metric] == null) {
            if (current.length) segments.push(current);
            current = [];
          } else {
            current.push(p);
          }
        });
        if (current.length) segments.push(current);

        const shown = s.points.filter((p) => p[metric] != null);
        const last = shown[shown.length - 1];
        if (!last) return null;   // 조건에 걸려 데이터가 하나도 없는 채널

        return (
          <g key={s.id}>
            {segments.map((seg) => (
              <polyline key={seg[0].week} points={seg.map((p) => `${x(p.week)},${y(p[metric])}`).join(' ')}
                        fill="none" stroke={s.color} strokeWidth="1.8"
                        strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {shown.map((p) => (
              <circle key={p.week} cx={x(p.week)} cy={y(p[metric])} r="2.4" fill={s.color} />
            ))}
            {/* 이름표는 그 채널의 마지막 '실제 데이터가 있는' 점 옆에 붙는다 */}
            <text x={x(last.week) + 8} y={y(last[metric]) + 3} fontSize="10" fill={s.color}
                  fontFamily="IBM Plex Sans KR, sans-serif" fontWeight="600">
              {s.name}
            </text>
          </g>
        );
      })}

      {/* 마우스를 올리면 가장 가까운 점 하나만 짚어서 보여준다. */}
      <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" />

      {hoverPoint && (
        <g pointerEvents="none">
          <circle cx={px} cy={py} r="4.5" fill={hoverSeries.color} stroke="#fff" strokeWidth="1.5" />
          <rect x={tipX} y={tipY} width={tipW} height={tipH} fill="#14181f" rx="2" />
          <text x={tipX + 8} y={tipY + 14} fontSize="10" fill={hoverSeries.color} fontFamily="IBM Plex Sans KR, sans-serif" fontWeight="600">
            {hoverSeries.name}
          </text>
          <text x={tipX + 8} y={tipY + 27} fontSize="10" fill="#fff" fontFamily="IBM Plex Mono, monospace">
            {hoverPoint.week}주 · {pct(hoverPoint[metric], 0)}%
          </text>
        </g>
      )}
    </svg>
  );
}
