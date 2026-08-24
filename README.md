# Campaign Insight — 실행 가이드

React + Firebase로 만든, 여러 광고 플랫폼의 성과를 한 화면에서 비교하는 통합 대시보드입니다.
아래 순서대로 따라 하면 됩니다. Firebase 계정 만드는 것만 직접 하시면 되고, 나머지는 명령어 복사해서 붙여넣으면 됩니다.

## 문서 안내

| 문서 | 용도 |
|---|---|
| `README.md` | 이 문서 — Firebase 설정·실행·배포 절차 |
| `PRD.md` | 무엇을 왜/누구를 위해/어디까지 만들었는지 |
| `사양서.md` | 데이터 구조·계산식·흐름도를 코드 없이 한눈에 |
| `학습노트.md` | 코드를 왜 이렇게 짰는지 — 면접 준비용 깊은 설명 |
| `포트폴리오_설명.md` | 포트폴리오에 붙일 1페이지 서술 |
| `CLAUDE.md` | Claude Code가 매 세션 읽는 프로젝트 규칙 |
| `CLAUDE_CODE_가이드.md` | Claude Code로 이어서 작업하는 법 — 명령어·프롬프트 모음 |
| `preview.html` | 설치 없이 더블클릭으로 여는 미리보기 |

---

## 0. 먼저 화면부터 보기 (설치 없이)

`preview.html` 파일을 더블클릭해서 브라우저로 여세요.
완성된 화면이 그대로 뜹니다. 채널 드롭다운도 작동합니다.

이건 결과물 확인용이고, 아래부터가 진짜 React + Firebase 작업입니다.

---

## Day 2 — Firebase 프로젝트 만들고 데이터 올리기

### 2-1. 프로젝트 생성

1. https://console.firebase.google.com 접속 → 구글 계정 로그인
2. **프로젝트 추가** → 이름은 `campaign-insight` 정도로
3. Google 애널리틱스는 **사용 안 함**으로 (지금은 필요 없음)

### 2-2. Firestore 켜기

1. 왼쪽 메뉴 **빌드 > Firestore Database** → **데이터베이스 만들기**
2. 위치는 `asia-northeast3 (서울)` 선택
3. 시작 모드는 **테스트 모드**로 시작 (30일간 누구나 읽기/쓰기 가능)

> 테스트 모드는 30일 뒤 막힙니다. 배포 후에도 계속 쓰려면 아래 4번 항목의 보안 규칙을 적용하세요.

### 2-3. 웹 앱 등록하고 설정값 복사

1. 프로젝트 개요 옆 **⚙️ > 프로젝트 설정**
2. 아래 **내 앱** 에서 웹 아이콘 `</>` 클릭 → 앱 이름 입력 → 등록
3. 나오는 `firebaseConfig` 값을 복사해둡니다

### 2-4. .env 파일 만들기

프로젝트 폴더에서 `.env.example`을 복사해 `.env` 로 이름을 바꾸고, 위에서 복사한 값을 채웁니다.

```
VITE_FB_API_KEY=AIza...
VITE_FB_AUTH_DOMAIN=campaign-insight.firebaseapp.com
VITE_FB_PROJECT_ID=campaign-insight
VITE_FB_STORAGE_BUCKET=campaign-insight.appspot.com
VITE_FB_SENDER_ID=123456789
VITE_FB_APP_ID=1:123456789:web:abc123
```

### 2-5. 설치

```bash
npm install
```

**데모 데이터를 Firestore에 올릴 필요는 없습니다.** 같은 데이터가 앱 안(`src/sample-data.json`)에 들어 있어서 "샘플 데이터로 둘러보기"를 누르면 바로 뜹니다.

예전에는 `npm run seed`로 1,800개 문서를 올려서 서버에서 읽어왔는데, 그러면 **페이지를 한 번 열 때마다 읽기가 1,800회** 발생합니다(무료 한도 50,000회/일 ÷ 1,800 ≈ 하루 27번이면 소진). 그래서 서버에서 읽지 않도록 바꿨습니다. `npm run seed` 명령은 남겨뒀으니 나중에 마음이 바뀌면 다시 쓸 수 있습니다.

---

## Day 3~6 — 실행해보기

```bash
npm run dev
```

터미널에 나오는 주소(보통 http://localhost:5173)를 브라우저에서 엽니다.

**빈 화면과 업로드 영역이 뜨면 정상입니다.** 이 화면은 campaigns 컬렉션을 더 이상 읽지
않습니다(읽기 비용 때문에 뺐습니다 — "데이터" 절 참고). 대신:

- **"내 데이터로 새 대시보드 만들기"**가 바로 펼쳐져 있으면 → `.env`가 채워져 있고 Firebase 연결도 정상
- 그 자리에 **"지금은 업로드 기능이 꺼져 있습니다"** 라고 나오면 → `.env` 값이 비어 있는 것
- **"샘플 데이터로 둘러보기"**를 눌러 90일치 데모가 뜨면 → 계산·화면 로직은 Firebase 연결과 무관하게 정상 동작 중

### 파일이 어떤 역할인지

| 파일 | 역할 |
|---|---|
| `src/firebase.js` | Firebase 앱·Firestore 초기화만 함 — `campaigns` 컬렉션을 읽는 코드는 없음(비용 문제로 제거) |
| `src/lib/metrics.js` | CTR·전환율·ROAS·ROI 계산, 플랫폼별/제품별 합계 |
| `src/lib/platforms.js` | 플랫폼 리포트의 네이티브 컬럼명 매핑, 업로드 데이터의 플랫폼 목록 자동 인식 |
| `src/lib/parseExcel.js` | 플랫폼 리포트 파일(.xlsx/.csv)을 읽어 표준 행으로 변환 |
| `src/lib/importSavedCsv.js` | "CSV로 내려받기"가 만든 파일을 다시 읽어 화면을 복원 (서버 안 씀) |
| `src/lib/useUploadBatch.js` | 업로드 화면의 상태·로직 전체 — 파일 대기열 → 캠페인-제품 매칭 → 마진율 입력 → 업로드 |
| `src/lib/useDashboardState.js` | **조회 조건(채널·제품·기간·정렬)을 모아 관리하고 주소창과 동기화** |
| `src/lib/sort.js` | 표 정렬 |
| `src/App.jsx` | 전체 화면 조립, 날짜→주차 변환, 조건을 한 번만 적용해 각 화면에 전달 |
| `src/components/Controls.jsx` | 채널·제품 선택 · 기간 슬라이더 · 링크 복사 · 초기화 |
| `src/components/UploadPanel.jsx` | `useUploadBatch.js`와 `components/upload/*` 화면 4개(파일 선택/매칭/마진율/완료)를 조립하는 얇은 조율자 |
| `src/components/SummaryCards.jsx` | 상단 요약 카드 3개 |
| `src/components/CompareBarChart.jsx` | 채널별/제품별 ROAS·ROI 비교 막대 그래프 (범용) |
| `src/components/TrendLineChart.jsx` | 주차별 ROAS·ROI 추이 선 그래프 |
| `src/components/ShareCompareChart.jsx` | 광고비 비중 vs 매출 비중 비교 막대 |
| `src/components/DataTable.jsx` | 원본 데이터 표 (컬럼 클릭으로 정렬) |
| `scripts/seed.js` | 데이터를 Firestore에 올리는 스크립트 |

### 조회 조건이 어떻게 동작하는지

조건은 **네 가지**이고 서로 조합됩니다.

- **채널** — 전체 / 네이버 / 메타 / 구글 / 카카오 (기본 데모 기준. 데이터에 들어있는 플랫폼을 그대로 읽어 만들기 때문에, 업로드 데이터에 다른 플랫폼이 있으면 그것도 함께 나타남)
- **제품** — 데이터에 제품이 2개 이상일 때만 나타남 (기본 데모는 5개라 항상 보임)
- **기간** — 데이터가 가진 주차 구간을 양쪽 손잡이로 조절. "최근 4주" 버튼도 있음
- **정렬** — 표의 컬럼 제목을 누르면 그 지표 기준으로 정렬. 같은 컬럼을 다시 누르면 방향이 뒤집힘

네 조건은 `useDashboardState.js` 한 곳에서만 바뀝니다. 카드·그래프·표는 그 결과를 받아 그리기만 하기 때문에, 조건이 늘어나도 화면끼리 숫자가 어긋나지 않습니다.

조건은 동시에 **주소에도 저장**됩니다.

```
?platform=meta&from=5&to=8&sort=roas&dir=desc
```

"링크 복사"를 누르면 지금 보고 있는 화면 그대로의 주소가 복사됩니다. 상대방이 열면 같은 조건이 걸린 화면이 뜹니다. 브라우저 뒤로 가기도 조건 되돌리기로 동작합니다.

> 기본값은 주소에 넣지 않습니다. `?sort=week&dir=asc` 처럼 굳이 안 써도 되는 값이 붙으면 링크가 길어지고 읽기 어려워지기 때문입니다.

### 날짜 → 주차 변환

원본 데이터는 날짜(`date`) 단위입니다 — 실제 광고 플랫폼 리포트가 일 단위라서요. 화면의 "주차"는 `App.jsx`가 데이터셋에서 가장 이른 날짜를 1주차로 놓고 7일 단위로 계산한 파생값입니다. 여러 플랫폼 파일을 합쳐도 전체 데이터셋 기준으로 주차가 다시 계산되니, 파일마다 날짜 범위가 달라도 문제없습니다.

### 차트에 대해

그래프는 외부 라이브러리 없이 SVG로 직접 그렸습니다. 설치할 게 줄어들고 색·간격을 마음대로 조정할 수 있어서인데, 학원 과제에서 `recharts` 사용이 요구된다면 `CompareBarChart.jsx` 와 `TrendLineChart.jsx` 두 파일만 recharts 버전으로 바꾸면 됩니다. 나머지 코드는 건드릴 필요 없습니다.

---

## Day 7 — 배포하기

이 저장소는 **GitHub Pages**로 배포하도록 이미 설정돼 있다(`.github/workflows/deploy.yml`).
main에 커밋을 올리면 GitHub Actions가 자동으로 빌드해서 올린다 — 로컬에서 배포 버튼을
따로 누를 필요가 없다. 배포 주소는 `https://{GitHub 계정}.github.io/{저장소 이름}/`이다.

### 방법 A: GitHub Pages (이 저장소가 실제로 쓰는 방식)

GitHub Pages 무료 플랜은 **공개(Public) 저장소만** 지원한다(비공개면 Pro 이상 필요).

1. 저장소 **Settings > General > Danger Zone**에서 Public으로 전환(이미 공개라면 생략)
2. **Settings > Secrets and variables > Actions**에서 `.env`의 6개 값을 `New repository secret`으로 각각 등록 (`VITE_FB_API_KEY` 등 — 이름을 `.env`와 똑같이)
3. **Settings > Pages**에서 Source를 **GitHub Actions**로 지정
4. main에 커밋을 push하면 `.github/workflows/deploy.yml`이 자동으로 빌드·배포한다 — **Actions** 탭에서 진행 상황을 볼 수 있다

**GitHub Pages는 루트가 아니라 하위 경로(`/저장소이름/`)에 뜬다.** 그래서 `vite.config.js`가
`GITHUB_PAGES` 환경변수가 있을 때만 그 경로를 base로 잡는다(로컬 개발은 그대로 루트). 저장소
이름을 바꾸면 `vite.config.js`의 `/lumiere_campaign/`도 같이 고쳐야 한다.

### 방법 B: Vercel

1. 코드를 GitHub에 올립니다 (`.env`는 `.gitignore`에 있어서 안 올라갑니다)
2. https://vercel.com 에서 GitHub 계정으로 로그인
3. **Add New > Project** → 방금 올린 저장소 선택
4. **Environment Variables** 에 `.env`의 6개 값을 그대로 입력
5. **Deploy** 클릭 → 1~2분 뒤 주소가 나옵니다

Vercel은 저장소가 비공개여도 되고, 루트 경로에 뜨니 `GITHUB_PAGES` 환경변수는 안 넣어도 된다.

### 방법 C: Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# - 기존 프로젝트 선택
# - public 디렉터리: dist
# - single-page app: Yes
# - 자동 빌드/배포: No

npm run build
firebase deploy
```

---

## 4. 배포 후 보안 규칙 (중요)

테스트 모드는 30일 뒤 막히고, 그전까지는 누구나 데이터를 **수정**할 수 있습니다.
읽기만 허용하도록 바꿔두세요.

Firebase 콘솔 > Firestore Database > **규칙** 탭에서:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 데모 데이터: 누구나 읽을 수 있지만 아무도 못 고친다
    match /campaigns/{doc} {
      allow read: if true;
      allow write: if false;
    }

    // 업로드한 데이터: 링크를 아는 사람은 읽을 수 있고,
    // 로그인한 세션만 새로 만들 수 있으며, 한 번 만들면 못 고치고 못 지운다
    match /uploads/{id} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.rows is list
        && request.resource.data.rows.size() > 0
        && request.resource.data.rows.size() <= 3000
        && request.resource.data.keys().hasOnly(['rows', 'platforms', 'createdAt', 'expiresAt']);
      allow update, delete: if false;
    }
  }
}
```

**이건 배포 전 필수입니다.** Firestore를 "테스트 모드"로 만들면 30일간 누구나 읽고 쓰고 지울 수 있습니다. 그 상태로 배포하면 주소를 아는 사람이 데이터를 지우거나 남의 공유 링크를 없앨 수 있습니다. API 키는 웹앱에 어차피 노출되는 값이라 숨긴다고 막히지 않습니다 — 실제 방어는 이 규칙이 합니다.

`rows.size() <= 3000`은 앱의 `MAX_UPLOAD_ROWS`와 같은 값이어야 합니다. 한쪽만 바꾸면 화면은 통과시키는데 서버가 영문 오류로 거부합니다.

`npm run seed`로 데이터를 다시 올리려면 `campaigns`의 `allow write`를 잠깐 `if true`로 바꾸고 실행한 뒤 되돌리면 됩니다.

---

## 5. 플랫폼 리포트 업로드 기능 켜기 (선택)

"내 데이터로 새 대시보드 만들기" 기능을 쓰려면 Firebase 콘솔에서 두 가지를 더 해야 합니다. 안 해도 기본 대시보드(위 1~4번)는 그대로 동작합니다.

### 5-1. 익명 인증 켜기

1. Firebase 콘솔 > **빌드 > Authentication** > **시작하기**
2. **Sign-in method** 탭 > **익명(Anonymous)** > 사용 설정

로그인 화면은 따로 안 생깁니다. 사용자가 업로드 버튼을 누르는 순간 화면 뒤에서 조용히 익명 세션을 만드는 용도입니다.

### 5-2. 보안 규칙에 `uploads` 컬렉션이 들어있는지 확인

위 **4번**에서 넣은 규칙에 `uploads` 컬렉션 규칙이 이미 포함돼 있습니다(따로 추가할 필요 없음). 규칙 탭에서 아래처럼 `match /uploads/{id}` 블록이 있는지만 확인하세요.

```
match /uploads/{id} {
  allow read: if true;
  allow create: if request.auth != null
    && request.resource.data.rows is list
    && request.resource.data.rows.size() > 0
    && request.resource.data.rows.size() <= 3000
    && request.resource.data.keys().hasOnly(['rows', 'platforms', 'createdAt', 'expiresAt']);
  allow update, delete: if false;
}
```

`campaigns`(읽기 전용)와 별개 컬렉션이라 서로 규칙이 섞이지 않습니다. 업로드는 생성만 가능하고, 한 번 만들어진 공유 링크의 내용은 나중에 수정·삭제할 수 없습니다.

### 5-3. 어떤 파일을 올리면 되는지

**우리가 만든 템플릿에 맞춰 다시 입력할 필요 없습니다.** 네이버·구글·메타·카카오 광고관리자에서 리포트를 그대로 내보내서 올리면 됩니다. 지원하는 컬럼(플랫폼마다 이름은 다르지만 뜻은 같습니다):

| 캐노니컬 | 네이버 | 구글 | 메타 | 카카오 |
|---|---|---|---|---|
| 날짜 | 날짜 | Date | Day | 날짜 |
| 캠페인 | 캠페인 | Campaign name | Campaign name | 캠페인 이름 |
| 광고그룹 | 광고그룹 | Ad group name | Ad set name | 광고그룹 이름 |
| 노출수 | 노출수 | Impr. | Impressions | 노출수 |
| 클릭수 | 클릭수 | Clicks | Link clicks | 클릭수 |
| 광고비 | 광고비 | Cost | Amount spent | 비용 |
| 전환수 | 구매완료 전환수 | Conversions | Purchases | 구매 |
| 매출 | 구매완료 전환매출액 | Conversion value | Purchase conversion value | 구매금액 |

CTR·ROAS처럼 플랫폼이 이미 계산해서 주는 비율 컬럼은 파일에 남아있어도 무시합니다 — 원본 카운트만 가져와서 항상 다시 계산합니다.

파일을 추가할 때 **플랫폼만 고르면 됩니다.** 여러 플랫폼 파일을 한 번에 선택할 수 있고, 파일마다 플랫폼을 지정하면 "파일 처리 시작"으로 한꺼번에 처리합니다. 실제 리포트 하나엔 보통 여러 제품의 캠페인이 섞여 있어서(제품별로 미리 쪼개서 받지 않습니다), 선택한 파일들 전체의 캠페인명을 모아 화면에 보여주고 캠페인마다 어느 제품인지 매칭받습니다 — 이미 확인한 제품명이 캠페인명에 들어있으면 자동으로 추측해 미리 채워두고, 아직 아는 제품이 하나도 없으면 캠페인명에서 플랫폼·캠페인유형 같은 흔한 단어를 걷어낸 나머지를 후보로 채웁니다(틀렸으면 고치면 됩니다). 파일이 몇 개든 이 매칭 화면은 한 번만 뜹니다. 그다음 단계에서 매칭된 **고유 제품별로 마진율을 한 번씩만** 입력받습니다(캠페인마다 따로 받으면 같은 제품인데 마진율이 서로 다르게 들어가는 실수가 생기기 때문입니다). 확정한 배치를 계속 추가해서 하나의 통합 데이터셋으로 만든 뒤 마지막에 한 번만 업로드합니다.

제품을 매칭하면 화면에 "제품" 필터와 표 컬럼이 자동으로 추가되고, 전부 비워두면 예전처럼 채널만 있는 단순한 화면이 됩니다.

`margin`(마진율)을 입력하면 표에 ROI·이익 컬럼이 추가로 뜨고, 두 차트의 손익분기선이 ROAS 100%가 아니라 실제로 이익이 남는 지점으로 옮겨갑니다.

각 플랫폼 파일 형식 예시는 `public/sample-naver-export.csv`(네이버) / `sample-google-export.csv`(구글) / `sample-meta-export.csv`(메타) / `sample-kakao-export.csv`(카카오)에 있고, 업로드 화면에서도 선택한 플랫폼에 맞는 예시 파일 링크가 뜹니다. 이 파일들은 헤더 + 두어 줄짜리라 **어떤 컬럼이 필요한지 확인하는 용도**입니다.

실제로 올려보려면 `scripts/native/` 아래의 리포트 샘플을 쓰세요. **이 파일들은 저장소에 없으니 먼저 만들어야 합니다.**

```bash
npm run samples
```

38개 파일이 만들어집니다. 언제 실행해도 같은 파일이 나옵니다. 파일 하나에 여러 제품의 캠페인이 섞여 있어 캠페인→제품 매칭 단계까지 제대로 확인할 수 있습니다.

| 폴더 | 업종 | 채널 × 제품 | 올려보면 볼 수 있는 것 |
|---|---|---|---|
| `cosmetics/` | 화장품 | 4 × 5 | 제품마다 강세 채널이 다릅니다 |
| `apparel/` | 의류 | 4 × 5 | 기간을 최근 4주로 좁히면 결론이 뒤집힙니다 |
| `fresh-food/` | 신선식품 | 4 × 5 | 마진이 20% 안팎이라 ROAS 300%가 넘어도 손해입니다 |
| `home-appliance/` | 소형가전 | 4 × 4 | 객단가가 높아 전환이 없는 날이 많습니다 |
| `online-course/` | 온라인 강의 | 3 × 5 | 마진이 90%라 ROAS가 낮아 보여도 대부분 남습니다 |
| `pet-supplies/` | 반려동물 | 4 × 5 | 캠페인명에 브랜드가 붙어 있어 제품 매칭을 손봐야 합니다 |
| `b2b-software/` | B2B 협업툴 | 3 × 2 | 계약 단가가 크고 건수가 적은 B2B 형태입니다 |
| `bedding/` | 침구 | 4 × 1 | 제품이 하나뿐이라 제품 필터가 아예 안 뜹니다 |
| `furniture/` | 가구 | 4 × 4 | 채널마다 집행 기간이 달라 그래프 선이 중간에 시작하거나 끝납니다 |
| `travel/` | 여행 | 4 × 5 | 광고를 쉬었다 재개한 구간에서 선이 끊깁니다 |

업종이 달라도 같은 화면이 그대로 동작합니다. 특히 **마진율에 따라 손익분기선이 어디로 움직이는지** 보려면 신선식품(`fresh-food/`)과 온라인 강의(`online-course/`)를 차례로 올려보세요 — 같은 ROAS인데 한쪽은 손해, 한쪽은 이익으로 갈립니다.

### 5-4. (권장) 오래된 업로드 자동 삭제

**Firestore Database > TTL 정책**에서 `uploads` 컬렉션의 `expiresAt` 필드를 TTL로 지정하면, 업로드 30일 뒤 자동으로 삭제됩니다. 안 해두면 업로드가 계속 쌓이니 설정을 권장합니다.

---

## 자주 나는 오류

| 증상 | 원인 / 해결 |
|---|---|
| `npm run seed` 에서 `permission-denied` | Firestore 규칙이 쓰기를 막고 있음. 테스트 모드인지 확인 |
| 업로드 시 "없는 컬럼" 에러 | 선택한 플랫폼과 실제 파일이 다르거나(예: 네이버 선택했는데 구글 파일), 리포트 다운로드 옵션에서 일부 컬럼을 뺐을 수 있음 |
| 업로드 시 "날짜 값을 읽을 수 없습니다" | 날짜 컬럼 형식이 예상과 다름. YYYY-MM-DD 형태를 기준으로 만들었음 |
| 한글이 깨짐 | 브라우저가 폰트를 못 불러온 경우. 인터넷 연결 확인 |
| 배포 후 빈 화면(업로드 기능 꺼짐)으로 뜸 | 저장소 Secrets에 환경변수 6개를 안 넣었거나 이름 오타. 넣은 뒤 다시 push(또는 Actions 탭에서 재실행) 필요 |
| GitHub Pages에서 파비콘·이미지·CSS가 안 뜸 | `vite.config.js`의 base 경로가 저장소 이름과 다름. 저장소 이름을 바꿨다면 base도 같이 고쳐야 함 |

---

## 데이터에 대한 안내

"샘플 데이터로 둘러보기"를 누르면 나오는 90일(약 13주) 데모는 **루미에르(LUMIÈRE)**라는 실존하지 않는 가상 브랜드가 스킨케어 5개 제품을 4개 채널에 광고하는 샘플 시나리오입니다 (도구 자체의 이름은 "Campaign Insight"이고, 루미에르는 그 안의 예시 데이터일 뿐입니다).
모든 수치는 채널별 특성(검색은 전환율이 높고, 소셜은 클릭률이 높다 등)을 반영해 직접 설계한 가상 데이터이며, 실제 광고 계정에서 가져온 데이터가 아닙니다.
