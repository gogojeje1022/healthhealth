import { format, parse } from "date-fns";
import { ko } from "date-fns/locale";

export function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const DATE_KEY_FMT = "yyyy-MM-dd";

export function dateKey(date: Date = new Date()): string {
  return format(date, DATE_KEY_FMT);
}

export function parseDateKey(key: string): Date {
  return parse(key, DATE_KEY_FMT, new Date());
}

export function formatKoDate(date: Date | string, fmt = "yyyy년 M월 d일 (E)") {
  const d = typeof date === "string" ? parseDateKey(date) : date;
  return format(d, fmt, { locale: ko });
}

export function formatKoMonth(date: Date) {
  return format(date, "yyyy년 M월", { locale: ko });
}

/** 색상 팔레트 - 사용자 추가시 자동 할당 */
export const USER_COLOR_PALETTE = [
  "#10b981", // emerald
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#a855f7", // purple
];

export function nextColor(usedColors: string[]): string {
  return (
    USER_COLOR_PALETTE.find((c) => !usedColors.includes(c)) ??
    USER_COLOR_PALETTE[usedColors.length % USER_COLOR_PALETTE.length]
  );
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function scoreColor(score: number | undefined): string {
  if (score == null) return "#64748b";
  if (score >= 85) return "#10b981";
  if (score >= 70) return "#84cc16";
  if (score >= 55) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

export function scoreLabel(score: number | undefined): string {
  if (score == null) return "—";
  if (score >= 85) return "매우 좋음";
  if (score >= 70) return "양호";
  if (score >= 55) return "보통";
  if (score >= 40) return "주의";
  return "위험";
}
