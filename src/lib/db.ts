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

function scheduleAutoSyncAfterSettings(patch: Partial<AppSettings>): void {
  const keys = Object.keys(patch);
  if (
    keys.length > 0 &&
    keys.every((k) => k === "geminiApiKey" || k === "geminiApiKeyBackup")
  ) {
    return;
  }
  void import("./autoCloudSync").then((m) => {
    m.ensureAutoCloudSyncListeners();
    m.requestAutoCloudSync();
  });
}

/** 식단·건강·가족 등 로컬 데이터 변경 후 호출 — 로그인 시 클라우드와 자동 맞춤 */
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
  } else if (
    "activeUserId" in patch ||
    "model" in patch ||
    "onboarded" in patch
  ) {
    next.appSettingsUpdatedAt = Date.now();
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
