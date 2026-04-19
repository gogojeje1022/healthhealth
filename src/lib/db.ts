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

export async function patchSettings(patch: Partial<AppSettings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: SETTINGS_KEY });
}

export function uid(): string {
  // 안전한 32-bit 랜덤 ID
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
