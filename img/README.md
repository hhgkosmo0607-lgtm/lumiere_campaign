# img/ — 로고·아이콘 작업 원본

이 폴더는 **배포되지 않는다.** 실제로 서빙되는 파일은 `public/` 에 있고(`favicon.svg`,
`favicon-16.png`, `favicon-32.png`, `og-image.png`), 빌드하면 그쪽이 그대로 복사된다.

여기 남겨둔 건 그 파일들을 다시 만들 때 필요한 원본이다.

| 파일 | 용도 |
|---|---|
| `campaign-insight-header.html` | 헤더 로고(막대 3개 + 손익분기선) 시안. 브라우저로 열어보고 색·비율을 조정한 뒤 그 도형을 `src/components/Masthead.jsx` 의 svg로 옮긴다 |
| `favicon-transparent-64.png` | 파비콘 64px 원본. 지금 배포에는 16·32만 쓰지만, 더 큰 크기가 필요해지면 여기서 다시 뽑는다 |

`public/` 과 완전히 같은 사본(16·32·svg·og-image)은 중복이라 지웠다 — 아이콘을 바꿀 일이
생기면 위 원본에서 다시 만들어 `public/` 에 넣는다.
