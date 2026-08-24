---
description: React 앱 변경사항을 preview.html에 반영
allowed-tools: Read, Write, Edit, Grep, Glob
---

`preview.html` 을 현재 React 앱과 같은 화면이 되도록 갱신해줘.

`preview.html` 은 npm 설치 없이 브라우저에서 바로 결과물을 보여주는 미리보기다. React 앱과 화면이 달라지면 미리보기의 의미가 없어진다.

작업 순서:

1. `src/index.css` 전체를 `<style>` 안에 그대로 넣어줘
2. `src/lib/metrics.js`, `src/lib/sort.js`, `src/lib/useDashboardState.js` 의 로직을 순수 JS로 옮겨줘
3. 각 컴포넌트가 만드는 마크업을 템플릿 문자열로 옮겨줘
4. 데이터는 `src/sample-data.json`(기본 데모, 90일×4채널×5제품) 내용을 `RAW` 상수로 박아줘 — `scripts/campaigns.json`은 `npm run seed`용으로 남겨둔 옛 파일이라 쓰지 않는다

지켜야 할 것:

- 클래스 이름과 DOM 구조를 React 쪽과 똑같이 유지해줘. CSS를 공유하기 때문이다
- 계산식은 React 쪽과 완전히 같아야 해. 미리보기와 실제 앱의 숫자가 다르면 안 된다
- React 빌드 도구나 CDN 스크립트를 쓰지 마. 파일 하나를 더블클릭해서 열리는 상태를 유지해줘
- 다 만든 뒤에 채널 필터, 기간 슬라이더, 정렬을 조합했을 때 값이 맞는지 계산으로 검산해줘
