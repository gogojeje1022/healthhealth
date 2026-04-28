import {
  collection,
  deleteDoc,
  deleteField,
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

// 헬스헬스는 1인 앱이라 Dexie `users` 테이블에는 본인 프로필 1행만 들어갑니다.
// Firestore 컬렉션명 `users/{uid}/members` 는 초기 멀티 프로필 시절의 잔재이지만,
// 기존 사용자 데이터와의 호환을 위해 이름은 그대로 둡니다.
// 코드 내부의 *Members 함수·변수도 같은 의미입니다.

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
  onboarded?: boolean;
  updatedAt: number;
};

/** 본인 Firebase UID 하위만 접근 — Gemini 키(계정별) */
type PrivateSettingsDoc = {
  geminiApiKey?: string;
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

function prunePendingDeletes(
  pd: AppSettings["cloudPendingDeletes"],
  meals: Meal[],
  health: HealthRecord[],
): AppSettings["cloudPendingDeletes"] {
  if (!pd) return undefined;
  const ml = new Set(meals.map((x) => x.id));
  const h = new Set(health.map((x) => x.id));
  const next = {
    meals: (pd.meals ?? []).filter((id) => ml.has(id)),
    health: (pd.health ?? []).filter((id) => h.has(id)),
  };
  if (next.meals.length + next.health.length === 0) return undefined;
  return next;
}

export async function storedToMeal(s: MealStored): Promise<Meal> {
  const { photoPath: _p, thumbnailPath: _t, photoBase64, photoMimeType, ...rest } = s;
  const meal: Meal = { ...rest };
  if (photoBase64 && photoMimeType) {
    const blob = base64ToBlob(photoBase64, photoMimeType);
    meal.photo = blob;
    meal.thumbnail = await makeThumbnail(blob);
  }
  return meal;
}

export async function storedToHealth(s: HealthStored): Promise<HealthRecord> {
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

async function pullPrivateSettings(uid: string): Promise<PrivateSettingsDoc | null> {
  const fs = getFirestoreDb();
  const d = await getDoc(doc(fs, "users", uid, "config", "private"));
  if (!d.exists) return null;
  return d.data() as PrivateSettingsDoc;
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
    { maxDimension: 1600, quality: 0.8 },
    { maxDimension: 1280, quality: 0.72 },
    { maxDimension: 960, quality: 0.64 },
    { maxDimension: 720, quality: 0.55 },
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
    if (keep.has(d.id)) continue;
    // Firestore 클라이언트 SDK 는 부모 doc 만 지우면 서브컬렉션이 고아로 남는다.
    // 식단의 좋아요/댓글도 같이 best-effort 정리(다른 기기에서 삭제된 식단이 동기화될 때).
    await Promise.allSettled([
      deleteSubCollection(collection(d.ref, "likes")),
      deleteSubCollection(collection(d.ref, "comments")),
    ]);
    await deleteDoc(d.ref);
  }
}

async function deleteSubCollection(
  colRef: ReturnType<typeof collection>,
): Promise<void> {
  try {
    const snap = await getDocs(colRef);
    await Promise.allSettled(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.warn("[cloudSync] subcollection cleanup", e);
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
    onboarded: s.onboarded,
    updatedAt,
  };
  // model 은 더 이상 사용하지 않음 — 기존 사용자의 클라우드 잔여 필드를 정리.
  await setDoc(
    doc(fs, "users", uid, "config", "public"),
    { ...cleanForFirestore(docData), model: deleteField() },
  );
}

async function pushPrivateSettings(uid: string, s: AppSettings): Promise<void> {
  const fs = getFirestoreDb();
  const updatedAt = s.geminiSettingsUpdatedAt ?? Date.now();
  const primary = s.geminiApiKey?.trim();
  // geminiApiKeyBackup 은 더 이상 사용하지 않음 — 기존 사용자의 클라우드 잔여 필드를 정리.
  await setDoc(doc(fs, "users", uid, "config", "private"), {
    updatedAt,
    geminiApiKey: primary ? primary : deleteField(),
    geminiApiKeyBackup: deleteField(),
  });
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

let cloudSyncMutationDepth = 0;

/** 동기화 트랜잭션이 로컬 DB를 쓰는 동안 true — 자동 동기화 재호출 방지 */
export function isCloudSyncMutation(): boolean {
  return cloudSyncMutationDepth > 0;
}

/**
 * 원격과 로컬을 병합한 뒤 양쪽에 반영합니다.
 * Spark(무료) 플랜: Firebase Storage 없이 Firestore 문서에 압축 JPEG(Base64)만 저장합니다.
 * Gemini 키는 users/{uid}/config/private 에만 저장되며, Firestore 규칙으로 본인만 접근합니다.
 */
export async function syncCloudWithLocal(): Promise<void> {
  cloudSyncMutationDepth++;
  try {
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Google 로그인이 필요합니다.");

    const remoteMembers = await pullMembers(uid);
    const remoteMeals = await pullMealsStored(uid);
    const remoteHealth = await pullHealthStored(uid);
    const remotePublic = await pullPublicSettings(uid);
    const remotePrivate = await pullPrivateSettings(uid);

    const localMembers = await dexieDb.users.toArray();
    const localMeals = await dexieDb.meals.toArray();
    const localHealth = await dexieDb.health.toArray();
    let localSettings = await getSettings();

    const pd = localSettings.cloudPendingDeletes;
    const skipMeals = new Set(pd?.meals ?? []);
    const skipHealth = new Set(pd?.health ?? []);
    const remoteMealsFiltered = remoteMeals.filter((m) => !skipMeals.has(m.id));
    const remoteHealthFiltered = remoteHealth.filter((h) => !skipHealth.has(h.id));

    const mergedMembers = mergeUsers(localMembers, remoteMembers);
    const mergedMeals = await mergeMeals(localMeals, remoteMealsFiltered);
    const mergedHealth = await mergeHealth(localHealth, remoteHealthFiltered);

    if (remotePublic && remotePublic.updatedAt > (localSettings.appSettingsUpdatedAt ?? 0)) {
      localSettings = {
        ...localSettings,
        activeUserId: remotePublic.activeUserId,
        onboarded: remotePublic.onboarded,
        appSettingsUpdatedAt: remotePublic.updatedAt,
        id: SETTINGS_KEY,
      };
    }

    if (remotePrivate && remotePrivate.updatedAt > (localSettings.geminiSettingsUpdatedAt ?? 0)) {
      localSettings = {
        ...localSettings,
        geminiApiKey: remotePrivate.geminiApiKey || undefined,
        geminiSettingsUpdatedAt: remotePrivate.updatedAt,
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
        cloudPendingDeletes: prunePendingDeletes(
          localSettings.cloudPendingDeletes,
          mergedMeals,
          mergedHealth,
        ),
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
    await pushPrivateSettings(uid, latestLocal);
  } finally {
    cloudSyncMutationDepth--;
  }
}
