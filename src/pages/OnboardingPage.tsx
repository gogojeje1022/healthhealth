import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, X } from "lucide-react";
import { db, patchSettings, uid } from "../lib/db";
import { nextColor } from "../lib/utils";

interface DraftUser {
  id: string;
  name: string;
  color: string;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<DraftUser[]>([
    { id: uid(), name: "", color: nextColor([]) },
  ]);
  const [apiKey, setApiKey] = useState("");
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
        })),
      );
      await patchSettings({
        onboarded: true,
        activeUserId: valid[0].id,
        geminiApiKey: apiKey.trim() || undefined,
      });
      navigate("/", { replace: true });
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
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          가족 2~4명을 등록하고, 매일의 식단을 사진으로 기록하세요.
          <br />
          AI가 메뉴를 분석하고 건강 점수를 알려드려요.
        </p>
      </header>

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
          Gemini API 키 <span className="text-slate-500">(선택, 나중에 설정 가능)</span>
        </h2>
        <p className="mb-2 text-xs leading-relaxed text-slate-500">
          AI 분석 기능을 쓰려면 무료 Gemini API 키가 필요해요.
          <br />
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-brand-400 underline"
          >
            aistudio.google.com/apikey
          </a>
          에서 1분이면 발급받을 수 있어요.
        </p>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIzaSy..."
          className="input"
          autoComplete="off"
        />
      </section>

      <button
        onClick={finish}
        disabled={busy}
        className="btn-primary mt-auto w-full py-4 text-base"
      >
        {busy ? "준비 중…" : "시작하기"}
        <X className="hidden" />
      </button>
    </div>
  );
}
