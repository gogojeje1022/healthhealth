import { useState } from "react";
import { Link } from "react-router-dom";
import FirebaseLoginCard from "../components/FirebaseLoginCard";
import { afterUserDataMutation, db, patchSettings, uid } from "../lib/db";
import { nextColor } from "../lib/utils";

export default function OnboardingPage() {
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState(() => nextColor([]));
  const [apiKey, setApiKey] = useState("");
  const [apiKeyBackup, setApiKeyBackup] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish() {
    const name = displayName.trim();
    if (!name) {
      alert("이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      const id = uid();
      await db.users.bulkPut([
        {
          id,
          name,
          color,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      afterUserDataMutation();
      await patchSettings({
        onboarded: true,
        activeUserId: id,
        geminiApiKey: apiKey.trim() || undefined,
        geminiApiKeyBackup: apiKeyBackup.trim() || undefined,
      });
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
          프로필을 만들고 식단·건강 기록을 사진으로 남기면 AI가 분석합니다.
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
        <h2 className="mb-3 text-sm font-semibold text-slate-300">프로필</h2>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
          <label className="relative cursor-pointer">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl text-base font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {displayName.trim().slice(0, 1) || "?"}
            </span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="표시 이름"
            className="input border-transparent bg-transparent flex-1 px-2"
            maxLength={10}
          />
        </div>
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
