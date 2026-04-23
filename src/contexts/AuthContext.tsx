import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initFirebase, isFirebaseConfigured } from "../lib/firebaseApp";

function usePopupFirstForGoogle(): boolean {
  if (typeof window === "undefined") return false;
  const coarse =
    window.matchMedia?.("(pointer: fine)").matches ||
    !window.matchMedia?.("(pointer: coarse)").matches;
  return coarse;
}

function shouldFallbackToRedirect(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? "";
  return (
    code === "auth/popup-blocked" ||
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
}

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

function readAuthUser(firebaseReady: boolean): User | null {
  if (!firebaseReady) return null;
  try {
    return getFirebaseAuth().currentUser;
  } catch {
    return null;
  }
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
  const firebaseReady = isFirebaseConfigured();
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  /** Firebase 미설정이면 true, 설정이면 authStateReady 될 때까지 false → true */
  const [authReady, setAuthReady] = useState(!firebaseReady);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!firebaseReady) return () => {};
      initFirebase();
      const auth = getFirebaseAuth();
      void setPersistence(auth, browserLocalPersistence).catch(() => {
        /* 일부 환경에서 실패해도 기본 영속성으로 진행 */
      });
      return onAuthStateChanged(auth, onStoreChange);
    },
    [firebaseReady],
  );

  const getSnapshot = useCallback(() => readAuthUser(firebaseReady), [firebaseReady]);

  const user = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (!firebaseReady) {
      setAuthReady(true);
      return;
    }
    initFirebase();
    void getFirebaseAuth()
      .authStateReady()
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, [firebaseReady]);

  const loading = firebaseReady && !authReady;

  const clearSignInError = useCallback(() => setSignInError(null), []);

  useEffect(() => {
    if (user) setSignInBusy(false);
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    setSignInError(null);
    setSignInBusy(true);
    const resetBusyLater = window.setTimeout(() => setSignInBusy(false), 15_000);
    try {
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      void setPersistence(auth, browserLocalPersistence).catch(() => {});
      const provider = new GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      provider.setCustomParameters({ prompt: "select_account" });
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      if (usePopupFirstForGoogle()) {
        try {
          await signInWithPopup(auth, provider);
          setSignInBusy(false);
          window.clearTimeout(resetBusyLater);
          return;
        } catch (e) {
          if (!shouldFallbackToRedirect(e)) throw e;
        }
      }
      await signInWithRedirect(auth, provider);
    } catch (e) {
      console.error("[auth] Google 로그인", e);
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
