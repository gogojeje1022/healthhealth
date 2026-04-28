import { THEME_IDS, type ThemeId } from "../types";

const STORAGE_KEY = "healthhealth_theme";

/** localStorage 또는 알 수 없는 값을 안전하게 ThemeId 로 정규화. */
export function normalizeTheme(v: unknown): ThemeId {
  return typeof v === "string" && (THEME_IDS as readonly string[]).includes(v)
    ? (v as ThemeId)
    : "default";
}

/**
 * DOM 에 `data-theme` 속성을 적용하고 localStorage 에 캐시합니다.
 * - default 테마는 attribute 자체를 제거(하위 셀렉터 단순화).
 * - main.tsx 부팅·설정 변경·클라우드 동기화 후 모두 호출됩니다.
 */
export function applyTheme(t: ThemeId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "default") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = t;
  }
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // private mode 등 — 무시
  }
}

/** 캐시된 테마(=직전 세션의 선택값). 초기 페인트 깜빡임 방지에 사용. */
export function getCachedTheme(): ThemeId {
  if (typeof localStorage === "undefined") return "default";
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "default";
  }
}

/** Settings 의 theme(영속) 와 localStorage(첫 페인트용) 양쪽을 일관되게 갱신. */
export function persistTheme(t: ThemeId): void {
  applyTheme(t);
}
