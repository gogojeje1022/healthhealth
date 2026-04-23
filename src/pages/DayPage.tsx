import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  StickyNote,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { afterUserDataMutation, db, getSettings, uid } from "../lib/db";
import { analyzeMealImage } from "../lib/ai";
import {
  MEAL_SLOTS,
  MEAL_SLOT_EMOJI,
  MEAL_SLOT_LABELS,
  type Meal,
  type MealSlot,
} from "../types";
import PhotoUpload from "../components/PhotoUpload";
import UserSelector from "../components/UserSelector";
import { blobUrl } from "../lib/image";
import { cls, formatKoDate } from "../lib/utils";

export default function DayPage() {
  const { date = "" } = useParams();
  const navigate = useNavigate();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const settings = useLiveQuery(() => getSettings(), []);
  const userId = settings?.activeUserId;

  const meals = useLiveQuery(
    async () =>
      userId && date
        ? await db.meals.where("[userId+date]").equals([userId, date]).toArray()
        : [],
    [userId, date],
  );

  const mealsBySlot = useMemo(() => {
    const m = new Map<MealSlot, Meal>();
    meals?.forEach((x) => m.set(x.slot, x));
    return m;
  }, [meals]);

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <header className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 hover:bg-slate-800"
          aria-label="뒤로"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-slate-400">식사 기록</p>
          <h1 className="text-lg font-bold">{formatKoDate(date)}</h1>
        </div>
      </header>

      <UserSelector />

      {!settings?.geminiApiKey && (
        <Link to="/settings" className="card border-slate-700 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
          AI 분석은 설정에 Gemini 키가 필요합니다.
        </Link>
      )}

      {!userId && (
        <div className="card p-4 text-center text-sm text-slate-400">사용자를 선택하세요.</div>
      )}

      {!validDate && (
        <div className="card p-4 text-center text-sm text-rose-300">
          잘못된 날짜입니다.
        </div>
      )}

      {userId && validDate &&
        MEAL_SLOTS.map((slot) => (
          <SlotSection
            key={slot}
            slot={slot}
            date={date}
            userId={userId}
            meal={mealsBySlot.get(slot)}
            apiKey={settings?.geminiApiKey}
            apiKeyBackup={settings?.geminiApiKeyBackup}
            modelName={settings?.model}
          />
        ))}
    </div>
  );
}

interface SlotProps {
  slot: MealSlot;
  date: string;
  userId: string;
  meal?: Meal;
  apiKey?: string;
  apiKeyBackup?: string;
  modelName?: string;
}

function SlotSection({ slot, date, userId, meal, apiKey, apiKeyBackup, modelName }: SlotProps) {
  const sectionRef = useRef<HTMLElement>(null);

  // 해시(#breakfast 등) 자동 스크롤
  useEffect(() => {
    if (window.location.hash === `#${slot}`) {
      setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [slot]);

  async function createOrUpdateMealWithPhoto(photo: Blob, thumbnail: Blob) {
    const now = Date.now();
    const id = meal?.id ?? uid();
    const base: Meal = meal
      ? {
          ...meal,
          photo,
          thumbnail,
          analysisStatus: apiKey ? "analyzing" : "skipped",
          updatedAt: now,
          analysisError: undefined,
        }
      : {
          id,
          userId,
          date,
          slot,
          photo,
          thumbnail,
          analysisStatus: apiKey ? "analyzing" : "skipped",
          createdAt: now,
          updatedAt: now,
        };
    await db.meals.put(base);
    if (apiKey) {
      runAnalysis(id, photo, apiKey, modelName, apiKeyBackup);
    }
  }

  async function runAnalysis(
    id: string,
    photo: Blob,
    key: string,
    model?: string,
    backupKey?: string,
  ) {
    try {
      const result = await analyzeMealImage(key, photo, model, backupKey);
      const cur = await db.meals.get(id);
      if (!cur) return;
      await db.meals.put({
        ...cur,
        menuText: result.menuText,
        rating: result.rating,
        aiComment: result.aiComment,
        nutrition: result.nutrition,
        analysisStatus: "done",
        analysisError: undefined,
        updatedAt: Date.now(),
      });
      afterUserDataMutation();
    } catch (e) {
      const cur = await db.meals.get(id);
      if (!cur) return;
      await db.meals.put({
        ...cur,
        analysisStatus: "error",
        analysisError: e instanceof Error ? e.message : String(e),
        updatedAt: Date.now(),
      });
      afterUserDataMutation();
    }
  }

  async function reAnalyze() {
    if (!meal?.photo || !apiKey) return;
    await db.meals.put({
      ...meal,
      analysisStatus: "analyzing",
      analysisError: undefined,
      updatedAt: Date.now(),
    });
    afterUserDataMutation();
    runAnalysis(meal.id, meal.photo, apiKey, modelName, apiKeyBackup);
  }

  async function removeMeal() {
    if (!meal) return;
    if (!confirm("이 기록을 삭제할까요?")) return;
    await db.meals.delete(meal.id);
    afterUserDataMutation();
  }

  async function updateNotes(notes: string) {
    if (!meal) return;
    await db.meals.put({ ...meal, notes, updatedAt: Date.now() });
    afterUserDataMutation();
  }

  return (
    <section ref={sectionRef} id={slot} className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{MEAL_SLOT_EMOJI[slot]}</span>
          <h3 className="text-base font-semibold">{MEAL_SLOT_LABELS[slot]}</h3>
        </div>
        {meal && (
          <button
            onClick={removeMeal}
            className="rounded-lg p-2 text-slate-500 hover:text-rose-400"
            aria-label="삭제"
          >
            <Trash2 size={16} />
          </button>
        )}
      </header>

      <div className="space-y-3 p-4">
        {meal?.photo ? (
          <PhotoBlock meal={meal} onReanalyze={reAnalyze} canAnalyze={!!apiKey} />
        ) : (
          <PhotoUpload
            label="사진 찍어 기록하기"
            onPicked={createOrUpdateMealWithPhoto}
          />
        )}

        {meal?.photo && (
          <PhotoUpload
            label="다시 찍기"
            onPicked={createOrUpdateMealWithPhoto}
            variant="ghost"
          />
        )}

        {meal && (
          <NoteInput
            value={meal.notes ?? ""}
            onSave={updateNotes}
          />
        )}
      </div>
    </section>
  );
}

function PhotoBlock({
  meal,
  onReanalyze,
  canAnalyze,
}: {
  meal: Meal;
  onReanalyze: () => void;
  canAnalyze: boolean;
}) {
  const url = blobUrl(meal.thumbnail || meal.photo);
  const fullUrl = blobUrl(meal.photo);
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowFull(true)}
        className="block w-full overflow-hidden rounded-xl border border-slate-800"
      >
        {url && (
          <img
            src={url}
            alt="식사 사진"
            className="aspect-video w-full object-cover"
          />
        )}
      </button>

      {showFull && fullUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowFull(false)}
        >
          <img src={fullUrl} alt="원본" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}

      <AnalysisBlock meal={meal} onReanalyze={onReanalyze} canAnalyze={canAnalyze} />
    </div>
  );
}

function AnalysisBlock({
  meal,
  onReanalyze,
  canAnalyze,
}: {
  meal: Meal;
  onReanalyze: () => void;
  canAnalyze: boolean;
}) {
  if (meal.analysisStatus === "analyzing") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-slate-800/50 px-3 py-2.5 text-sm text-slate-300">
        <Loader2 size={16} className="animate-spin text-brand-400" />
        AI가 식단을 분석하고 있어요…
      </div>
    );
  }
  if (meal.analysisStatus === "error") {
    return (
      <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2.5">
        <div className="flex items-start gap-2 text-sm text-rose-300">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span className="break-all">{meal.analysisError ?? "분석 실패"}</span>
        </div>
        {canAnalyze && (
          <button onClick={onReanalyze} className="btn-secondary w-full py-2 text-sm">
            <RefreshCw size={14} /> 다시 시도
          </button>
        )}
      </div>
    );
  }
  if (meal.analysisStatus === "skipped" || !meal.menuText) {
    return canAnalyze ? (
      <button onClick={onReanalyze} className="btn-secondary w-full py-2 text-sm">
        <Sparkles size={14} /> AI 분석 시작
      </button>
    ) : (
      <p className="text-xs text-slate-500">설정에서 키를 저장해 두면 여기서도 분석이 돼요.</p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-slate-800/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium leading-relaxed text-slate-100">
          {meal.menuText}
        </p>
        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-300">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={12}
              className={cls(
                i <= (meal.rating ?? 0)
                  ? "fill-amber-300 text-amber-300"
                  : "text-amber-300/30",
              )}
            />
          ))}
          <span className="ml-0.5">{meal.rating}</span>
        </span>
      </div>
      {meal.aiComment && (
        <p className="text-xs leading-relaxed text-slate-400">
          <Sparkles size={11} className="mb-0.5 mr-1 inline text-brand-400" />
          {meal.aiComment}
        </p>
      )}
      {meal.nutrition && (
        <div className="flex flex-wrap gap-1.5">
          {meal.nutrition.calories !== undefined && (
            <span className="chip bg-slate-700/60 text-slate-200">
              🔥 {meal.nutrition.calories}kcal
            </span>
          )}
          {meal.nutrition.protein !== undefined && (
            <span className="chip bg-slate-700/60 text-slate-200">
              💪 단백질 {meal.nutrition.protein}g
            </span>
          )}
          {meal.nutrition.carbs !== undefined && (
            <span className="chip bg-slate-700/60 text-slate-200">
              🌾 탄수 {meal.nutrition.carbs}g
            </span>
          )}
          {meal.nutrition.fat !== undefined && (
            <span className="chip bg-slate-700/60 text-slate-200">
              🥑 지방 {meal.nutrition.fat}g
            </span>
          )}
          {meal.nutrition.healthTags?.map((t) => (
            <span key={t} className="chip bg-brand-500/15 text-brand-300">
              #{t}
            </span>
          ))}
        </div>
      )}
      {canAnalyze && (
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 size={11} /> AI 분석 완료
          </span>
          <button
            onClick={onReanalyze}
            className="inline-flex items-center gap-1 hover:text-slate-300"
          >
            <RefreshCw size={11} /> 다시 분석
          </button>
        </div>
      )}
    </div>
  );
}

function NoteInput({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setV(value);
  }, [value]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-start gap-2 rounded-xl border border-dashed border-slate-800 px-3 py-2 text-left text-xs text-slate-400 hover:border-slate-700 hover:text-slate-300"
      >
        <StickyNote size={14} className="mt-0.5 shrink-0" />
        <span className="flex-1 break-words">{value || "메모 추가하기"}</span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        rows={2}
        placeholder="메모 (예: 외식, 컨디션, 양 등)"
        className="input"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={() => {
            setV(value);
            setEditing(false);
          }}
          className="btn-secondary flex-1 py-2 text-sm"
        >
          취소
        </button>
        <button
          onClick={() => {
            onSave(v);
            setEditing(false);
          }}
          className="btn-primary flex-1 py-2 text-sm"
        >
          저장
        </button>
      </div>
    </div>
  );
}
