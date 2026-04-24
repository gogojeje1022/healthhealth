import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  StickyNote,
  TriangleAlert,
} from "lucide-react";
import type { Meal } from "../types";
import { blobUrl } from "../lib/image";
import { cls } from "../lib/utils";

interface PhotoBlockProps {
  meal: Meal;
  readOnly?: boolean;
  canAnalyze?: boolean;
  onReanalyze?: () => void;
}

/** 식사 사진 + 분석 결과 블록. readOnly 일 때 재분석·편집 버튼을 숨깁니다. */
export function MealPhotoBlock({ meal, readOnly = false, canAnalyze = false, onReanalyze }: PhotoBlockProps) {
  const url = blobUrl(meal.photo || meal.thumbnail);
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
            loading="lazy"
            decoding="async"
            className="aspect-video w-full object-cover"
          />
        )}
      </button>

      {showFull && fullUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/88 p-3"
          onClick={() => setShowFull(false)}
        >
          <img src={fullUrl} alt="원본" className="max-h-[92vh] max-w-full object-contain" />
          <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-400">
            탭하여 닫기
          </p>
        </div>
      )}

      <MealAnalysisBlock
        meal={meal}
        readOnly={readOnly}
        canAnalyze={canAnalyze}
        onReanalyze={onReanalyze}
      />
    </div>
  );
}

interface AnalysisProps {
  meal: Meal;
  readOnly?: boolean;
  canAnalyze?: boolean;
  onReanalyze?: () => void;
}

export function MealAnalysisBlock({ meal, readOnly = false, canAnalyze = false, onReanalyze }: AnalysisProps) {
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
        {!readOnly && canAnalyze && onReanalyze && (
          <button onClick={onReanalyze} className="btn-secondary w-full py-2 text-sm">
            <RefreshCw size={14} /> 다시 시도
          </button>
        )}
      </div>
    );
  }
  if (meal.analysisStatus === "skipped" || !meal.menuText) {
    if (readOnly) {
      return <p className="text-xs text-slate-500">AI 분석 결과가 없어요.</p>;
    }
    return canAnalyze && onReanalyze ? (
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
        <p className="min-w-0 flex-1 break-words text-sm font-medium leading-relaxed text-slate-100">
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
        <p className="break-words text-xs leading-relaxed text-slate-400 whitespace-pre-wrap">
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
      {!readOnly && canAnalyze && onReanalyze && (
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

/** 친구 프로필처럼 읽기 전용으로 노트를 보여주는 컴포넌트. */
export function MealNoteReadOnly({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-400">
      <StickyNote size={14} className="mt-0.5 shrink-0" />
      <span className="flex-1 break-words whitespace-pre-wrap">{value}</span>
    </div>
  );
}
