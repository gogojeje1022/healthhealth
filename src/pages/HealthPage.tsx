import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { db, getSettings, uid } from "../lib/db";
import { analyzeHealthImage } from "../lib/ai";
import {
  HEALTH_TYPE_LABELS,
  type HealthRecord,
  type HealthRecordType,
} from "../types";
import HealthScoreRing from "../components/HealthScoreRing";
import PhotoUpload from "../components/PhotoUpload";
import UserSelector from "../components/UserSelector";
import { blobUrl, dateKey, formatKoDate } from "../lib/utils";

export default function HealthPage() {
  const settings = useLiveQuery(() => getSettings(), []);
  const userId = settings?.activeUserId;
  const [pickedType, setPickedType] = useState<HealthRecordType>("checkup");

  const records = useLiveQuery(
    async () =>
      userId
        ? (await db.health.where("userId").equals(userId).toArray()).sort(
            (a, b) => b.recordDate.localeCompare(a.recordDate),
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
    if (settings?.geminiApiKey) {
      runAnalysis(id, photo, pickedType, settings.geminiApiKey, settings.model);
    }
  }

  async function runAnalysis(
    id: string,
    photo: Blob,
    type: HealthRecordType,
    key: string,
    model?: string,
  ) {
    try {
      const result = await analyzeHealthImage(
        key,
        photo,
        HEALTH_TYPE_LABELS[type],
        model,
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
    } catch (e) {
      const cur = await db.health.get(id);
      if (!cur) return;
      await db.health.put({
        ...cur,
        analysisStatus: "error",
        analysisError: e instanceof Error ? e.message : String(e),
        updatedAt: Date.now(),
      });
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
    runAnalysis(rec.id, rec.photo, rec.type, settings.geminiApiKey, settings.model);
  }

  async function removeRecord(rec: HealthRecord) {
    if (!confirm("이 건강 기록을 삭제할까요?")) return;
    await db.health.delete(rec.id);
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

      <UserSelector />

      <section className="card flex items-center gap-4 p-5">
        <HealthScoreRing score={latest?.healthScore} />
        <div className="flex-1">
          <p className="text-xs text-slate-400">최근 건강 평가</p>
          <h2 className="mt-0.5 text-base font-semibold leading-tight text-slate-100">
            {latest?.summary ?? "아직 평가 결과가 없어요. 검진표나 인바디 사진을 올려보세요."}
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
          label={`${HEALTH_TYPE_LABELS[pickedType]} 사진 올리기`}
          onPicked={addRecord}
          disabled={!userId}
        />
        {!settings?.geminiApiKey && (
          <Link
            to="/settings"
            className="mt-3 block rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200"
          >
            ⚠ AI 점수 산출을 위해 설정에서 Gemini API 키를 등록하세요.
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
          <RecordCard
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

function RecordCard({
  record,
  onReanalyze,
  onRemove,
  canAnalyze,
}: {
  record: HealthRecord;
  onReanalyze: () => void;
  onRemove: () => void;
  canAnalyze: boolean;
}) {
  const [open, setOpen] = useState(false);
  const url = blobUrl(record.thumbnail || record.photo);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {url ? (
          <img
            src={url}
            alt="기록"
            className="h-14 w-14 shrink-0 rounded-xl border border-slate-800 object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-xl bg-slate-800" />
        )}
        <div className="flex-1">
          <p className="text-xs text-slate-400">
            {HEALTH_TYPE_LABELS[record.type]} · {formatKoDate(record.recordDate)}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-100">
            {record.summary ?? statusLabel(record)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {record.healthScore !== undefined && (
            <span className="rounded-full bg-brand-500/15 px-2 py-1 text-sm font-bold text-brand-300">
              {record.healthScore}
            </span>
          )}
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-800 p-4">
          {record.analysisStatus === "analyzing" && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-800/50 px-3 py-2 text-sm text-slate-300">
              <Loader2 size={16} className="animate-spin text-brand-400" />
              AI 분석 중…
            </div>
          )}
          {record.analysisStatus === "error" && (
            <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">
              <div className="flex items-start gap-2">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                <span className="break-all">{record.analysisError}</span>
              </div>
              {canAnalyze && (
                <button onClick={onReanalyze} className="btn-secondary w-full py-2 text-xs">
                  <RefreshCw size={12} /> 다시 시도
                </button>
              )}
            </div>
          )}

          {record.analysisStatus === "done" && (
            <>
              {record.metrics && Object.keys(record.metrics).length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-slate-400">측정값</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(record.metrics).map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded-lg bg-slate-800/50 px-3 py-2 text-xs"
                      >
                        <p className="text-slate-500">{k}</p>
                        <p className="mt-0.5 font-semibold text-slate-100">{String(v)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {record.strengths && record.strengths.length > 0 && (
                <Section title="✅ 강점" items={record.strengths} color="emerald" />
              )}
              {record.concerns && record.concerns.length > 0 && (
                <Section title="⚠ 주의" items={record.concerns} color="amber" />
              )}
              {record.recommendations && record.recommendations.length > 0 && (
                <Section title="💡 권장" items={record.recommendations} color="sky" />
              )}

              {record.extractedText && (
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer text-slate-300">원문 보기</summary>
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-800/50 p-3 font-mono text-[11px] leading-relaxed">
                    {record.extractedText}
                  </pre>
                </details>
              )}
            </>
          )}

          <div className="flex gap-2 border-t border-slate-800 pt-3">
            {canAnalyze && record.photo && (
              <button onClick={onReanalyze} className="btn-secondary flex-1 py-2 text-xs">
                <Sparkles size={12} /> 다시 분석
              </button>
            )}
            <button
              onClick={onRemove}
              className="btn-secondary flex-1 py-2 text-xs text-rose-300"
            >
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function statusLabel(r: HealthRecord) {
  switch (r.analysisStatus) {
    case "analyzing":
      return "AI 분석 중…";
    case "error":
      return "분석 실패";
    case "skipped":
      return "사진 저장됨 (분석 안 함)";
    default:
      return "분석 대기";
  }
}

function Section({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: "emerald" | "amber" | "sky";
}) {
  const colorMap = {
    emerald: "bg-emerald-500/10 text-emerald-200 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-200 border-amber-500/20",
    sky: "bg-sky-500/10 text-sky-200 border-sky-500/20",
  } as const;
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-slate-300">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${colorMap[color]}`}
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
