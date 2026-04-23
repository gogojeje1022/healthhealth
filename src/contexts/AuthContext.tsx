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
  browserLocalPersistence,
  onAuthStateChanged,
  onIdTokenChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initFirebase, isFirebaseConfigured } from "../lib/firebaseApp";

function formatSignInError(e: unknown): string {
  const o = e as { code?: string; message?: string };
  const code = o?.code ?? "";
  if (code === "auth/popup-blocked") {
    return "팝업이 차단되었습니다. 주소창에서 이 사이트의 팝업을 허용한 뒤 다시 시도하세요.";
  }
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
  refreshUser: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutApp: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const firebaseReady = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const clearSignInError = useCallback(() => setSignInError(null), []);

  const refreshUser = useCallback(() => {
    if (!firebaseReady) {
      setUser(null);
      return;
    }
    try {
      setUser(getFirebaseAuth().currentUser);
    } catch {
      setUser(null);
    }
  }, [firebaseReady]);

  useEffect(() => {
    if (user) setSignInBusy(false);
  }, [user]);

  useEffect(() => {
    if (!firebaseReady) {
      setUser(null);
      setAuthReady(true);
      return;
    }
    initFirebase();
    const auth = getFirebaseAuth();
    void setPersistence(auth, browserLocalPersistence).catch(() => {});

    const sync = () => {
      setUser(auth.currentUser);
    };

    const unsubAuth = onAuthStateChanged(auth, sync);
    const unsubToken = onIdTokenChanged(auth, sync);

    void auth.authStateReady().then(() => {
      sync();
      setAuthReady(true);
    });

    const timeouts = [50, 200, 600, 1500].map((ms) => window.setTimeout(sync, ms));

    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    const onShow = () => sync();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);

    return () => {
      unsubAuth();
      unsubToken();
      timeouts.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, [firebaseReady]);

  const loading = firebaseReady && !authReady;

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
      await signInWithPopup(auth, provider);
      refreshUser();
    } catch (e) {
      console.error("[auth] Google 로그인", e);
      setSignInError(formatSignInError(e));
    } finally {
      window.clearTimeout(resetBusyLater);
      setSignInBusy(false);
    }
  }, [refreshUser]);

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
      refreshUser,
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
      refreshUser,
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
