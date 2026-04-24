import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { ArrowLeft, CalendarDays, HeartPulse, Loader2, Users } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import Calendar, { type DayCount } from "../components/Calendar";
import HealthScoreRing from "../components/HealthScoreRing";
import HealthRecordCard from "../components/HealthRecordCard";
import {
  friendshipIdFor,
  permissionDeniedMessage,
  pullFriendHealth,
  pullFriendMealsInRange,
} from "../lib/friends";
import { getFirestoreDb } from "../lib/firebaseApp";
import { doc, getDoc } from "firebase/firestore";
import { HEALTH_TYPE_LABELS, type Friendship, type HealthRecord } from "../types";
import { cls, dateKey, formatKoDate } from "../lib/utils";

type Tab = "calendar" | "health";

export default function FriendProfilePage() {
  const { uid: friendUid = "" } = useParams();
  const navigate = useNavigate();
  const { user, firebaseReady } = useAuth();
  const [friendship, setFriendship] = useState<Friendship | null | "missing">(null);
  const [tab, setTab] = useState<Tab>("calendar");

  useEffect(() => {
    if (!user || !friendUid) return;
    let cancelled = false;
    (async () => {
      try {
        const fs = getFirestoreDb();
        const fid = friendshipIdFor(user.uid, friendUid);
        const snap = await getDoc(doc(fs, "friendships", fid));
        if (cancelled) return;
        if (!snap.exists()) {
          setFriendship("missing");
        } else {
          setFriendship(snap.data() as Friendship);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[friend profile] friendship fetch", e);
          setFriendship("missing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, friendUid]);

  if (!firebaseReady) return <Shell>Firebase 연동이 필요해요.</Shell>;
  if (!user) return <Shell>로그인이 필요해요.</Shell>;
  if (friendship === null) {
    return (
      <Shell>
        <Loader2 size={16} className="mr-1 inline animate-spin" /> 불러오는 중…
      </Shell>
    );
  }
  if (friendship === "missing") {
    return (
      <Shell>
        <p className="mb-2">친구 관계를 찾을 수 없어요. 공유가 해제되었을 수 있어요.</p>
        <button
          onClick={() => navigate("/friends")}
          className="btn-secondary py-2 text-xs"
        >
          친구 목록으로
        </button>
      </Shell>
    );
  }

  const theirShare = friendship.shares[friendUid] ?? { calendar: false, health: false };
  const name = friendship.names[friendUid] ?? "친구";
  const email = friendship.emails[friendUid] ?? "";

  const canCalendar = theirShare.calendar;
  const canHealth = theirShare.health;
  const defaultTab: Tab = canCalendar ? "calendar" : canHealth ? "health" : "calendar";

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <header className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 hover:bg-slate-800"
          aria-label="뒤로"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">
            <Users size={12} className="mb-0.5 mr-0.5 inline" /> 친구 프로필
          </p>
          <h1 className="truncate text-lg font-bold">{name}</h1>
          <p className="truncate text-[11px] text-slate-500">{email}</p>
        </div>
      </header>

      {!canCalendar && !canHealth ? (
        <div className="card p-4 text-center text-sm text-slate-400">
          이 친구가 공개한 범위가 없어요.
        </div>
      ) : (
        <>
          <div className="flex gap-1 rounded-xl bg-slate-900/60 p-1">
            {canCalendar && (
              <TabBtn
                active={(tab ?? defaultTab) === "calendar"}
                onClick={() => setTab("calendar")}
              >
                <CalendarDays size={14} /> 달력
              </TabBtn>
            )}
            {canHealth && (
              <TabBtn active={tab === "health"} onClick={() => setTab("health")}>
                <HeartPulse size={14} /> 건강
              </TabBtn>
            )}
          </div>

          {tab === "calendar" && canCalendar && (
            <FriendCalendarTab friendUid={friendUid} />
          )}
          {tab === "health" && canHealth && (
            <FriendHealthTab friendUid={friendUid} />
          )}
          {tab === "calendar" && !canCalendar && canHealth && (
            <FriendHealthTab friendUid={friendUid} />
          )}
        </>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-5">
      <header>
        <Link to="/friends" className="text-xs text-slate-400">
          ← 친구 목록
        </Link>
      </header>
      <div className="card p-4 text-sm text-slate-400">{children}</div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cls(
        "flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "bg-brand-500/20 text-brand-200"
          : "text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

// ---- 달력 탭 -------------------------------------------------------------

function FriendCalendarTab({ friendUid }: { friendUid: string }) {
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selected, setSelected] = useState<string>(dateKey());
  const [counts, setCounts] = useState<Map<string, DayCount> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  const { startKey, endKey } = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return { startKey: dateKey(start), endKey: dateKey(end) };
  }, [cursor]);

  useEffect(() => {
    let cancelled = false;
    setCounts(null);
    setErr(null);
    pullFriendMealsInRange(friendUid, startKey, endKey)
      .then((meals) => {
        if (cancelled) return;
        const map = new Map<string, DayCount>();
        for (const m of meals) {
          const cur = map.get(m.date) ?? { total: 0, ratings: [] };
          cur.total += 1;
          if (typeof m.rating === "number") cur.ratings.push(m.rating);
          map.set(m.date, cur);
        }
        setCounts(map);
      })
      .catch((e) => {
        if (!cancelled) setErr(permissionDeniedMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [friendUid, startKey, endKey]);

  return (
    <>
      {err && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {err}
        </p>
      )}
      <Calendar
        cursor={cursor}
        setCursor={setCursor}
        selected={selected}
        onPick={(k) => {
          setSelected(k);
          navigate(`/friends/${friendUid}/day/${k}`);
        }}
        externalCounts={counts}
      />
      <div className="card p-4 text-center text-xs text-slate-500">
        날짜를 탭하면 그 날의 식사 기록을 볼 수 있어요.
        <br />
        <span className="text-slate-400">{formatKoDate(selected)}</span>
      </div>
    </>
  );
}

// ---- 건강 탭 -------------------------------------------------------------

function FriendHealthTab({ friendUid }: { friendUid: string }) {
  const [rows, setRows] = useState<HealthRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setErr(null);
    pullFriendHealth(friendUid)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setErr(permissionDeniedMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [friendUid]);

  const latest = rows?.[0];

  if (err) {
    return (
      <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
        {err}
      </p>
    );
  }

  return (
    <>
      <section className="card flex items-center gap-4 p-5">
        <HealthScoreRing score={latest?.healthScore} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">최근 건강 평가</p>
          <h2 className="mt-0.5 break-words text-base font-semibold leading-snug text-slate-100">
            {latest?.summary ?? "아직 등록된 건강기록이 없어요."}
          </h2>
          {latest && (
            <p className="mt-1 text-xs text-slate-500">
              {HEALTH_TYPE_LABELS[latest.type]} · {formatKoDate(latest.recordDate)}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        {rows === null && (
          <p className="card p-4 text-center text-xs text-slate-500">불러오는 중…</p>
        )}
        {rows?.length === 0 && (
          <p className="card p-4 text-center text-xs text-slate-500">
            등록된 건강기록이 없어요.
          </p>
        )}
        {rows?.map((r) => (
          <HealthRecordCard key={r.id} record={r} readOnly />
        ))}
      </section>
    </>
  );
}

