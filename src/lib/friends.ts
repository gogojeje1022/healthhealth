import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";
import type {
  Friendship,
  FriendRequest,
  HealthRecord,
  Meal,
  PublicProfile,
  ShareScope,
} from "../types";
import { getFirebaseAuth, getFirestoreDb } from "./firebaseApp";
import {
  storedToHealth,
  storedToMeal,
  type HealthStored,
  type MealStored,
} from "./cloudSync";

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function friendshipIdFor(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function requireUser(): FirebaseUser {
  const auth = getFirebaseAuth();
  const u = auth.currentUser;
  if (!u) throw new Error("Google 로그인이 필요합니다.");
  return u;
}

function requireEmail(u: FirebaseUser): string {
  const e = u.email;
  if (!e) throw new Error("Google 계정에 이메일이 없습니다.");
  return normalizeEmail(e);
}

/** 로그인한 사용자의 공개 프로필을 Firestore 에 upsert (친구가 이름·이메일을 볼 수 있도록) */
export async function upsertMyPublicProfile(u: FirebaseUser): Promise<void> {
  const fs = getFirestoreDb();
  const email = requireEmail(u);
  const data: PublicProfile = {
    uid: u.uid,
    email,
    displayName: u.displayName ?? email,
    photoURL: u.photoURL ?? undefined,
    updatedAt: Date.now(),
  };
  const clean: Record<string, unknown> = { ...data };
  if (clean.photoURL === undefined) delete clean.photoURL;
  await setDoc(doc(fs, "publicProfiles", u.uid), clean, { merge: true });
}

export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  const fs = getFirestoreDb();
  const snap = await getDoc(doc(fs, "publicProfiles", uid));
  if (!snap.exists()) return null;
  return snap.data() as PublicProfile;
}

// ---- 친구 신청 ----------------------------------------------------------

export async function sendFriendRequest(
  toEmailRaw: string,
  scope: ShareScope,
): Promise<FriendRequest> {
  const me = requireUser();
  const myEmail = requireEmail(me);
  const toEmail = normalizeEmail(toEmailRaw);
  if (!toEmail) throw new Error("이메일을 입력해 주세요.");
  if (toEmail === myEmail) throw new Error("본인에게는 신청할 수 없어요.");
  if (!scope.calendar && !scope.health)
    throw new Error("공유할 범위를 하나 이상 선택해 주세요.");

  const fs = getFirestoreDb();

  // 같은 대상에게 pending 신청이 이미 있으면 재사용
  const existingSnap = await getDocs(
    query(
      collection(fs, "friendRequests"),
      where("fromUid", "==", me.uid),
      where("toEmail", "==", toEmail),
      where("status", "==", "pending"),
    ),
  );
  if (!existingSnap.empty) {
    const d = existingSnap.docs[0];
    return { ...(d.data() as FriendRequest), id: d.id };
  }

  const id = doc(collection(fs, "friendRequests")).id;
  const now = Date.now();
  const data: FriendRequest = {
    id,
    fromUid: me.uid,
    fromEmail: myEmail,
    fromName: me.displayName ?? myEmail,
    fromPhotoURL: me.photoURL ?? undefined,
    toEmail,
    scopeFromRequester: scope,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const clean: Record<string, unknown> = { ...data };
  if (clean.fromPhotoURL === undefined) delete clean.fromPhotoURL;
  await setDoc(doc(fs, "friendRequests", id), clean);
  return data;
}

export async function cancelRequest(reqId: string): Promise<void> {
  const fs = getFirestoreDb();
  await deleteDoc(doc(fs, "friendRequests", reqId));
}

export async function rejectRequest(reqId: string): Promise<void> {
  const fs = getFirestoreDb();
  await updateDoc(doc(fs, "friendRequests", reqId), {
    status: "rejected",
    updatedAt: Date.now(),
  });
}

/** 수락 — 요청 상태 변경 + friendships 문서 생성 (batch) */
export async function acceptRequest(
  reqId: string,
  myShareToRequester: ShareScope,
): Promise<Friendship> {
  const me = requireUser();
  const myEmail = requireEmail(me);
  const fs = getFirestoreDb();

  const reqRef = doc(fs, "friendRequests", reqId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error("이미 사라진 친구신청이에요.");
  const req = reqSnap.data() as FriendRequest;
  if (req.toEmail !== myEmail) throw new Error("내 계정으로 온 신청이 아니에요.");
  if (req.status !== "pending") throw new Error("이미 처리된 신청이에요.");
  if (req.fromUid === me.uid) throw new Error("본인 신청은 수락할 수 없어요.");

  const fid = friendshipIdFor(me.uid, req.fromUid);
  const users = me.uid < req.fromUid ? [me.uid, req.fromUid] : [req.fromUid, me.uid];
  const now = Date.now();
  const friendship: Friendship = {
    id: fid,
    users: users as [string, string],
    shares: {
      [req.fromUid]: req.scopeFromRequester,
      [me.uid]: myShareToRequester,
    },
    emails: {
      [req.fromUid]: req.fromEmail,
      [me.uid]: myEmail,
    },
    names: {
      [req.fromUid]: req.fromName,
      [me.uid]: me.displayName ?? myEmail,
    },
    photos: {},
    createdAt: now,
    updatedAt: now,
  };
  if (req.fromPhotoURL) friendship.photos![req.fromUid] = req.fromPhotoURL;
  if (me.photoURL) friendship.photos![me.uid] = me.photoURL;
  if (friendship.photos && Object.keys(friendship.photos).length === 0) {
    delete friendship.photos;
  }

  const batch = writeBatch(fs);
  batch.update(reqRef, {
    status: "accepted",
    toUid: me.uid,
    updatedAt: now,
  });
  batch.set(doc(fs, "friendships", fid), friendship);
  await batch.commit();

  return friendship;
}

// ---- 실시간 구독 ---------------------------------------------------------

function subscribeRequests(
  cons: QueryConstraint[],
  cb: (rows: FriendRequest[]) => void,
): Unsubscribe {
  const fs = getFirestoreDb();
  const q = query(collection(fs, "friendRequests"), ...cons);
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ ...(d.data() as FriendRequest), id: d.id }))
        .sort((a, b) => b.createdAt - a.createdAt);
      cb(rows);
    },
    (err) => {
      console.error("[friends] requests subscribe", err);
    },
  );
}

export function subscribeIncomingRequests(
  cb: (rows: FriendRequest[]) => void,
): Unsubscribe {
  const u = requireUser();
  const email = requireEmail(u);
  return subscribeRequests(
    [where("toEmail", "==", email), where("status", "==", "pending")],
    cb,
  );
}

export function subscribeOutgoingRequests(
  cb: (rows: FriendRequest[]) => void,
): Unsubscribe {
  const u = requireUser();
  return subscribeRequests(
    [where("fromUid", "==", u.uid), where("status", "==", "pending")],
    cb,
  );
}

export function subscribeFriendships(
  cb: (rows: Friendship[]) => void,
): Unsubscribe {
  const u = requireUser();
  const fs = getFirestoreDb();
  const q = query(
    collection(fs, "friendships"),
    where("users", "array-contains", u.uid),
    orderBy("updatedAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data() as Friendship);
      cb(rows);
    },
    (err) => {
      console.error("[friends] friendships subscribe", err);
    },
  );
}

// ---- 친구 관계 변경 ------------------------------------------------------

export async function updateMyShare(
  friendshipDocId: string,
  newScope: ShareScope,
): Promise<void> {
  const u = requireUser();
  const fs = getFirestoreDb();
  await updateDoc(doc(fs, "friendships", friendshipDocId), {
    [`shares.${u.uid}`]: newScope,
    updatedAt: Date.now(),
  });
}

export async function removeFriendship(friendshipDocId: string): Promise<void> {
  const fs = getFirestoreDb();
  await deleteDoc(doc(fs, "friendships", friendshipDocId));
}

// ---- 친구 데이터 읽기 (로컬 캐시 없음) -----------------------------------

/** 친구의 특정 날짜 구간 식사 기록. 월 단위 등으로 호출하는 것을 권장. */
export async function pullFriendMealsInRange(
  ownerUid: string,
  startDateKey: string,
  endDateKey: string,
): Promise<Meal[]> {
  const fs = getFirestoreDb();
  const q = query(
    collection(fs, "users", ownerUid, "meals"),
    where("date", ">=", startDateKey),
    where("date", "<=", endDateKey),
  );
  const snap = await getDocs(q);
  const rows = await Promise.all(
    snap.docs.map(async (d) =>
      storedToMeal({ ...(d.data() as MealStored), id: d.id }),
    ),
  );
  return rows;
}

export async function pullFriendMealsForDate(
  ownerUid: string,
  dateKey: string,
): Promise<Meal[]> {
  return pullFriendMealsInRange(ownerUid, dateKey, dateKey);
}

export async function pullFriendHealth(
  ownerUid: string,
): Promise<HealthRecord[]> {
  const fs = getFirestoreDb();
  const snap = await getDocs(collection(fs, "users", ownerUid, "health"));
  const rows = await Promise.all(
    snap.docs.map(async (d) =>
      storedToHealth({ ...(d.data() as HealthStored), id: d.id }),
    ),
  );
  rows.sort((a, b) => {
    const d = b.recordDate.localeCompare(a.recordDate);
    if (d !== 0) return d;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
  return rows;
}

// ---- 편의 함수 ----------------------------------------------------------

export function otherUidOf(f: Friendship, myUid: string): string {
  return f.users[0] === myUid ? f.users[1] : f.users[0];
}

export function permissionDeniedMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  const msg = e instanceof Error ? e.message : String(e);
  if (code === "permission-denied" || /insufficient permissions/i.test(msg)) {
    return "공유가 해제되었거나 권한이 없어요.";
  }
  return msg;
}
