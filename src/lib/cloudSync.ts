import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { AppSettings, HealthRecord, Meal, User } from "../types";
import { db as dexieDb, getSettings, SETTINGS_KEY } from "./db";
import { getFirestoreDb, getFirebaseAuth } from "./firebaseApp";
import { base64ToBlob, blobToBase64, compressImage, makeThumbnail } from "./image";

const BATCH = 400;
/** Firestore 문서 상한 1MiB — Base64·메타 여유 */
const DOC_SAFE_BYTES = 900_000;

export type MealStored = Omit<Meal, "photo" | "thumbnail"> & {
  photoBase64?: string;
  photoMimeType?: string;
  /** 구버전(Storage) 동기화 잔여 필드 — 읽을 때 무시 */
  photoPath?: string;
  thumbnailPath?: string;
};

export type HealthStored = Omit<HealthRecord, "photo" | "thumbnail"> & {
  photoBase64?: string;
  photoMimeType?: string;
  photoPath?: string;
  thumbnailPath?: string;
};

type PublicSettingsDoc = {
  activeUserId?: string;
  model?: string;
  onboarded?: boolean;
  updatedAt: number;
};

function userVer(u: User): number {
  return u.updatedAt ?? u.createdAt;
}

function cleanForFirestore<T extends object>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

function docJsonSize(data: object): number {
  return new Blob([JSON.stringify(data)]).size;
}

async function storedToMeal(s: MealStored): Promise<Meal> {
  const { photoPath: _p, thumbnailPath: _t, photoBase64, photoMimeType, ...rest } = s;
  const meal: Meal = { ...rest };
  if (photoBase64 && photoMimeType) {
    const blob = base64ToBlob(photoBase64, photoMimeType);
    meal.photo = blob;
    meal.thumbnail = await makeThumbnail(blob);
  }
  return meal;
}

async function storedToHealth(s: HealthStored): Promise<HealthRecord> {
  const { photoPath: _p, thumbnailPath: _t, photoBase64, photoMimeType, ...rest } = s;
  const rec: HealthRecord = { ...rest };
  if (photoBase64 && photoMimeType) {
    const blob = base64ToBlob(photoBase64, photoMimeType);
    rec.photo = blob;
    rec.thumbnail = await makeThumbnail(blob);
  }
  return rec;
}

function mergeUsers(local: User[], remote: User[]): User[] {
  const rMap = new Map(remote.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = new Set([...lMap.keys(), ...rMap.keys()]);
  const out: User[] = [];
  for (const id of ids) {
    const l = lMap.get(id);
    const r = rMap.get(id);
    if (!l) out.push(r!);
    else if (!r) out.push(l);
    else if (userVer(l) >= userVer(r)) out.push(l);
    else out.push(r);
  }
  return out;
}

async function mergeMeals(local: Meal[], remote: MealStored[]): Promise<Meal[]> {
  const rMap = new Map(remote.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = new Set([...lMap.keys(), ...rMap.keys()]);
  const out: Meal[] = [];
  for (const id of ids) {
    const l = lMap.get(id);
    const r = rMap.get(id);
    if (!l) out.push(await storedToMeal(r!));
    else if (!r) out.push(l);
    else if (l.updatedAt >= r.updatedAt) out.push(l);
    else out.push(await storedToMeal(r));
  }
  return out;
}

async function mergeHealth(local: HealthRecord[], remote: HealthStored[]): Promise<HealthRecord[]> {
  const rMap = new Map(remote.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = new Set([...lMap.keys(), ...rMap.keys()]);
  const out: HealthRecord[] = [];
  for (const id of ids) {
    const l = lMap.get(id);
    const r = rMap.get(id);
    if (!l) out.push(await storedToHealth(r!));
    else if (!r) out.push(l);
    else if (l.updatedAt >= r.updatedAt) out.push(l);
    else out.push(await storedToHealth(r));
  }
  return out;
}

async function pullMembers(uid: string): Promise<User[]> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", uid, "members"));
  return snap.docs.map((d) => d.data() as User);
}

async function pullMealsStored(uid: string): Promise<MealStored[]> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", uid, "meals"));
  return snap.docs.map((d) => ({ ...(d.data() as MealStored), id: d.id }));
}

async function pullHealthStored(uid: string): Promise<HealthStored[]> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", uid, "health"));
  return snap.docs.map((d) => ({ ...(d.data() as HealthStored), id: d.id }));
}

async function pullPublicSettings(uid: string): Promise<PublicSettingsDoc | null> {
  const fs = getFirestoreDb();
  const d = await getDoc(doc(fs, "users", uid, "config", "public"));
  if (!d.exists) return null;
  return d.data() as PublicSettingsDoc;
}

async function mealToStored(m: Meal): Promise<MealStored> {
  const { photo, thumbnail, ...rest } = m;
  const base: MealStored = { ...rest };
  const source = photo?.size ? photo : thumbnail?.size ? thumbnail : null;
  if (!source) return base;

  const attempts: { maxDimension: number; quality: number }[] = [
    { maxDimension: 720, quality: 0.72 },
    { maxDimension: 640, quality: 0.62 },
    { maxDimension: 560, quality: 0.55 },
    { maxDimension: 480, quality: 0.5 },
  ];

  let lastErr = "Firestore 문서 한도(약 1MB, 무료 플랜)를 넘습니다.";
  for (const opts of attempts) {
    const compressed = await compressImage(source, {
      maxDimension: opts.maxDimension,
      quality: opts.quality,
      mimeType: "image/jpeg",
    });
    const b64 = await blobToBase64(compressed);
    const trial: MealStored = {
      ...base,
      photoBase64: b64,
      photoMimeType: "image/jpeg",
    };
    const cleaned = cleanForFirestore(trial);
    if (docJsonSize(cleaned) <= DOC_SAFE_BYTES) return cleaned;
    lastErr = `식사 기록(${m.date}) 사진이 동기화 한도를 넘깁니다. 더 작은 원본으로 다시 찍거나 해당 날짜 기록을 나눠 주세요.`;
  }
  throw new Error(lastErr);
}

async function healthToStored(h: HealthRecord): Promise<HealthStored> {
  const { photo, thumbnail, ...rest } = h;
  const base: HealthStored = { ...rest };
  const source = photo?.size ? photo : thumbnail?.size ? thumbnail : null;
  if (!source) return base;

  const attempts: { maxDimension: number; quality: number }[] = [
    { maxDimension: 960, quality: 0.72 },
    { maxDimension: 800, quality: 0.62 },
    { maxDimension: 640, quality: 0.55 },
    { maxDimension: 520, quality: 0.5 },
  ];

  let lastErr = "Firestore 문서 한도를 넘습니다.";
  for (const opts of attempts) {
    const compressed = await compressImage(source, {
      maxDimension: opts.maxDimension,
      quality: opts.quality,
      mimeType: "image/jpeg",
    });
    const b64 = await blobToBase64(compressed);
    const trial: HealthStored = {
      ...base,
      photoBase64: b64,
      photoMimeType: "image/jpeg",
    };
    const cleaned = cleanForFirestore(trial);
    if (docJsonSize(cleaned) <= DOC_SAFE_BYTES) return cleaned;
    lastErr = `건강기록(${h.recordDate}) 사진이 동기화 한도를 넘깁니다.`;
  }
  throw new Error(lastErr);
}

async function deleteRemoteMembersNotIn(uid: string, keep: Set<string>): Promise<void> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", uid, "members"));
  for (const d of snap.docs) {
    if (!keep.has(d.id)) await deleteDoc(d.ref);
  }
}

async function deleteRemoteMealsNotIn(uid: string, keep: Set<string>): Promise<void> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", uid, "meals"));
  for (const d of snap.docs) {
    if (!keep.has(d.id)) await deleteDoc(d.ref);
  }
}

async function deleteRemoteHealthNotIn(uid: string, keep: Set<string>): Promise<void> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", uid, "health"));
  for (const d of snap.docs) {
    if (!keep.has(d.id)) await deleteDoc(d.ref);
  }
}

async function pushMembers(uid: string, users: User[]): Promise<void> {
  const fs = getFirestoreDb();
  let batch = writeBatch(fs);
  let n = 0;
  for (const u of users) {
    batch.set(doc(fs, "users", uid, "members", u.id), cleanForFirestore(u));
    n++;
    if (n >= BATCH) {
      await batch.commit();
      batch = writeBatch(fs);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function pushMeals(uid: string, meals: Meal[]): Promise<void> {
  const fs = getFirestoreDb();
  let batch = writeBatch(fs);
  let n = 0;
  for (const m of meals) {
    const stored = await mealToStored(m);
    batch.set(doc(fs, "users", uid, "meals", m.id), stored);
    n++;
    if (n >= BATCH) {
      await batch.commit();
      batch = writeBatch(fs);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function pushHealth(uid: string, rows: HealthRecord[]): Promise<void> {
  const fs = getFirestoreDb();
  let batch = writeBatch(fs);
  let n = 0;
  for (const h of rows) {
    const stored = await healthToStored(h);
    batch.set(doc(fs, "users", uid, "health", h.id), stored);
    n++;
    if (n >= BATCH) {
      await batch.commit();
      batch = writeBatch(fs);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function pushPublicSettings(uid: string, s: AppSettings): Promise<void> {
  const fs = getFirestoreDb();
  const updatedAt = s.appSettingsUpdatedAt ?? Date.now();
  const docData: PublicSettingsDoc = {
    activeUserId: s.activeUserId,
    model: s.model,
    onboarded: s.onboarded,
    updatedAt,
  };
  await setDoc(doc(fs, "users", uid, "config", "public"), cleanForFirestore(docData));
}

/** Firestore 규칙 미게시 등으로 동기화가 막힐 때 사용자 안내 */
export function formatCloudSyncError(e: unknown): string {
  const base = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code;
  if (code === "permission-denied" || /insufficient permissions/i.test(base)) {
    return `${base} — Firestore 규칙에 firestore.rules 를 콘솔에서 게시했는지 확인하세요.`;
  }
  return base;
}

/**
 * 원격과 로컬을 병합한 뒤 양쪽에 반영합니다.
 * Spark(무료) 플랜: Firebase Storage 없이 Firestore 문서에 압축 JPEG(Base64)만 저장합니다.
 * Gemini 키는 클라우드에 올리지 않습니다.
 */
export async function syncCloudWithLocal(): Promise<void> {
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Google 로그인이 필요합니다.");

  const remoteMembers = await pullMembers(uid);
  const remoteMeals = await pullMealsStored(uid);
  const remoteHealth = await pullHealthStored(uid);
  const remotePublic = await pullPublicSettings(uid);

  const localMembers = await dexieDb.users.toArray();
  const localMeals = await dexieDb.meals.toArray();
  const localHealth = await dexieDb.health.toArray();
  let localSettings = await getSettings();

  const mergedMembers = mergeUsers(localMembers, remoteMembers);
  const mergedMeals = await mergeMeals(localMeals, remoteMeals);
  const mergedHealth = await mergeHealth(localHealth, remoteHealth);

  if (remotePublic && remotePublic.updatedAt > (localSettings.appSettingsUpdatedAt ?? 0)) {
    localSettings = {
      ...localSettings,
      activeUserId: remotePublic.activeUserId,
      model: remotePublic.model,
      onboarded: remotePublic.onboarded,
      appSettingsUpdatedAt: remotePublic.updatedAt,
      id: SETTINGS_KEY,
    };
  }

  await dexieDb.transaction("rw", dexieDb.users, dexieDb.meals, dexieDb.health, dexieDb.settings, async () => {
    const mu = new Set(mergedMembers.map((x) => x.id));
    const oldU = await dexieDb.users.toCollection().primaryKeys();
    await dexieDb.users.bulkDelete(oldU.filter((id) => !mu.has(id as string)) as string[]);
    await dexieDb.users.bulkPut(mergedMembers);

    const mm = new Set(mergedMeals.map((x) => x.id));
    const oldM = await dexieDb.meals.toCollection().primaryKeys();
    await dexieDb.meals.bulkDelete(oldM.filter((id) => !mm.has(id as string)) as string[]);
    await dexieDb.meals.bulkPut(mergedMeals);

    const mh = new Set(mergedHealth.map((x) => x.id));
    const oldH = await dexieDb.health.toCollection().primaryKeys();
    await dexieDb.health.bulkDelete(oldH.filter((id) => !mh.has(id as string)) as string[]);
    await dexieDb.health.bulkPut(mergedHealth);

    await dexieDb.settings.put({
      ...localSettings,
      lastCloudSyncAt: Date.now(),
      id: SETTINGS_KEY,
    });
  });

  await deleteRemoteMembersNotIn(uid, new Set(mergedMembers.map((x) => x.id)));
  await deleteRemoteMealsNotIn(uid, new Set(mergedMeals.map((x) => x.id)));
  await deleteRemoteHealthNotIn(uid, new Set(mergedHealth.map((x) => x.id)));

  await pushMembers(uid, mergedMembers);
  await pushMeals(uid, mergedMeals);
  await pushHealth(uid, mergedHealth);

  const latestLocal = await getSettings();
  await pushPublicSettings(uid, latestLocal);
}
