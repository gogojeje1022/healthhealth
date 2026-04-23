import { getFirebaseAuth } from "./firebaseApp";
import { isCloudSyncMutation, syncCloudWithLocal } from "./cloudSync";

const DEBOUNCE_MS = 2500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let runAgain = false;
let listenersStarted = false;

async function runSyncOnce(): Promise<void> {
  try {
    if (!getFirebaseAuth().currentUser) return;
  } catch {
    return;
  }
  if (isCloudSyncMutation()) return;

  running = true;
  try {
    await syncCloudWithLocal();
  } catch (e) {
    console.warn("[autoCloudSync]", e);
  } finally {
    running = false;
  }
}

function kickSync(): void {
  void (async () => {
    if (running) {
      runAgain = true;
      return;
    }
    await runSyncOnce();
    while (runAgain) {
      runAgain = false;
      await runSyncOnce();
    }
  })();
}

/**
 * 로그인된 경우에만, 로컬 데이터 변경 후 Firestore 와 맞춥니다.
 * - immediate: 대기 없이 곧바로(탭 복귀·로그인 직후 등)
 * - 기본: DEBOUNCE_MS 후 한 번만(연속 저장 합침)
 */
export function requestAutoCloudSync(options?: { immediate?: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    if (!getFirebaseAuth().currentUser) return;
  } catch {
    return;
  }
  if (isCloudSyncMutation()) return;

  if (options?.immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    kickSync();
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    kickSync();
  }, DEBOUNCE_MS);
}

export function ensureAutoCloudSyncListeners(): void {
  if (typeof window === "undefined" || listenersStarted) return;
  listenersStarted = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestAutoCloudSync({ immediate: true });
    }
  });
}
