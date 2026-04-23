import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Cloud, Loader2, LogIn } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

/** 메인 등 — Firebase 미연결 시 Google 로그인 유도 */
export default function FirebaseLoginCard() {
  const {
    firebaseReady,
    user,
    loading,
    signInBusy,
    signInError,
    clearSignInError,
    refreshUser,
    signInWithGoogle,
  } = useAuth();

  useEffect(() => {
    if (!firebaseReady) return;
    refreshUser();
  }, [firebaseReady, refreshUser]);

  if (!firebaseReady) return null;

  if (loading) {
    return (
      <section className="card flex items-center gap-2 border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">
        <Loader2 size={14} className="animate-spin" /> 클라우드 로그인 상태 확인 중…
      </section>
    );
  }

  if (user) {
    return (
      <section className="card border-sky-500/25 bg-sky-500/5 px-4 py-3">
        <p className="text-xs text-sky-200/90">
          <Cloud size={14} className="mr-1 inline align-text-bottom" />
          Google 연결됨{" "}
          <span className="font-medium text-sky-100">
            {user.email ?? user.displayName ?? "계정"}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          다른 기기와 맞추려면{" "}
          <Link to="/settings" className="text-brand-400 underline">
            설정 → 지금 동기화
          </Link>
          를 눌러 주세요.
        </p>
      </section>
    );
  }

  return (
    <section className="card border-sky-500/30 bg-sky-500/10 px-4 py-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-sky-100">
        <Cloud size={16} className="text-sky-400" /> 클라우드에 기록 맞추기
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-sky-200/80">
        Google로 로그인하면 여러 기기에서 같은 가족·식단 데이터를 Firestore에 맞출 수 있어요.
      </p>
      <button
        type="button"
        disabled={signInBusy}
        onClick={() => void signInWithGoogle()}
        className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-60"
      >
        {signInBusy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
        {signInBusy ? "Google로 이동 중…" : "Google로 로그인"}
      </button>
      {signInError && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200/95">
          <p className="whitespace-pre-wrap break-words">{signInError}</p>
          <button type="button" onClick={clearSignInError} className="mt-2 text-[11px] text-rose-300 underline">
            닫기
          </button>
        </div>
      )}
    </section>
  );
}
