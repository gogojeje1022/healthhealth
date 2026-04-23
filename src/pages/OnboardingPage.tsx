import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import FirebaseLoginCard from "../components/FirebaseLoginCard";
import { afterUserDataMutation, db, patchSettings, uid } from "../lib/db";
import { nextColor } from "../lib/utils";

interface DraftUser {
  id: string;
  name: string;
  color: string;
}

export default function OnboardingPage() {
  const [members, setMembers] = useState<DraftUser[]>([
    { id: uid(), name: "", color: nextColor([]) },
  ]);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyBackup, setApiKeyBackup] = useState("");
  const [busy, setBusy] = useState(false);

  function addMember() {
    if (members.length >= 4) return;
    setMembers((m) => [
      ...m,
      { id: uid(), name: "", color: nextColor(m.map((x) => x.color)) },
    ]);
  }
  function removeMember(id: string) {
    setMembers((m) => (m.length > 1 ? m.filter((x) => x.id !== id) : m));
  }
  function updateMember(id: string, patch: Partial<DraftUser>) {
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function finish() {
    const valid = members.filter((m) => m.name.trim().length > 0);
    if (valid.length < 1) {
      alert("최소 1명 이상의 가족을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      await db.users.bulkPut(
        valid.map((m) => ({
          id: m.id,
          name: m.name.trim(),
          color: m.color,
          createdAt: now,
          updatedAt: now,
        })),
      );
      afterUserDataMutation();
      await patchSettings({
        onboarded: true,
        activeUserId: valid[0].id,
        geminiApiKey: apiKey.trim() || undefined,
        geminiApiKeyBackup: apiKeyBackup.trim() || undefined,
      });
      // SPA navigate 만으로는 라이브 쿼리/해시 라우터 타이밍이 어긋날 수 있어,
      // 온보딩 직후에는 앱 루트로 한 번 이동해 상태를 확실히 맞춘다.
      window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}#/`);
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error
          ? `저장에 실패했습니다: ${e.message}`
          : "저장에 실패했습니다. 사이트 데이터(IndexedDB) 저장이 막혀 있지 않은지 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col px-5 pb-10 pt-8">
      <header className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
          ✨ 시작하기
        </div>
        <h1 className="text-3xl font-bold leading-tight">
          헬스헬스에
          <br />
          오신 것을 환영해요
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          가족을 등록하고 식단·건강 기록을 사진으로 남기면 AI가 분석합니다.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          기존 클라우드 데이터는 아래 <strong className="text-slate-400">Google 로그인</strong> 후 이어집니다. 계정 바꾸기는{" "}
          <Link to="/settings" className="text-brand-400 underline">
            설정
          </Link>
          .
        </p>
      </header>

      <div className="mb-6">
        <FirebaseLoginCard />
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">가족 구성원</h2>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2"
            >
              <label className="relative cursor-pointer">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-base font-bold text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {m.name.trim().slice(0, 1) || i + 1}
                </span>
                <input
                  type="color"
                  value={m.color}
                  onChange={(e) => updateMember(m.id, { color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <input
                value={m.name}
                onChange={(e) => updateMember(m.id, { name: e.target.value })}
                placeholder={`구성원 ${i + 1} 이름`}
                className="input border-transparent bg-transparent flex-1 px-2"
                maxLength={10}
              />
              {members.length > 1 && (
                <button
                  onClick={() => removeMember(m.id)}
                  className="rounded-lg p-2 text-slate-500 hover:text-rose-400"
                  aria-label="삭제"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        {members.length < 4 && (
          <button
            onClick={addMember}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 py-3 text-sm text-slate-400 hover:border-brand-500 hover:text-brand-300"
          >
            <Plus size={16} /> 가족 추가 ({members.length}/4)
          </button>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-300">
          Gemini API 키 <span className="text-slate-500">(선택)</span>
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-brand-400 underline">
            AI Studio
          </a>
          에서 발급 · 나중에 설정에서도 가능
        </p>
        <label className="mb-1 block text-[11px] text-slate-500">주 API 키</label>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIzaSy..."
          className="input mb-3"
          autoComplete="off"
        />
        <label className="mb-1 block text-[11px] text-slate-500">보조 API 키 (선택)</label>
        <input
          value={apiKeyBackup}
          onChange={(e) => setApiKeyBackup(e.target.value)}
          placeholder="주 키를 못 쓸 때만 자동 시도"
          className="input"
          autoComplete="off"
        />
      </section>

      <button
        type="button"
        onClick={() => void finish()}
        disabled={busy}
        className="btn-primary mt-auto w-full py-4 text-base"
      >
        {busy ? "준비 중…" : "시작하기"}
      </button>
    </div>
  );
}
