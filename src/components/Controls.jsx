import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * 채널·제품·기간을 고르는 조작 영역. 이 컴포넌트는 값을 직접 바꾸지 않는다 —
 * 사용자가 뭔가를 클릭하면 부모(App.jsx)가 넘겨준 함수(onPlatform, onRange 등)를
 * 호출만 하고, 실제로 상태를 바꾸는 건 App.jsx(정확히는 useDashboardState 훅)가 한다.
 * 이렇게 "값과 값을 바꾸는 방법은 부모가 갖고, 자식은 그걸 전달만 받는" 패턴을
 * 제어 컴포넌트(controlled component)라고 부른다 — 아래 <select>에서 실제로 쓰인다.
 */
export default function Controls({
  platforms,
  platform,
  onPlatform,
  products,
  product,
  onProduct,
  from,
  to,
  min,
  max,
  onRange,
  onReset,
  isDefault,
}) {
  // "복사됨" 문구를 잠깐 보여주기 위한 상태. 이건 다른 컴포넌트와 공유할 필요가 없는
  // 이 컴포넌트만의 임시 상태라서, App.jsx가 아니라 여기서 직접 useState로 관리한다.
  const [copied, setCopied] = useState(false);

  // 기간 슬라이더의 좌우 손잡이 위치를 퍼센트(%)로 바꾸는 계산.
  // 예: 전체 구간이 1~13주이고 지금 5주를 가리키면 (5-1)/(13-1)*100 ≈ 33%.
  const span = Math.max(1, max - min);
  const pos = (v) => ((v - min) / span) * 100;

  // "최근 4주" 버튼: 끝은 항상 max(가장 최근 주차)로 고정하고 시작만 4주 전으로 당긴다.
  const preset = (weeks) => onRange(Math.max(min, max - weeks + 1), max);
  // 지금 선택된 기간이 "최근 N주" 버튼과 정확히 같은 구간인지 — 같으면 버튼을 강조 표시한다.
  const isRecent = (weeks) => from === max - weeks + 1 && to === max;

  // 지금 주소(채널·기간 조건이 담긴 URL)를 클립보드에 복사한다. navigator.clipboard는
  // 브라우저가 제공하는 기능이라 실패할 수도 있어(권한 문제 등) try/catch로 감싼다.
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600); // 1.6초 뒤 "복사됨" 문구를 원래대로 되돌림
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="controls">
      <div className="control">
        <label htmlFor="platform">채널</label>
        <select id="platform" value={platform} onChange={(e) => onPlatform(e.target.value)}>
          <option value="all">전체</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {products.length > 1 && (
        <div className="control">
          <label htmlFor="product">제품</label>
          <select id="product" value={product} onChange={(e) => onProduct(e.target.value)}>
            <option value="all">전체</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="control range-control">
        <label htmlFor="from">
          기간
          <span className="range-readout num">
            {from}–{to}주
          </span>
        </label>

        <div className="range">
          <div className="range-track" />
          <div
            className="range-fill"
            style={{ left: `${pos(from)}%`, right: `${100 - pos(to)}%` }}
          />
          <input
            id="from"
            type="range"
            min={min}
            max={max}
            value={from}
            aria-label="시작 주차"
            onChange={(e) => onRange(Number(e.target.value), to)}
          />
          <input
            id="to"
            type="range"
            min={min}
            max={max}
            value={to}
            aria-label="종료 주차"
            onChange={(e) => onRange(from, Number(e.target.value))}
          />
        </div>
      </div>

      <div className="control preset-control">
        <button
          type="button"
          className={`ghost ${from === min && to === max ? 'on' : ''}`}
          onClick={() => onRange(min, max)}
        >
          전체
        </button>
        <button
          type="button"
          className={`ghost ${isRecent(4) ? 'on' : ''}`}
          onClick={() => preset(4)}
        >
          최근 4주
        </button>
      </div>

      <div className="control action-control">
        <button type="button" className="ghost" onClick={copyLink}>
          {copied ? '복사됨' : '링크 복사'}
        </button>
        <button type="button" className="ghost" onClick={onReset} disabled={isDefault}>
          초기화
        </button>
      </div>
    </div>
  );
}

Controls.propTypes = {
  platforms: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  platform: PropTypes.string.isRequired,
  onPlatform: PropTypes.func.isRequired,
  products: PropTypes.arrayOf(PropTypes.string).isRequired,
  product: PropTypes.string.isRequired,
  onProduct: PropTypes.func.isRequired,
  from: PropTypes.number.isRequired,
  to: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  onRange: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  isDefault: PropTypes.bool.isRequired,
};
