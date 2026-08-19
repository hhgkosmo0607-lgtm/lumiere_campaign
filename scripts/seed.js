/**
 * campaigns.json 의 행을 Firestore campaigns 컬렉션에 올린다.
 * 실행:  npm run seed
 *
 * 문서 ID를 "2026-05-01_naver_비타민C세럼" 형태로 직접 지정해서, 여러 번 실행해도
 * 데이터가 중복으로 쌓이지 않고 덮어쓰기만 되도록 했다.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(readFileSync(join(here, 'campaigns.json'), 'utf-8'));

// .env 를 읽기 위한 최소 파서 (별도 패키지 설치 없이)
const env = {};
try {
  readFileSync(join(here, '..', '.env'), 'utf-8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    });
} catch {
  console.error('.env 파일이 없습니다. .env.example 을 복사해서 값을 채우세요.');
  process.exit(1);
}

const app = initializeApp({
  apiKey: env.VITE_FB_API_KEY,
  authDomain: env.VITE_FB_AUTH_DOMAIN,
  projectId: env.VITE_FB_PROJECT_ID,
  storageBucket: env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FB_SENDER_ID,
  appId: env.VITE_FB_APP_ID,
});
const db = getFirestore(app);

const run = async () => {
  // 날짜+채널+제품 조합이 문서마다 유일하다 (같은 날짜·채널이라도 제품이 다르면 다른 문서).
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const id = `${row.date}_${row.platform}_${row.product.replace(/\s+/g, '')}`;
    await setDoc(doc(db, 'campaigns', id), row);
    if ((i + 1) % 100 === 0 || i === rows.length - 1) {
      console.log(`올리는 중: ${i + 1}/${rows.length}`);
    }
  }
  console.log(`\n완료. 총 ${rows.length}개 문서.`);
  process.exit(0);
};

run().catch((e) => {
  console.error('업로드 실패:', e.message);
  process.exit(1);
});
