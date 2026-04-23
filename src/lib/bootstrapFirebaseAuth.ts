import { browserLocalPersistence, getRedirectResult, setPersistence } from "firebase/auth";
import { getFirebaseAuth, initFirebase, isFirebaseConfigured } from "./firebaseApp";

/**
 * React 마운트 전에 호출: OAuth 리다이렉트 복귀 URL의 쿼리를 처리해 currentUser 를 확정합니다.
 * (라우터/리렌더 이후에 getRedirectResult 가 늦게 돌면 세션이 비어 보일 수 있음)
 */
export async function bootstrapFirebaseAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  initFirebase();
  const auth = getFirebaseAuth();
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    /* noop */
  }
  try {
    await auth.authStateReady();
    await getRedirectResult(auth);
  } catch (e) {
    console.warn("[auth] bootstrap", e);
  }
}
