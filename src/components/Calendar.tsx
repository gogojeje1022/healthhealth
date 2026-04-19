import { useMemo } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { cls, dateKey, formatKoMonth } from "../lib/utils";

interface Props {
  cursor: Date;
  setCursor: (d: Date) => void;
  selected?: string;
  onPick: (key: string) => void;
  userId?: string;
}

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function Calendar({ cursor, setCursor, selected, onPick, userId }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const arr: Date[] = [];
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
      arr.push(new Date(d));
    }
    return arr;
  }, [cursor]);

  const startKey = dateKey(days[0]);
  const endKey = dateKey(days[days.length - 1]);

  // 해당 월의 식사 기록 카운트
  const counts = useLiveQuery(async () => {
    const meals = await db.meals
      .where("date")
      .between(startKey, endKey, true, true)
      .toArray();
    const map = new Map<string, { total: number; ratings: number[] }>();
    for (const m of meals) {
      if (userId && m.userId !== userId) continue;
      const cur = map.get(m.date) ?? { total: 0, ratings: [] };
      cur.total += 1;
      if (typeof m.rating === "number") cur.ratings.push(m.rating);
      map.set(m.date, cur);
    }
    return map;
  }, [startKey, endKey, userId]);

  return (
    <div className="card p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <button
          onClick={() => setCursor(subMonths(cursor, 1))}
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"
          aria-label="이전 달"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-base font-semibold">{formatKoMonth(cursor)}</h2>
        <button
          onClick={() => setCursor(addMonths(cursor, 1))}
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"
          aria-label="다음 달"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
        {WEEK_LABELS.map((w, i) => (
          <div
            key={w}
            className={cls(i === 0 && "text-rose-400/80", i === 6 && "text-sky-400/80")}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = dateKey(d);
          const inMonth = isSameMonth(d, cursor);
          const isSelected = key === selected;
          const today = isToday(d);
          const c = counts?.get(key);
          const avgRating =
            c && c.ratings.length > 0
              ? c.ratings.reduce((a, b) => a + b, 0) / c.ratings.length
              : undefined;
          const dow = d.getDay();

          return (
            <button
              key={key}
              onClick={() => onPick(key)}
              className={cls(
                "aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-colors",
                inMonth ? "text-slate-100" : "text-slate-600",
                today && !isSelected && "ring-1 ring-brand-500/60",
                isSelected
                  ? "bg-brand-500 text-white"
                  : "hover:bg-slate-800/60",
              )}
            >
              <span
                className={cls(
                  "leading-none",
                  !isSelected && dow === 0 && inMonth && "text-rose-300",
                  !isSelected && dow === 6 && inMonth && "text-sky-300",
                )}
              >
                {format(d, "d")}
              </span>
              {c && c.total > 0 && (
                <span className="mt-1 flex items-center gap-0.5">
                  <span
                    className={cls(
                      "h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-white" : "bg-brand-400",
                    )}
                  />
                  {avgRating !== undefined && (
                    <span
                      className={cls(
                        "text-[9px] font-bold tabular-nums",
                        isSelected ? "text-white" : "text-amber-400",
                      )}
                    >
                      {avgRating.toFixed(1)}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
