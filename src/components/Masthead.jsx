/**
 * 화면 맨 위 브랜드 영역. 대시보드 화면·빈 화면·오류 화면 셋 다 이 컴포넌트를 가져다 쓴다.
 * (그래서 여기 하나만 고치면 세 화면의 헤더가 한꺼번에 바뀐다 — 복사해서 세 번 넣지 않은 이유다.)
 * 로고는 svg 태그로 직접 그린 도형이다. 채널 막대 3개가 손익분기선을 넘었는지 —
 * 이 화면이 하는 일을 그대로 그린 마크다. 이미지 파일이 아니라 코드로 그려서, 화면
 * 색상 테마가 바뀌면(index.css의 --naver 등 색상 변수) 로고 색도 자동으로 따라간다.
 */
export default function Masthead() {
  return (
    <header className="masthead">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 60 52" aria-hidden="true">
          <line x1="4" y1="44" x2="56" y2="44" stroke="var(--line)" strokeWidth="1" />
          <line x1="4" y1="22" x2="56" y2="22" stroke="var(--breakeven)" strokeWidth="2" />
          <rect x="10" y="10" width="8" height="34" fill="var(--naver)" />
          <rect x="26" y="26" width="8" height="18" fill="var(--meta)" />
          <rect x="42" y="16" width="8" height="28" fill="var(--google)" />
        </svg>
        <h1 className="wordmark">Campaign Insight</h1>
      </div>
    </header>
  );
}
