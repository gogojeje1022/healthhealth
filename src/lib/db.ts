import Dexie, { type Table } from "dexie";
import type { AppSettings, HealthRecord, Meal, User } from "../types";

class HealthHealthDB extends Dexie {
  users!: Table<User, string>;
  meals!: Table<Meal, string>;
  health!: Table<HealthRecord, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("healthhealth");
    this.version(1).stores({
      users: "id, name, createdAt",
      // 복합 인덱스로 [userId+date], [date+slot] 조회 최적화
      meals: "id, userId, date, slot, [userId+date], [date+slot], createdAt",
      health: "id, userId, type, recordDate, createdAt",
      settings: "id",
    });
  }
}

export const db = new HealthHealthDB();

export const SETTINGS_KEY = "settings" as const;

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get(SETTINGS_KEY);
  return s ?? { id: SETTINGS_KEY };
}

/** 로그아웃·Google 계정 전환 시: 로컬 프로필·기록·설정 전부 초기화(다음 로그인 계정의 클라우드로 채움). */
export async function clearLocalProfileDataPreservingDevicePreferences(): Promise<void> {
  await db.transaction("rw", db.users, db.meals, db.health, db.settings, async () => {
    await db.users.clear();
    await db.meals.clear();
    await db.health.clear();
    await db.settings.clear();
    await db.settings.put({ id: SETTINGS_KEY });
  });
}

// db.ts ↔ cloudSync.ts ↔ autoCloudSync.ts 사이의 순환 의존성을 끊기 위해
// autoCloudSync 는 동적으로만 import 한다. (vite 가 dynamic+static 동시 import 경고를
// 띄우지만 같은 청크라 실제 분리되지 않으니 무시해도 됩니다.)
function scheduleAutoSyncAfterSettings(_patch: Partial<AppSettings>): void {
  void import("./autoCloudSync").then((m) => {
    m.ensureAutoCloudSyncListeners();
    m.requestAutoCloudSync();
  });
}

/** 식단·건강·프로필 등 로컬 데이터 변경 후 호출 — 로그인 시 클라우드와 자동 맞춤 */
export function afterUserDataMutation(): void {
  void import("./autoCloudSync").then((m) => {
    m.ensureAutoCloudSyncListeners();
    m.requestAutoCloudSync();
  });
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<void> {
  const cur = await getSettings();
  const next: AppSettings = { ...cur, ...patch, id: SETTINGS_KEY };
  if ("appSettingsUpdatedAt" in patch && patch.appSettingsUpdatedAt !== undefined) {
    next.appSettingsUpdatedAt = patch.appSettingsUpdatedAt;
  } else if ("activeUserId" in patch || "onboarded" in patch || "theme" in patch) {
    next.appSettingsUpdatedAt = Date.now();
  }
  if ("geminiApiKey" in patch) {
    next.geminiSettingsUpdatedAt = Date.now();
  }
  await db.settings.put(next);
  scheduleAutoSyncAfterSettings(patch);
}

export function uid(): string {
  // 안전한 32-bit 랜덤 ID
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

/** 식단·건강 삭제 시 클라우드 동기화가 원격 문서를 다시 끌어오지 않도록 표시 */
export async function registerCloudDeletes(ids: {
  meals?: string[];
  health?: string[];
}): Promise<void> {
  const cur = await getSettings();
  const pd = cur.cloudPendingDeletes ?? {};
  const meals = new Set([...(pd.meals ?? []), ...(ids.meals ?? [])]);
  const health = new Set([...(pd.health ?? []), ...(ids.health ?? [])]);
  const cloudPendingDeletes =
    meals.size + health.size === 0
      ? undefined
      : { meals: [...meals], health: [...health] };
  await patchSettings({ cloudPendingDeletes });
}

export async function registerCloudDelete(
  kind: "meals" | "health",
  id: string,
): Promise<void> {
  await registerCloudDeletes({ [kind]: [id] });
}
