import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  afterUserDataMutation,
  db,
  getSettings,
  patchSettings,
} from "../lib/db";
import { pingGemini } from "../lib/ai";
import { usePrimaryUserId } from "../hooks/usePrimaryUserId";
import type { User } from "../types";

export default function SettingsPage() {
  const {
    firebaseReady,
    user,
    loading: authLoading,
    signInBusy,
    signInError,
    clearSignInError,
    refreshUser,
    signInWithGoogle,
    signOutApp,
  } = useAuth();
  const settings = useLiveQuery(() => getSettings(), []);
  const primaryId = usePrimaryUserId();
  const profileUser = useLiveQuery(
    async () => (primaryId ? await db.users.get(primaryId) : undefined),
    [primaryId],
  );
  const userCount = useLiveQuery(() => db.users.count(), []);

  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [pingState, setPingState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "ok"; model: string }
    | { kind: "fail"; msg: string }
  >({ kind: "idle" });
  const [keySavedFlash, setKeySavedFlash] = useState(false);

  useEffect(() => {
    if (!firebaseReady) return;
    refreshUser();
  }, [firebaseReady, refreshUser]);

  useEffect(() => {
    if (settings?.geminiApiKey) setApiKey(settings.geminiApiKey);
  }, [settings?.geminiApiKey]);

  async function saveKey() {
    await patchSettings({
      geminiApiKey: apiKey.trim() || undefined,
    });
    setPingState({ kind: "idle" });
    setKeySavedFlash(true);
    window.setTimeout(() => setKeySavedFlash(false), 2500);
  }
  async function testKey() {
    setPingState({ kind: "busy" });
    try {
      const result = await pingGemini(apiKey.trim());
      setPingState({ kind: "ok", model: result.model });
    } catch (e) {
      setPingState({
        kind: "fail",
        msg: e instanceof Error ? e.message : "연결 실패",
      });
    }
  }

  async function renameUser(u: User) {
    const name = prompt("새 이름을 입력하세요", u.name)?.trim();
    if (!name) return;
    await db.users.put({ ...u, name, updatedAt: Date.now() });
    afterUserDataMutation();
  }

  async function changeColor(u: User, color: string) {
    await db.users.put({ ...u, color, updatedAt: Date.now() });
    afterUserDataMutation();
  }

  async function wipeAll() {
    if (!confirm("⚠ 정말 모든 데이터를 삭제할까요? 되돌릴 수 없어요.")) return;
    if (!confirm("정말로 확실한가요?")) return;
    await db.transaction(
      "rw",
      db.users,
      db.meals,
      db.health,
      db.settings,
      async () => {
        await db.meals.clear();
        await db.health.clear();
        await db.users.clear();
        await db.settings.clear();
      },
    );
    location.hash = "/";
    location.reload();
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-5">
      <header>
        <p className="text-xs text-slate-400">설정</p>
        <h1 className="text-xl font-bold">앱 설정</h1>
      </header>

      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <Cloud size={16} className="text-sky-400" /> Google 계정
        </h2>

        {!firebaseReady ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
            Firebase가 빌드에 없습니다. 배포 시 GitHub Actions Secrets에{" "}
            <code className="rounded bg-black/20 px-1">VITE_FIREBASE_*</code>를 넣고 다시 빌드하세요.
          </p>
        ) : null}

        {firebaseReady && authLoading && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> 확인 중…
          </p>
        )}

        {firebaseReady && !authLoading && !user && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={signInBusy}
              onClick={() => void signInWithGoogle()}
              className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-60"
            >
              {signInBusy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {signInBusy ? "로그인 중…" : "Google로 로그인"}
            </button>
            {signInError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200/95">
                <p className="whitespace-pre-wrap break-words">{signInError}</p>
                <button type="button" onClick={clearSignInError} className="mt-2 text-[11px] text-rose-300 underline">
                  닫기
                </button>
              </div>
            )}
          </div>
        )}

        {firebaseReady && !authLoading && user && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm">
              <span className="truncate text-slate-300">{user.email ?? user.displayName ?? "Google 계정"}</span>
              <button
                type="button"
                onClick={() => void signOutApp()}
                className="btn-secondary inline-flex shrink-0 items-center gap-1 py-1.5 pl-2 pr-2.5 text-xs"
              >
                <LogOut size={14} /> 로그아웃
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <KeyRound size={16} className="text-brand-400" /> Google Gemini 키
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-brand-400 underline"
          >
            AI Studio
          </a>
          에서 발급 · 로그인한 Google 계정에 맞춰 동기화됩니다. 모델은 자동으로 최적의 Gemini 모델을 사용해요.
        </p>

        <div className="space-y-2">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="input pr-12"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={saveKey} className="btn-primary flex-1 py-2 text-sm">
              저장
            </button>
            <button
              onClick={testKey}
              disabled={!apiKey || pingState.kind === "busy"}
              className="btn-secondary flex-1 py-2 text-sm"
            >
              {pingState.kind === "busy" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "연결 테스트"
              )}
            </button>
          </div>

          {pingState.kind === "ok" && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-400">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} /> 연결됨
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-200">
                {pingState.model}
              </span>
            </p>
          )}
          {pingState.kind === "fail" && (
            <p className="flex items-start gap-1.5 text-xs text-rose-400">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span className="break-all">{pingState.msg}</span>
            </p>
          )}
          {keySavedFlash && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={14} /> 저장됨
            </p>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <UserRound size={16} className="text-brand-400" /> 프로필
        </h2>
        {userCount !== undefined && userCount > 1 && (
          <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
            예전 데이터에 프로필이 여러 개 남아 있을 수 있어요. 앱은 하나의 프로필만 사용합니다. 정리하려면 아래{" "}
            <strong className="text-amber-50">모든 데이터 삭제</strong> 후 다시 시작해 주세요.
          </p>
        )}
        {profileUser ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-2">
            <label className="relative cursor-pointer">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white"
                style={{ backgroundColor: profileUser.color }}
              >
                {profileUser.name.slice(0, 1)}
              </span>
              <input
                type="color"
                value={profileUser.color}
                onChange={(e) => changeColor(profileUser, e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button
              type="button"
              onClick={() => renameUser(profileUser)}
              className="flex-1 text-left text-sm font-medium text-slate-100 hover:underline"
            >
              {profileUser.name}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">프로필을 불러오는 중이에요.</p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-base font-semibold text-rose-300">위험 영역</h2>
        <p className="mb-3 text-xs text-slate-400">
          모든 식단/건강 기록과 사용자 정보를 삭제합니다.
        </p>
        <button
          onClick={wipeAll}
          className="btn-secondary w-full border-rose-500/30 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 size={14} /> 모든 데이터 삭제
        </button>
      </section>

      <section className="px-1 pb-4 text-center text-[11px] text-slate-600">헬스헬스 v0.1.0</section>
    </div>
  );
}
