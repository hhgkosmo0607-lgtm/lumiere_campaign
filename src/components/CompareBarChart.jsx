import { pct } from '../lib/metrics';

const LOSS_COLOR = '#c0392b';

/**
 * 플랫폼/제품별 비교 가로 막대. data 배열이 {id,name,color,desc,roas,roi} 모양이면
 * 무엇이든 그릴 수 있는 범용 컴포넌트라, 플랫폼 비교와 제품 비교 양쪽에 재사용한다.
 *
 * 손익분기 지점에 점선을 그어 "이 선을 넘겼는가"가 한눈에 보이도록 했다.
 * metric이 'roas'면 광고비 대비 매출, 'roi'면 원가까지 뺀 진짜 수익성을 그린다.
 * ROI는 마이너스(손해)가 나올 수 있어서, 축이 0 아래로도 내려간다 — 그럴 땐 막대가
 * 손익분기선(0%) 기준으로 왼쪽으로 뻗고, 손해를 뜻하는 빨간색으로 칠해진다.
 */
export default function CompareBarChart({ data, metric = 'roas', breakevenValue = 1 }) {
  const W = 420;
  const rowH = 52;
  const padL = 60;
  const padR = 54;
  const padT = 8;
  const axisH = 26;
  const H = padT + data.length * rowH + axisH;
  const plotW = W - padL - padR;

  const values = data.map((d) => d[metric]);
  const floor = metric === 'roas' ? 5 : 0.5; // 값이 작을 때도 축이 너무 좁아지지 않게
  const rawMax = Math.max(floor, breakevenValue, ...values);
  const rawMin = Math.min(0, breakevenValue, ...values);
  const span = rawMax - rawMin || 1;
  const maxVal = rawMax + span * 0.08;
  const minVal = rawMin - (rawMin < 0 ? span * 0.08 : 0);

  const x = (v) => padL + ((v - minVal) / (maxVal - minVal)) * plotW;
  const zeroX = x(0);

  const tickStep = metric === 'roas' ? 1 : 0.5;
  const ticks = [];
  for (let t = Math.ceil(minVal / tickStep) * tickStep; t <= maxVal + 1e-9; t += tickStep) {
    ticks.push(Math.round(t * 1000) / 1000);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img"
         aria-label={`${metric === 'roas' ? 'ROAS' : 'ROI'} 비교 막대 그래프`}>
      {ticks.map((t) => (
        <line key={t} x1={x(t)} y1={padT} x2={x(t)} y2={padT + data.length * rowH}
              stroke="#e9edf0" strokeWidth="1" />
      ))}

      {/* 손익분기선 */}
      <line x1={x(breakevenValue)} y1={padT - 2} x2={x(breakevenValue)} y2={padT + data.length * rowH}
            stroke={LOSS_COLOR} strokeWidth="1" strokeDasharray="3 3" />
      <text x={x(breakevenValue)} y={padT + data.length * rowH + 17} fill={LOSS_COLOR} fontSize="9"
            textAnchor="middle" fontFamily="IBM Plex Mono, monospace" letterSpacing="0.5">
        손익분기 {pct(breakevenValue, 0)}%
      </text>

      {data.map((d, i) => {
        const v = d[metric];
        const y = padT + i * rowH;
        const barY = y + rowH / 2 - 9;
        const barX = Math.min(zeroX, x(v));
        const barW = Math.max(1, Math.abs(x(v) - zeroX));
        const negative = v < 0;
        return (
          <g key={d.id}>
            <text x={padL - 10} y={barY + 13} textAnchor="end" fontSize="12" fill="#14181f"
                  fontFamily="IBM Plex Sans KR, sans-serif">
              {d.name}
            </text>
            <rect x={barX} y={barY} width={barW} height="18"
                  fill={negative ? LOSS_COLOR : d.color} rx="1" />
            {/* 음수 막대는 왼쪽 끝(축 바깥)에 라벨을 붙이면 이름과 겹칠 수 있어
                손익분기선 쪽(안쪽)에 붙인다. padL 근처로는 절대 넘어가지 않게 여유를 둔다. */}
            <text
              x={negative ? Math.max(padL + 22, zeroX - 8) : x(v) + 8}
              y={barY + 13}
              fontSize="12"
              fill="#14181f"
              textAnchor={negative ? 'end' : 'start'}
              fontFamily="IBM Plex Mono, monospace"
              fontWeight="500"
            >
              {pct(v, 0)}%
            </text>
            {d.desc && (
              <text x={padL} y={barY + 33} fontSize="10" fill="#949da8"
                    fontFamily="IBM Plex Sans KR, sans-serif">
                {d.desc}
              </text>
            )}
          </g>
        );
      })}

      {ticks.map((t) => (
        <text key={`t${t}`} x={x(t)} y={padT + data.length * rowH + 17} textAnchor="middle"
              fontSize="9" fill="#949da8" fontFamily="IBM Plex Mono, monospace">
          {/* 손익분기 라벨이 훨씬 길어서, 실제 픽셀 거리로 겹침을 판단한다 */}
          {Math.abs(x(t) - x(breakevenValue)) < 34 ? '' : `${Math.round(t * 100)}%`}
        </text>
      ))}
    </svg>
  );
}
