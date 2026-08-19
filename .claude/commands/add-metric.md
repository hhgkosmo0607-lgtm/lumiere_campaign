---
description: 새 지표를 화면 전체에 일관되게 추가
argument-hint: [지표 이름과 계산식]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(npm run build)
---

새 지표를 추가한다: $ARGUMENTS

먼저 확인할 것: 이 대시보드는 지표 3개(CTR, 전환율, ROAS)로 의도적으로 제한해뒀다. 지표가 늘면 판단이 흐려진다.

**시작하기 전에, 이 지표가 "예산을 어디에 쓸 것인가"라는 질문에 답하는 데 꼭 필요한지 한 문장으로 설명하고 내 확인을 받아줘.** 확인 전에는 파일을 고치지 마.

확인을 받은 뒤 순서:

1. `src/lib/metrics.js` 의 `withMetrics()` 에 계산식 추가. 분모가 0일 때 처리 포함
2. 표시 형식 결정 — 퍼센트인지 금액인지, 소수점 몇 자리인지
3. `DataTable.jsx` 의 `COLUMNS` 에 추가
4. `useDashboardState.js` 의 `SORT_KEYS` 에 추가해서 정렬 가능하게
5. 요약 카드에 넣을지 판단 — 카드는 3개가 적당하다. 넣는다면 뭘 뺄지 먼저 제안해줘
6. `preview.html` 에도 같이 반영
7. `npm run build` 확인

`aggregate()` 로 합산했을 때도 값이 맞는지 확인해줘. 합계를 먼저 내고 나누는 방식이어야 한다.
