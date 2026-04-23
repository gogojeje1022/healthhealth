import { browserLocalPersistence, getRedirectResult, setPersistence } from "firebase/auth";
import { getFirebaseAuth, initFirebase, isFirebaseConfigured } from "./firebaseApp";

/**
 * React 마운트 전: OAuth 리다이렉트 복귀 URL 처리 + 토큰 확정.
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
    const result = await getRedirectResult(auth);
    if (result?.user) {
      try {
        await result.user.getIdToken();
      } catch {
        /* noop */
      }
    }
  } catch (e) {
    console.warn("[auth] bootstrap", e);
  }
}
