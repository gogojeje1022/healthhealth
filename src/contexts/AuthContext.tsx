import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initFirebase, isFirebaseConfigured } from "../lib/firebaseApp";

function formatSignInError(e: unknown): string {
  const o = e as { code?: string; message?: string };
  const code = o?.code ?? "";
  if (code === "auth/unauthorized-domain") {
    return "이 사이트 도메인이 Firebase에 등록되어 있지 않습니다. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 현재 주소(예: xxx.github.io)를 추가하세요.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Google 로그인이 Firebase에서 켜져 있지 않습니다. Authentication → Sign-in method에서 Google을 사용 설정하세요.";
  }
  if (code === "auth/web-storage-unsupported" || /storage/i.test(String(o?.message))) {
    return "브라우저가 저장소(세션)를 막고 있을 수 있습니다. 사생활 보호 모드를 끄거나 다른 브라우저로 시도해 보세요.";
  }
  return o?.message ? `${code ? `${code}: ` : ""}${o.message}` : String(e);
}

type AuthState = {
  firebaseReady: boolean;
  user: User | null;
  loading: boolean;
  signInBusy: boolean;
  signInError: string | null;
  clearSignInError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutApp: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const firebaseReady = isFirebaseConfigured();

  const clearSignInError = useCallback(() => setSignInError(null), []);

  useEffect(() => {
    if (user) setSignInBusy(false);
  }, [user]);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    initFirebase();
    const auth = getFirebaseAuth();
    let cancelled = false;

    // 반드시 먼저 구독: 리다이렉트 직후·StrictMode 재마운트에서도 currentUser 이벤트를 놓치지 않음
    const unsub = onAuthStateChanged(auth, (u) => {
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    });

    void (async () => {
      try {
        await auth.authStateReady();
      } catch {
        /* noop */
      }
      if (cancelled) return;
      try {
        const result = await getRedirectResult(auth);
        if (cancelled) return;
        if (result?.user) {
          setUser(result.user);
          setLoading(false);
        } else if (auth.currentUser) {
          setUser(auth.currentUser);
          setLoading(false);
        }
      } catch (e) {
        console.warn("[auth] getRedirectResult", e);
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseReady]);

  /** GitHub Pages 등에서는 팝업이 즉시 닫히는 경우가 많아 redirect 사용 */
  const signInWithGoogle = useCallback(async () => {
    setSignInError(null);
    setSignInBusy(true);
    const resetBusyLater = window.setTimeout(() => setSignInBusy(false), 15_000);
    try {
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      const provider = new GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      provider.setCustomParameters({ prompt: "select_account" });
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await signInWithRedirect(auth, provider);
    } catch (e) {
      console.error("[auth] signInWithRedirect", e);
      setSignInError(formatSignInError(e));
      setSignInBusy(false);
      window.clearTimeout(resetBusyLater);
    }
  }, []);

  const signOutApp = useCallback(async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      firebaseReady,
      user,
      loading,
      signInBusy,
      signInError,
      clearSignInError,
      signInWithGoogle,
      signOutApp,
    }),
    [
      firebaseReady,
      user,
      loading,
      signInBusy,
      signInError,
      clearSignInError,
      signInWithGoogle,
      signOutApp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
