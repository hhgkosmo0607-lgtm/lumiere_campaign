import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// .env 파일의 값을 읽어온다. (Vite는 VITE_ 로 시작하는 변수만 노출한다)
const config = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const isConfigured = Boolean(config.apiKey && config.projectId);

export let db = null;
export let app = null;
if (isConfigured) {
  app = initializeApp(config);
  db = getFirestore(app);
}

export async function fetchCampaigns() {
  if (!db) throw new Error('Firebase 설정이 없습니다. .env 파일을 확인하세요.');
  const snap = await getDocs(collection(db, 'campaigns'));
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform));
}
