import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, Check, HeartPulse, Loader2, LogIn, UserPlus, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { getFirestoreDb } from "../lib/firebaseApp";
import {
  acceptFollowRequest,
  normalizeEmail,
  rejectFollowRequest,
} from "../lib/friends";
import type { FollowRequest, ShareScope } from "../types";
import { cls } from "../lib/utils";

export default function InvitePage() {
  const { reqId = "" } = useParams();
  const navigate = useNavigate();
  const { user, firebaseReady, signInWithGoogle, signInBusy, signInError } = useAuth();

  const [req, setReq] = useState<FollowRequest | null | "missing">(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // 기본은 "요청대로". 토글로 직접 선택할 수 있도록.
  const [mode, setMode] = useState<"asis" | "custom">("asis");
  const [custom, setCustom] = useState<ShareScope>({ calendar: true, health: true });
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  useEffect(() => {
    if (!firebaseReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const fs = getFirestoreDb();
        const snap = await getDoc(doc(fs, "followRequests", reqId));
        if (cancelled) return;
        if (!snap.exists()) {
          setReq("missing");
        } else {
          const data = { ...(snap.data() as FollowRequest), id: snap.id };
          setReq(data);
          setCustom(data.requestedScope);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : String(e));
          setReq("missing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, user?.uid, reqId]);

  if (!firebaseReady) {
    return <Shell>Firebase 연동이 설정되지 않았어요.</Shell>;
  }

  if (!user) {
    return (
      <Shell>
        <h2 className="text-base font-semibold text-slate-100">
          <UserPlus size={16} className="mb-0.5 mr-1 inline text-brand-400" />
          팔로우 신청
        </h2>
        <p className="text-sm text-slate-300">
          신청을 수락하려면 받으신 이메일과 같은 Google 계정으로 로그인해 주세요.
        </p>
        <button
          type="button"
          disabled={signInBusy}
          onClick={() => void signInWithGoogle()}
          className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-60"
        >
          {signInBusy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          {signInBusy ? "로그인 중…" : "Google로 로그인"}
        </button>
        {signInError && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {signInError}
          </p>
        )}
      </Shell>
    );
  }

  if (req === null) {
    return (
      <Shell>
        <p className="text-sm text-slate-400">
          <Loader2 size={14} className="mr-1 inline animate-spin" /> 신청 내용을 불러오는 중…
        </p>
      </Shell>
    );
  }

  if (req === "missing") {
    return (
      <Shell>
        <p className="text-sm text-slate-300">
          신청이 존재하지 않거나, 이미 처리되었어요. 상대에게 다시 신청을 요청해 주세요.
        </p>
        {loadErr && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            {loadErr}
          </p>
        )}
        <button
          onClick={() => navigate("/friends")}
          className="btn-secondary w-full py-2 text-sm"
        >
          친구 탭으로
        </button>
      </Shell>
    );
  }

  const myEmail = normalizeEmail(user.email ?? "");
  const emailMatches = myEmail === req.toEmail;

  if (req.status !== "pending") {
    return (
      <Shell>
        <p className="text-sm text-slate-300">
          이미 처리된 신청이에요 (상태: {req.status}).
        </p>
        <button
          onClick={() => navigate("/friends")}
          className="btn-secondary w-full py-2 text-sm"
        >
          친구 탭으로
        </button>
      </Shell>
    );
  }

  if (!emailMatches) {
    return (
      <Shell>
        <p className="text-sm text-slate-300">
          이 신청은 <span className="font-medium text-slate-100">{req.toEmail}</span> 주소로 왔지만,
          현재 로그인한 계정은{" "}
          <span className="font-medium text-slate-100">{myEmail || "(이메일 없음)"}</span>
          에요.
        </p>
        <p className="text-xs text-slate-400">
          신청을 받은 Google 계정으로 다시 로그인한 뒤 이 링크를 열어 주세요.
        </p>
      </Shell>
    );
  }

  if (done === "accepted") {
    return (
      <Shell>
        <p className="text-sm text-emerald-200">
          수락했어요. 이제 {req.fromName}님이 내 기록을 볼 수 있어요.
        </p>
        <Link to="/friends" className="btn-primary block w-full py-2 text-center text-sm">
          친구 탭으로
        </Link>
      </Shell>
    );
  }

  if (done === "rejected") {
    return (
      <Shell>
        <p className="text-sm text-slate-300">신청을 거절했어요.</p>
        <button
          onClick={() => navigate("/friends")}
          className="btn-secondary w-full py-2 text-sm"
        >
          친구 탭으로
        </button>
      </Shell>
    );
  }

  const finalScope = mode === "asis" ? req.requestedScope : custom;

  async function onAccept() {
    if (!req || req === "missing") return;
    setActionErr(null);
    setBusy("accept");
    try {
      await acceptFollowRequest(req.id, finalScope);
      setDone("accepted");
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function onReject() {
    if (!req || req === "missing") return;
    setActionErr(null);
    setBusy("reject");
    try {
      await rejectFollowRequest(req.id);
      setDone("rejected");
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell>
      <h2 className="text-base font-semibold text-slate-100">
        <UserPlus size={16} className="mb-0.5 mr-1 inline text-brand-400" />
        팔로우 신청
      </h2>
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <Avatar name={req.fromName} photoURL={req.fromPhotoURL} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">{req.fromName}</p>
          <p className="truncate text-xs text-slate-500">{req.fromEmail}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <p className="text-[11px] text-slate-400">상대가 보고 싶은 범위</p>
        <p className="mt-0.5 text-xs font-medium text-slate-100">
          {scopeText(req.requestedScope)}
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-900/40 p-1 text-[11px]">
        <ModeBtn active={mode === "asis"} onClick={() => setMode("asis")}>
          요청대로 공개
        </ModeBtn>
        <ModeBtn active={mode === "custom"} onClick={() => setMode("custom")}>
          직접 선택
        </ModeBtn>
      </div>

      {mode === "custom" && (
        <div>
          <p className="mb-2 text-[11px] text-slate-400">내가 공개할 범위</p>
          <div className="grid grid-cols-2 gap-2">
            <ScopeBtn
              label="달력 (식사)"
              icon={<CalendarDays size={14} />}
              checked={custom.calendar}
              onChange={(b) => setCustom({ ...custom, calendar: b })}
            />
            <ScopeBtn
              label="건강"
              icon={<HeartPulse size={14} />}
              checked={custom.health}
              onChange={(b) => setCustom({ ...custom, health: b })}
            />
          </div>
        </div>
      )}

      {actionErr && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {actionErr}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onReject}
          disabled={busy !== null}
          className="btn-secondary flex-1 py-2 text-xs text-rose-300 disabled:opacity-60"
        >
          {busy === "reject" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          거절
        </button>
        <button
          onClick={onAccept}
          disabled={busy !== null || (!finalScope.calendar && !finalScope.health)}
          className="btn-primary flex-1 py-2 text-xs disabled:opacity-60"
        >
          {busy === "accept" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          수락
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <header>
        <Link to="/friends" className="text-xs text-slate-400">
          ← 친구 탭
        </Link>
      </header>
      <section className="card space-y-3 p-4">{children}</section>
    </div>
  );
}

function ModeBtn({
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
        "flex-1 rounded-md px-2 py-1.5 transition-colors",
        active
          ? "bg-brand-500/20 text-brand-100"
          : "text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function ScopeBtn({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cls(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        checked
          ? "border-brand-500/60 bg-brand-500/15 text-brand-100"
          : "border-slate-800 bg-slate-900/40 text-slate-300",
      )}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-brand-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {icon}
      <span>{label}</span>
    </label>
  );
}

function Avatar({ name, photoURL }: { name: string; photoURL?: string }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-slate-800 object-cover"
      />
    );
  }
  const initial = name ? Array.from(name)[0]?.toUpperCase() ?? "?" : "?";
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-sm font-semibold text-slate-200">
      {initial}
    </div>
  );
}

function scopeText(s: ShareScope): string {
  const parts: string[] = [];
  if (s.calendar) parts.push("달력");
  if (s.health) parts.push("건강");
  return parts.length ? parts.join(", ") : "없음";
}
