import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, StickyNote, Trash2 } from "lucide-react";
import { afterUserDataMutation, db, getSettings, registerCloudDelete, uid } from "../lib/db";
import { analyzeMealImage } from "../lib/ai";
import {
  MEAL_SLOTS,
  MEAL_SLOT_EMOJI,
  MEAL_SLOT_LABELS,
  type Meal,
  type MealSlot,
} from "../types";
import PhotoUpload from "../components/PhotoUpload";
import { MealPhotoBlock } from "../components/MealCard";
import { usePrimaryUserId } from "../hooks/usePrimaryUserId";
import { formatKoDate } from "../lib/utils";

export default function DayPage() {
  const { date = "" } = useParams();
  const navigate = useNavigate();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const settings = useLiveQuery(() => getSettings(), []);
  const userId = usePrimaryUserId();

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

      {!settings?.geminiApiKey && (
        <Link to="/settings" className="card border-slate-700 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
          AI 분석은 설정에 Gemini 키가 필요합니다.
        </Link>
      )}

      {!userId && (
        <div className="card p-4 text-center text-sm text-slate-400">프로필을 불러오는 중이에요.</div>
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
}

function SlotSection({ slot, date, userId, meal, apiKey, apiKeyBackup }: SlotProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [searchParams] = useSearchParams();

  // HashRouter에서는 #/경로#슬롯 이 한 fragment에 섞여 해시 매칭이 깨짐 → ?slot= 로 이동
  useEffect(() => {
    if (searchParams.get("slot") !== slot) return;
    const t = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [slot, searchParams]);

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
      runAnalysis(id, photo, apiKey, apiKeyBackup);
    }
  }

  async function runAnalysis(
    id: string,
    photo: Blob,
    key: string,
    backupKey?: string,
  ) {
    try {
      const result = await analyzeMealImage(key, photo, undefined, backupKey);
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
    runAnalysis(meal.id, meal.photo, apiKey, apiKeyBackup);
  }

  async function removeMeal() {
    if (!meal) return;
    if (!confirm("이 기록을 삭제할까요?")) return;
    await db.meals.delete(meal.id);
    await registerCloudDelete("meals", meal.id);
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
          <MealPhotoBlock meal={meal} onReanalyze={reAnalyze} canAnalyze={!!apiKey} />
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
