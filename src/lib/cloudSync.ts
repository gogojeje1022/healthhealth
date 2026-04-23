import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import type { AppSettings, HealthRecord, Meal, User } from "../types";
import { db as dexieDb, getSettings, SETTINGS_KEY } from "./db";
import { getFirestoreDb, getFirebaseAuth, getStorageBucket } from "./firebaseApp";

const BATCH = 400;

export type MealStored = Omit<Meal, "photo" | "thumbnail"> & {
  photoPath?: string;
  thumbnailPath?: string;
};

export type HealthStored = Omit<HealthRecord, "photo" | "thumbnail"> & {
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

async function downloadBlob(st: FirebaseStorage, path: string): Promise<Blob> {
  const bytes = await getBytes(ref(st, path));
  return new Blob([bytes], { type: "image/jpeg" });
}

async function storedToMeal(st: FirebaseStorage, s: MealStored): Promise<Meal> {
  const { photoPath, thumbnailPath, ...rest } = s;
  const meal: Meal = { ...rest };
  if (photoPath) meal.photo = await downloadBlob(st, photoPath);
  if (thumbnailPath) meal.thumbnail = await downloadBlob(st, thumbnailPath);
  return meal;
}

async function storedToHealth(st: FirebaseStorage, s: HealthStored): Promise<HealthRecord> {
  const { photoPath, thumbnailPath, ...rest } = s;
  const rec: HealthRecord = { ...rest };
  if (photoPath) rec.photo = await downloadBlob(st, photoPath);
  if (thumbnailPath) rec.thumbnail = await downloadBlob(st, thumbnailPath);
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

async function mergeMeals(
  st: FirebaseStorage,
  local: Meal[],
  remote: MealStored[],
): Promise<Meal[]> {
  const rMap = new Map(remote.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = new Set([...lMap.keys(), ...rMap.keys()]);
  const out: Meal[] = [];
  for (const id of ids) {
    const l = lMap.get(id);
    const r = rMap.get(id);
    if (!l) out.push(await storedToMeal(st, r!));
    else if (!r) out.push(l);
    else if (l.updatedAt >= r.updatedAt) out.push(l);
    else out.push(await storedToMeal(st, r));
  }
  return out;
}

async function mergeHealth(
  st: FirebaseStorage,
  local: HealthRecord[],
  remote: HealthStored[],
): Promise<HealthRecord[]> {
  const rMap = new Map(remote.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = new Set([...lMap.keys(), ...rMap.keys()]);
  const out: HealthRecord[] = [];
  for (const id of ids) {
    const l = lMap.get(id);
    const r = rMap.get(id);
    if (!l) out.push(await storedToHealth(st, r!));
    else if (!r) out.push(l);
    else if (l.updatedAt >= r.updatedAt) out.push(l);
    else out.push(await storedToHealth(st, r));
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

async function deleteObjectSafe(path: string): Promise<void> {
  try {
    await deleteObject(ref(getStorageBucket(), path));
  } catch {
    /* 없음 */
  }
}

async function removeMealStorage(uid: string, mealId: string): Promise<void> {
  await deleteObjectSafe(`users/${uid}/meals/${mealId}/photo.jpg`);
  await deleteObjectSafe(`users/${uid}/meals/${mealId}/thumb.jpg`);
}

async function removeHealthStorage(uid: string, hid: string): Promise<void> {
  await deleteObjectSafe(`users/${uid}/health/${hid}/photo.jpg`);
  await deleteObjectSafe(`users/${uid}/health/${hid}/thumb.jpg`);
}

async function mealToStored(uid: string, st: FirebaseStorage, m: Meal): Promise<MealStored> {
  const { photo, thumbnail, ...rest } = m;
  const base: MealStored = { ...rest };
  if (photo && photo.size > 0) {
    const p = `users/${uid}/meals/${m.id}/photo.jpg`;
    await uploadBytes(ref(st, p), photo, { contentType: photo.type || "image/jpeg" });
    base.photoPath = p;
  } else {
    await removeMealStorage(uid, m.id);
  }
  if (thumbnail && thumbnail.size > 0) {
    const p = `users/${uid}/meals/${m.id}/thumb.jpg`;
    await uploadBytes(ref(st, p), thumbnail, { contentType: thumbnail.type || "image/jpeg" });
    base.thumbnailPath = p;
  }
  return base;
}

async function healthToStored(
  uid: string,
  st: FirebaseStorage,
  h: HealthRecord,
): Promise<HealthStored> {
  const { photo, thumbnail, ...rest } = h;
  const base: HealthStored = { ...rest };
  if (photo && photo.size > 0) {
    const p = `users/${uid}/health/${h.id}/photo.jpg`;
    await uploadBytes(ref(st, p), photo, { contentType: photo.type || "image/jpeg" });
    base.photoPath = p;
  } else {
    await removeHealthStorage(uid, h.id);
  }
  if (thumbnail && thumbnail.size > 0) {
    const p = `users/${uid}/health/${h.id}/thumb.jpg`;
    await uploadBytes(ref(st, p), thumbnail, { contentType: thumbnail.type || "image/jpeg" });
    base.thumbnailPath = p;
  }
  return base;
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
    if (!keep.has(d.id)) {
      const data = d.data() as MealStored;
      if (data.photoPath) await deleteObjectSafe(data.photoPath);
      if (data.thumbnailPath) await deleteObjectSafe(data.thumbnailPath);
      else await removeMealStorage(uid, d.id);
      await deleteDoc(d.ref);
    }
  }
}

async function deleteRemoteHealthNotIn(uid: string, keep: Set<string>): Promise<void> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", uid, "health"));
  for (const d of snap.docs) {
    if (!keep.has(d.id)) {
      const data = d.data() as HealthStored;
      if (data.photoPath) await deleteObjectSafe(data.photoPath);
      if (data.thumbnailPath) await deleteObjectSafe(data.thumbnailPath);
      else await removeHealthStorage(uid, d.id);
      await deleteDoc(d.ref);
    }
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
  const st = getStorageBucket();
  let batch = writeBatch(fs);
  let n = 0;
  for (const m of meals) {
    const stored = await mealToStored(uid, st, m);
    batch.set(doc(fs, "users", uid, "meals", m.id), cleanForFirestore(stored));
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
  const st = getStorageBucket();
  let batch = writeBatch(fs);
  let n = 0;
  for (const h of rows) {
    const stored = await healthToStored(uid, st, h);
    batch.set(doc(fs, "users", uid, "health", h.id), cleanForFirestore(stored));
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

/** 원격과 로컬을 병합한 뒤 양쪽에 반영합니다. Gemini 키는 클라우드에 올리지 않습니다. */
export async function syncCloudWithLocal(): Promise<void> {
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Google 로그인이 필요합니다.");

  const st = getStorageBucket();

  const remoteMembers = await pullMembers(uid);
  const remoteMeals = await pullMealsStored(uid);
  const remoteHealth = await pullHealthStored(uid);
  const remotePublic = await pullPublicSettings(uid);

  const localMembers = await dexieDb.users.toArray();
  const localMeals = await dexieDb.meals.toArray();
  const localHealth = await dexieDb.health.toArray();
  let localSettings = await getSettings();

  const mergedMembers = mergeUsers(localMembers, remoteMembers);
  const mergedMeals = await mergeMeals(st, localMeals, remoteMeals);
  const mergedHealth = await mergeHealth(st, localHealth, remoteHealth);

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
