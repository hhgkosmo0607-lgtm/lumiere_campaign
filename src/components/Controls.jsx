import { useState } from 'react';

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
  const [copied, setCopied] = useState(false);

  const span = Math.max(1, max - min);
  const pos = (v) => ((v - min) / span) * 100;

  const preset = (weeks) => onRange(Math.max(min, max - weeks + 1), max);
  const isRecent = (weeks) => from === max - weeks + 1 && to === max;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
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
