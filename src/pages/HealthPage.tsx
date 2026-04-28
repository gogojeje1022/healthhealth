import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { HeartPulse } from "lucide-react";
import { afterUserDataMutation, db, getSettings, registerCloudDelete, uid } from "../lib/db";
import { analyzeHealthImage } from "../lib/ai";
import {
  HEALTH_TYPE_LABELS,
  type HealthRecord,
  type HealthRecordType,
} from "../types";
import HealthScoreRing from "../components/HealthScoreRing";
import HealthRecordCard from "../components/HealthRecordCard";
import PhotoUpload from "../components/PhotoUpload";
import { usePrimaryUserId } from "../hooks/usePrimaryUserId";
import { dateKey, formatKoDate } from "../lib/utils";

export default function HealthPage() {
  const settings = useLiveQuery(() => getSettings(), []);
  const userId = usePrimaryUserId();
  const [pickedType, setPickedType] = useState<HealthRecordType>("checkup");

  const records = useLiveQuery(
    async () =>
      userId
        ? (await db.health.where("userId").equals(userId).toArray()).sort(
            (a, b) => {
              const d = b.recordDate.localeCompare(a.recordDate);
              if (d !== 0) return d;
              return (b.createdAt ?? 0) - (a.createdAt ?? 0);
            },
          )
        : [],
    [userId],
  );

  const latest = records?.[0];

  async function addRecord(photo: Blob, thumbnail: Blob) {
    if (!userId) return;
    const now = Date.now();
    const id = uid();
    const rec: HealthRecord = {
      id,
      userId,
      type: pickedType,
      recordDate: dateKey(),
      photo,
      thumbnail,
      analysisStatus: settings?.geminiApiKey ? "analyzing" : "skipped",
      createdAt: now,
      updatedAt: now,
    };
    await db.health.put(rec);
    afterUserDataMutation();
    if (settings?.geminiApiKey) {
      runAnalysis(id, photo, pickedType, settings.geminiApiKey);
    }
  }

  async function runAnalysis(
    id: string,
    photo: Blob,
    type: HealthRecordType,
    key: string,
  ) {
    try {
      const result = await analyzeHealthImage(
        key,
        photo,
        HEALTH_TYPE_LABELS[type],
      );
      const cur = await db.health.get(id);
      if (!cur) return;
      await db.health.put({
        ...cur,
        extractedText: result.extractedText,
        metrics: result.metrics,
        healthScore: result.healthScore,
        summary: result.summary,
        strengths: result.strengths,
        concerns: result.concerns,
        recommendations: result.recommendations,
        analysisStatus: "done",
        analysisError: undefined,
        updatedAt: Date.now(),
      });
      afterUserDataMutation();
    } catch (e) {
      const cur = await db.health.get(id);
      if (!cur) return;
      await db.health.put({
        ...cur,
        analysisStatus: "error",
        analysisError: e instanceof Error ? e.message : String(e),
        updatedAt: Date.now(),
      });
      afterUserDataMutation();
    }
  }

  async function reAnalyze(rec: HealthRecord) {
    if (!rec.photo || !settings?.geminiApiKey) return;
    await db.health.put({
      ...rec,
      analysisStatus: "analyzing",
      analysisError: undefined,
      updatedAt: Date.now(),
    });
    afterUserDataMutation();
    runAnalysis(rec.id, rec.photo, rec.type, settings.geminiApiKey);
  }

  async function removeRecord(rec: HealthRecord) {
    if (!confirm("이 건강 기록을 삭제할까요?")) return;
    await db.health.delete(rec.id);
    await registerCloudDelete("health", rec.id);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-5">
      <header>
        <p className="text-xs text-slate-400">건강 프로필</p>
        <h1 className="text-xl font-bold">
          <HeartPulse size={18} className="mb-0.5 mr-1 inline text-rose-400" />
          내 건강 점수
        </h1>
      </header>

      <section className="card flex items-center gap-4 p-5">
        <HealthScoreRing score={latest?.healthScore} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">최근 건강 평가</p>
          <h2 className="mt-0.5 break-words text-base font-semibold leading-snug text-slate-100">
            {latest?.summary ?? "검진·인바디 사진을 올려 보세요."}
          </h2>
          {latest && (
            <p className="mt-1 text-xs text-slate-500">
              {HEALTH_TYPE_LABELS[latest.type]} · {formatKoDate(latest.recordDate)}
            </p>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">새 건강기록 추가</h3>

        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(HEALTH_TYPE_LABELS) as HealthRecordType[]).map((t) => (
            <button
              key={t}
              onClick={() => setPickedType(t)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (pickedType === t
                  ? "border-brand-500 bg-brand-500/15 text-brand-200"
                  : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200")
              }
            >
              {HEALTH_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <PhotoUpload
          label={`${HEALTH_TYPE_LABELS[pickedType]} 사진 찍기`}
          onPicked={addRecord}
          disabled={!userId}
          compressOptions={{ maxDimension: 2400, quality: 0.92 }}
        />
        {!settings?.geminiApiKey && (
          <Link
            to="/settings"
            className="mt-3 block rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400"
          >
            AI 분석은 설정에 Gemini 키가 필요합니다.
          </Link>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="px-1 text-sm font-semibold text-slate-300">
          기록 ({records?.length ?? 0})
        </h3>
        {records && records.length === 0 && (
          <p className="card p-4 text-center text-sm text-slate-500">
            아직 등록된 건강기록이 없어요.
          </p>
        )}
        {records?.map((r) => (
          <HealthRecordCard
            key={r.id}
            record={r}
            onReanalyze={() => reAnalyze(r)}
            onRemove={() => removeRecord(r)}
            canAnalyze={!!settings?.geminiApiKey}
          />
        ))}
      </section>
    </div>
  );
}
