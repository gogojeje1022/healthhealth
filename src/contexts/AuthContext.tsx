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

type AuthState = {
  firebaseReady: boolean;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutApp: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const firebaseReady = isFirebaseConfigured();

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    initFirebase();
    const auth = getFirebaseAuth();
    let unsub: (() => void) | undefined;
    let cancelled = false;

    getRedirectResult(auth)
      .catch((e) => {
        console.warn("[auth] redirect 결과", e);
      })
      .finally(() => {
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setLoading(false);
        });
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [firebaseReady]);

  /** GitHub Pages 등에서는 팝업이 즉시 닫히는 경우가 많아 redirect 사용 */
  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(auth, provider);
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
      signInWithGoogle,
      signOutApp,
    }),
    [firebaseReady, user, loading, signInWithGoogle, signOutApp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
