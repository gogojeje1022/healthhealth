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
  Plus,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { syncCloudWithLocal } from "../lib/cloudSync";
import { db, getSettings, patchSettings, uid } from "../lib/db";
import { pingGemini } from "../lib/ai";
import { nextColor } from "../lib/utils";
import type { User } from "../types";

export default function SettingsPage() {
  const { firebaseReady, user, loading: authLoading, signInWithGoogle, signOutApp } = useAuth();
  const settings = useLiveQuery(() => getSettings(), []);
  const users = useLiveQuery(() => db.users.orderBy("createdAt").toArray(), []);

  const [apiKey, setApiKey] = useState("");
  const [apiKeyBackup, setApiKeyBackup] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash-lite");
  const [show, setShow] = useState(false);
  const [pingState, setPingState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "ok" }
    | { kind: "fail"; msg: string }
  >({ kind: "idle" });
  const [syncState, setSyncState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "ok" }
    | { kind: "fail"; msg: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (settings?.geminiApiKey) setApiKey(settings.geminiApiKey);
    if (settings?.geminiApiKeyBackup !== undefined) {
      setApiKeyBackup(settings.geminiApiKeyBackup ?? "");
    }
    if (settings?.model) setModel(settings.model);
  }, [settings?.geminiApiKey, settings?.geminiApiKeyBackup, settings?.model]);

  async function saveKey() {
    await patchSettings({
      geminiApiKey: apiKey.trim() || undefined,
      geminiApiKeyBackup: apiKeyBackup.trim() || undefined,
      model: model.trim() || undefined,
    });
    setPingState({ kind: "idle" });
  }
  async function testKey() {
    setPingState({ kind: "busy" });
    try {
      await pingGemini(
        apiKey.trim(),
        model.trim() || undefined,
        apiKeyBackup.trim() || undefined,
      );
      setPingState({ kind: "ok" });
    } catch (e) {
      setPingState({
        kind: "fail",
        msg: e instanceof Error ? e.message : "연결 실패",
      });
    }
  }

  async function addUser() {
    if (!users) return;
    if (users.length >= 4) {
      alert("최대 4명까지 등록할 수 있어요.");
      return;
    }
    const name = prompt("새 가족의 이름은?")?.trim();
    if (!name) return;
    const t = Date.now();
    const u: User = {
      id: uid(),
      name,
      color: nextColor(users.map((x) => x.color)),
      createdAt: t,
      updatedAt: t,
    };
    await db.users.put(u);
    if (!settings?.activeUserId) await patchSettings({ activeUserId: u.id });
  }

  async function renameUser(u: User) {
    const name = prompt("새 이름을 입력하세요", u.name)?.trim();
    if (!name) return;
    await db.users.put({ ...u, name, updatedAt: Date.now() });
  }

  async function removeUser(u: User) {
    if (!confirm(`${u.name}님과 관련된 모든 기록을 삭제할까요?`)) return;
    await db.transaction("rw", db.users, db.meals, db.health, async () => {
      await db.users.delete(u.id);
      await db.meals.where("userId").equals(u.id).delete();
      await db.health.where("userId").equals(u.id).delete();
    });
    if (settings?.activeUserId === u.id) {
      const remain = await db.users.toArray();
      await patchSettings({ activeUserId: remain[0]?.id });
    }
  }

  async function changeColor(u: User, color: string) {
    await db.users.put({ ...u, color, updatedAt: Date.now() });
  }

  async function runCloudSync() {
    setSyncState({ kind: "busy" });
    try {
      await syncCloudWithLocal();
      setSyncState({ kind: "ok" });
    } catch (e) {
      setSyncState({
        kind: "fail",
        msg: e instanceof Error ? e.message : "동기화 실패",
      });
    }
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
          <Cloud size={16} className="text-sky-400" /> 계정 · 클라우드 동기화
        </h2>

        {!firebaseReady ? (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs leading-relaxed text-amber-100/95">
            <p className="font-medium text-amber-50">Firebase가 이 빌드에 포함되어 있지 않습니다</p>
            <p>
              GitHub Pages 등 배포본은 <strong>빌드할 때</strong> 환경 변수가 들어가야 합니다. 로컬{" "}
              <code className="rounded bg-black/20 px-1">.env.local</code>만으로는 사이트에 반영되지 않아요.
            </p>
            <p>
              저장소{" "}
              <strong className="text-amber-50">Settings → Secrets and variables → Actions</strong>에 아래 이름으로
              값을 추가한 뒤, <strong className="text-amber-50">main</strong> 푸시 또는 Actions에서 워크플로를 다시
              실행하세요.
            </p>
            <ul className="list-inside list-disc space-y-0.5 font-mono text-[11px] text-amber-200/90">
              <li>VITE_FIREBASE_API_KEY</li>
              <li>VITE_FIREBASE_AUTH_DOMAIN</li>
              <li>VITE_FIREBASE_PROJECT_ID</li>
              <li>VITE_FIREBASE_MESSAGING_SENDER_ID</li>
              <li>VITE_FIREBASE_APP_ID</li>
              <li className="list-none pl-4 text-amber-200/70">(선택) VITE_FIREBASE_STORAGE_BUCKET</li>
            </ul>
          </div>
        ) : (
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            Google로 로그인하면 가족·식단·건강 기록이 Firestore에 저장됩니다(무료 Spark 플랜·Storage 불필요). 한
            계정으로 여러 기기에서 맞출 수 있어요. 사진은 문서 크기 한도 안에서 압축해 동기화합니다.{" "}
            <strong className="text-slate-300">Gemini API 키는 기기에만 남고 서버로 올라가지 않습니다.</strong>
          </p>
        )}

        {firebaseReady && authLoading && (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> 로그인 상태 확인 중…
          </p>
        )}

        {firebaseReady && !authLoading && !user && (
          <div className="space-y-2">
            <button type="button" onClick={() => signInWithGoogle()} className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm">
              <LogIn size={16} /> Google로 로그인
            </button>
          </div>
        )}

        {firebaseReady && !authLoading && user && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm">
              <span className="truncate text-slate-300">{user.email ?? user.displayName ?? "Google 계정"}</span>
              <button
                type="button"
                onClick={() => signOutApp()}
                className="btn-secondary inline-flex shrink-0 items-center gap-1 py-1.5 pl-2 pr-2.5 text-xs"
              >
                <LogOut size={14} /> 로그아웃
              </button>
            </div>
            <button
              type="button"
              disabled={syncState.kind === "busy"}
              onClick={runCloudSync}
              className="btn-secondary flex w-full items-center justify-center gap-2 py-2.5 text-sm"
            >
              {syncState.kind === "busy" ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
              지금 동기화 (병합 후 업로드)
            </button>
            {settings?.lastCloudSyncAt != null && (
              <p className="text-[11px] text-slate-500">
                마지막 동기화: {new Date(settings.lastCloudSyncAt).toLocaleString("ko-KR")}
              </p>
            )}
            {syncState.kind === "ok" && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 size={14} /> 동기화했어요.
              </p>
            )}
            {syncState.kind === "fail" && (
              <p className="flex items-start gap-1.5 text-xs text-rose-400">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span className="break-all">{syncState.msg}</span>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <KeyRound size={16} className="text-brand-400" /> Gemini API 키
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          AI 식단/건강 분석에 사용됩니다.{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-brand-400 underline"
          >
            무료 발급
          </a>
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

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              대체 API 키 <span className="text-slate-600">(선택)</span>
            </label>
            <input
              type={show ? "text" : "password"}
              value={apiKeyBackup}
              onChange={(e) => setApiKeyBackup(e.target.value)}
              placeholder="주 키가 429 한도일 때만 자동 사용"
              className="input"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              다른 Google Cloud 프로젝트에서 발급한 키를 넣으면, 무료 한도가 다른 풀을 쓸 수 있습니다. Google
              이용약관을 지켜 주세요.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">모델</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input"
            >
              <option value="gemini-2.5-flash-lite">
                gemini-2.5-flash-lite (기본 · AI Studio 무료 한도와 동일 계열)
              </option>
              <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite (구버전, 한도 풀이 다를 수 있음)</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash (더 정교, 한도 빨리 찰 수 있음)</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro (고급)</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              무료 API는 Google 정책·모델별로 한도가 다릅니다. 429가 나오면 잠시 후 재시도하거나 대체 키·다른 모델을
              써 보세요.
            </p>
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
            <p className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={14} /> 연결 성공! 분석을 사용할 수 있어요.
            </p>
          )}
          {pingState.kind === "fail" && (
            <p className="flex items-start gap-1.5 text-xs text-rose-400">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span className="break-all">{pingState.msg}</span>
            </p>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          🔒 키는 이 기기 IndexedDB에만 저장되며, 외부로 전송되지 않습니다 (Google API
          호출 시에만 사용).
        </p>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Users size={16} className="text-brand-400" /> 가족 ({users?.length ?? 0}/4)
          </h2>
          {users && users.length < 4 && (
            <button onClick={addUser} className="btn-secondary py-1.5 text-xs">
              <Plus size={14} /> 추가
            </button>
          )}
        </div>

        <ul className="space-y-2">
          {users?.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-2"
            >
              <label className="relative cursor-pointer">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white"
                  style={{ backgroundColor: u.color }}
                >
                  {u.name.slice(0, 1)}
                </span>
                <input
                  type="color"
                  value={u.color}
                  onChange={(e) => changeColor(u, e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <button
                onClick={() => renameUser(u)}
                className="flex-1 text-left text-sm font-medium text-slate-100 hover:underline"
              >
                {u.name}
              </button>
              {users.length > 1 && (
                <button
                  onClick={() => removeUser(u)}
                  className="rounded-lg p-2 text-slate-500 hover:text-rose-400"
                  aria-label="삭제"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
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

      <section className="px-1 pb-4 text-center text-[11px] text-slate-600">
        헬스헬스 v0.1.0 · 로컬 IndexedDB + 선택 시 Firebase 동기화
      </section>
    </div>
  );
}
