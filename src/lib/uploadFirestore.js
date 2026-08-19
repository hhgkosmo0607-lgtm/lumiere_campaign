import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { app, db, isConfigured } from '../firebase';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let signInPromise = null;

// 화면에 로그인 UI 없이 조용히 익명 세션을 만든다. 이미 만들어졌으면 재사용한다.
// 업로드를 실제로 할 때만 쓰이므로, firebase/auth도 그때 가서 불러온다.
function ensureSignedIn() {
  if (!isConfigured) return Promise.reject(new Error('Firebase 설정이 없습니다.'));
  if (!signInPromise) {
    signInPromise = import('firebase/auth').then(({ getAuth, signInAnonymously }) => {
      const auth = getAuth(app);
      return auth.currentUser
        ? auth.currentUser
        : signInAnonymously(auth).then((cred) => cred.user);
    });
  }
  return signInPromise;
}

// rows + platforms를 uploads 컬렉션에 문서 1개로 올리고, 생성된 문서 id를 돌려준다.
export async function createUpload(rows, platforms) {
  await ensureSignedIn();
  const ref = await addDoc(collection(db, 'uploads'), {
    rows,
    platforms,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + THIRTY_DAYS_MS),
  });
  return ref.id;
}

// 공유 링크(?d=id)로 들어왔을 때 그 업로드 데이터를 읽어온다.
export async function fetchUpload(id) {
  if (!isConfigured) throw new Error('Firebase 설정이 없습니다.');
  const snap = await getDoc(doc(db, 'uploads', id));
  if (!snap.exists()) throw new Error('공유된 데이터를 찾을 수 없습니다. 링크가 만료됐거나 잘못됐을 수 있습니다.');
  const data = snap.data();
  return { rows: data.rows, platforms: data.platforms };
}
