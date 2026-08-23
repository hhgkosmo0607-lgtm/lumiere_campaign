/**
 * Firebase(구글의 클라우드 데이터베이스 서비스) 연결을 준비하는 파일. 이 앱 전체에서
 * 서버와 통신하는 다른 모든 파일(uploadFirestore.js 등)이 여기서 만든 db·app을 가져다 쓴다.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// .env 파일의 값을 읽어온다. (Vite는 VITE_ 로 시작하는 변수만 노출한다)
const config = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

// .env 파일이 아예 없거나 값을 안 채워도 앱이 죽으면 안 된다 — 이 값이 false면
// App.jsx가 "업로드 기능 꺼짐" 안내만 보여주고 나머지(샘플 데이터 보기 등)는 정상 동작한다.
export const isConfigured = Boolean(config.apiKey && config.projectId);

export let db = null;
export let app = null;
if (isConfigured) {
  app = initializeApp(config);
  db = getFirestore(app);
}
