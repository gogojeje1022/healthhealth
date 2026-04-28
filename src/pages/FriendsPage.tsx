import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Eye,
  HeartPulse,
  Link2,
  Loader2,
  Mail,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  acceptFollowRequest,
  cancelFollowRequest,
  rejectFollowRequest,
  removeShare,
  sendFollowRequest,
  subscribeIncomingRequests,
  subscribeIncomingShares,
  subscribeOutgoingRequests,
  subscribeOutgoingShares,
  updateOutgoingScope,
} from "../lib/friends";
import type { FollowRequest, Share, ShareScope } from "../types";
import FirebaseLoginCard from "../components/FirebaseLoginCard";
import { cls } from "../lib/utils";

type Tab = "friends" | "incoming" | "outgoing";

export default function FriendsPage() {
  const { user, firebaseReady } = useAuth();
  const [tab, setTab] = useState<Tab>("friends");
  const [outShares, setOutShares] = useState<Share[] | null>(null);
  const [inShares, setInShares] = useState<Share[] | null>(null);
  const [incoming, setIncoming] = useState<FollowRequest[] | null>(null);
  const [outgoing, setOutgoing] = useState<FollowRequest[] | null>(null);
  const [errF, setErrF] = useState<string | null>(null);
  const [errI, setErrI] = useState<string | null>(null);
  const [errO, setErrO] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setOutShares(null);
      setInShares(null);
      setIncoming(null);
      setOutgoing(null);
      setErrF(null);
      setErrI(null);
      setErrO(null);
      return;
    }
    const toMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
    const unsubOut = subscribeOutgoingShares(
      (rows) => {
        setErrF(null);
        setOutShares(rows);
      },
      (e) => setErrF(toMsg(e)),
    );
    const unsubIn = subscribeIncomingShares(
      (rows) => setInShares(rows),
      (e) => setErrF(toMsg(e)),
    );
    const unsubI = subscribeIncomingRequests(
      (rows) => {
        setErrI(null);
        setIncoming(rows);
      },
      (e) => setErrI(toMsg(e)),
    );
    const unsubO = subscribeOutgoingRequests(
      (rows) => {
        setErrO(null);
        setOutgoing(rows);
      },
      (e) => setErrO(toMsg(e)),
    );
    return () => {
      unsubOut();
      unsubIn();
      unsubI();
      unsubO();
    };
  }, [user?.uid]);

  const friendCount =
    outShares && inShares ? new Set([...outShares.map((s) => s.ownerUid), ...inShares.map((s) => s.viewerUid)]).size : 0;

  if (!firebaseReady) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-5">
        <Header />
        <div className="card border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
          친구 기능은 Firebase 연동이 필요해요. 환경변수(VITE_FIREBASE_*)를 설정해 주세요.
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-5">
        <Header />
        <FirebaseLoginCard />
        <div className="card border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
          친구와 기록을 공유하려면 Google 계정으로 로그인해 주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-5">
      <Header />

      <div className="flex gap-1 rounded-xl bg-slate-900/60 p-1">
        <TabButton active={tab === "friends"} onClick={() => setTab("friends")}>
          친구 {friendCount ? `(${friendCount})` : ""}
        </TabButton>
        <TabButton active={tab === "incoming"} onClick={() => setTab("incoming")}>
          받은 신청 {incoming?.length ? `(${incoming.length})` : ""}
        </TabButton>
        <TabButton active={tab === "outgoing"} onClick={() => setTab("outgoing")}>
          보낸 신청 {outgoing?.length ? `(${outgoing.length})` : ""}
        </TabButton>
      </div>

      {tab === "friends" && (
        <FriendsTab
          outShares={outShares}
          inShares={inShares}
          myUid={user.uid}
          error={errF}
        />
      )}
      {tab === "incoming" && <IncomingTab requests={incoming} error={errI} />}
      {tab === "outgoing" && <OutgoingTab requests={outgoing} error={errO} />}
    </div>
  );
}

function Header() {
  return (
    <header>
      <p className="text-xs text-slate-400">공유</p>
      <h1 className="text-xl font-bold">
        <Users size={18} className="mb-0.5 mr-1 inline text-brand-400" />
        친구
      </h1>
    </header>
  );
}

function TabButton({
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
        "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "bg-brand-500/20 text-brand-200"
          : "text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

// ---- 친구 목록 탭 --------------------------------------------------------

interface FriendRow {
  /** 상대 uid */
  otherUid: string;
  name: string;
  email: string;
  photo?: string;
  /** 내가 owner — 내가 상대에게 공개하는 share */
  outgoing?: Share;
  /** 내가 viewer — 상대가 내게 공개하는 share */
  incoming?: Share;
}

function combineRows(outShares: Share[], inShares: Share[]): FriendRow[] {
  const map = new Map<string, FriendRow>();
  for (const s of outShares) {
    const other = s.viewerUid;
    map.set(other, {
      otherUid: other,
      name: s.viewerName,
      email: s.viewerEmail,
      photo: s.viewerPhotoURL,
      outgoing: s,
    });
  }
  for (const s of inShares) {
    const other = s.ownerUid;
    const cur = map.get(other);
    if (cur) {
      cur.incoming = s;
      cur.name = s.ownerName || cur.name;
      cur.email = s.ownerEmail || cur.email;
      cur.photo = s.ownerPhotoURL || cur.photo;
    } else {
      map.set(other, {
        otherUid: other,
        name: s.ownerName,
        email: s.ownerEmail,
        photo: s.ownerPhotoURL,
        incoming: s,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      (b.outgoing?.updatedAt ?? b.incoming?.updatedAt ?? 0) -
      (a.outgoing?.updatedAt ?? a.incoming?.updatedAt ?? 0),
  );
}

function FriendsTab({
  outShares,
  inShares,
  myUid,
  error,
}: {
  outShares: Share[] | null;
  inShares: Share[] | null;
  myUid: string;
  error?: string | null;
}) {
  const rows = useMemo(() => {
    if (!outShares || !inShares) return null;
    return combineRows(outShares, inShares);
  }, [outShares, inShares]);

  return (
    <>
      <SendRequestCard />
      <section className="space-y-3">
        {error && <ErrorBanner message={error} />}
        {!error && rows === null && (
          <p className="card p-4 text-center text-xs text-slate-500">불러오는 중…</p>
        )}
        {rows?.length === 0 && (
          <p className="card p-4 text-center text-xs text-slate-500">
            아직 친구가 없어요. 위에서 이메일로 팔로우 신청을 보내보세요.
          </p>
        )}
        {rows?.map((r) => (
          <FriendCard key={r.otherUid} row={r} myUid={myUid} />
        ))}
      </section>
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="card border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
      <p className="font-semibold">Firestore 에서 데이터를 읽지 못했어요.</p>
      <p className="mt-1 break-all text-[11px] text-rose-200/80">{message}</p>
      <p className="mt-2 text-[11px] text-rose-200/70">
        규칙이 배포되지 않았거나 복합 인덱스가 필요할 수 있어요. 브라우저 콘솔(F12)에서
        상세 오류를 확인해 주세요.
      </p>
    </div>
  );
}

function SendRequestCard() {
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<ShareScope>({ calendar: true, health: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastSentLink, setLastSentLink] = useState<string | null>(null);
  const [lastSentEmail, setLastSentEmail] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const req = await sendFollowRequest(email, scope);
      const link = buildInviteLink(req.id);
      setLastSentLink(link);
      setLastSentEmail(req.toEmail);
      setEmail("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h3 className="text-sm font-semibold text-slate-200">
        <UserPlus size={14} className="mb-0.5 mr-1 inline text-brand-400" />
        이메일로 팔로우 신청
      </h3>
      <p className="text-[11px] text-slate-400">
        상대가 수락하면 그 사람의 기록을 내가 볼 수 있어요. (인스타그램 팔로우와 같은 방식)
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="friend@gmail.com"
        autoComplete="email"
        className="input"
      />
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-400">이 친구의 어떤 기록을 보고 싶나요?</p>
        <ScopeCheckboxes value={scope} onChange={setScope} />
      </div>
      <button
        onClick={submit}
        disabled={busy || !email.trim() || (!scope.calendar && !scope.health)}
        className="btn-primary w-full py-2.5 text-sm disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        팔로우 신청 보내기
      </button>
      {err && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {err}
        </p>
      )}
      {lastSentLink && lastSentEmail && (
        <InviteLinkBlock email={lastSentEmail} link={lastSentLink} />
      )}
    </section>
  );
}

function ScopeCheckboxes({
  value,
  onChange,
}: {
  value: ShareScope;
  onChange: (v: ShareScope) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ScopeCheckbox
        label="달력 (식사)"
        icon={<CalendarDays size={14} />}
        checked={value.calendar}
        onChange={(b) => onChange({ ...value, calendar: b })}
      />
      <ScopeCheckbox
        label="건강"
        icon={<HeartPulse size={14} />}
        checked={value.health}
        onChange={(b) => onChange({ ...value, health: b })}
      />
    </div>
  );
}

function ScopeCheckbox({
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

export function buildInviteLink(requestId: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${location.origin}${base}#/friends/invite/${requestId}`;
}

function InviteLinkBlock({ email, link }: { email: string; link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("링크를 복사하세요", link);
    }
  }
  const mailHref = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("헬스헬스 팔로우 신청")}&body=${encodeURIComponent(
    `헬스헬스에서 팔로우 신청을 보냈어요.\n\n이 링크를 열어 수락해 주세요:\n${link}\n`,
  )}`;
  return (
    <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-emerald-100/90">
      <p className="font-medium">팔로우 신청을 보냈어요.</p>
      <p className="break-all rounded-lg bg-slate-900/60 px-2 py-1.5 font-mono text-[11px] text-slate-300">
        {link}
      </p>
      <div className="flex gap-2">
        <button onClick={copy} className="btn-secondary flex-1 py-2 text-xs">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "복사됨" : "링크 복사"}
        </button>
        <a href={mailHref} className="btn-secondary flex-1 py-2 text-xs">
          <Mail size={12} /> 메일로 열기
        </a>
      </div>
      <p className="text-[11px] text-emerald-200/70">
        받는 사람이 같은 Google 계정으로 로그인하면 수락할 수 있어요.
      </p>
    </div>
  );
}

function FriendCard({ row, myUid }: { row: FriendRow; myUid: string }) {
  const { otherUid, name, email, photo, outgoing, incoming } = row;
  const mutual = !!outgoing && !!incoming;
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState<ShareScope>(
    outgoing?.scope ?? { calendar: true, health: true },
  );
  const [busy, setBusy] = useState<"save" | "stopOut" | "stopIn" | "follow" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [followSent, setFollowSent] = useState(false);

  async function save() {
    setErr(null);
    setBusy("save");
    try {
      await updateOutgoingScope(otherUid, next);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function stopOutgoing() {
    if (!outgoing) return;
    if (!confirm(`${name}님에게 내 기록 공개를 중단할까요?`)) return;
    setBusy("stopOut");
    try {
      await removeShare(outgoing.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function stopIncoming() {
    if (!incoming) return;
    if (!confirm(`${name}님에 대한 팔로우를 끊을까요?`)) return;
    setBusy("stopIn");
    try {
      await removeShare(incoming.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function followBack() {
    setErr(null);
    setBusy("follow");
    try {
      await sendFollowRequest(email, { calendar: true, health: true });
      setFollowSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  void myUid;

  return (
    <div className="card overflow-hidden">
      <Link
        to={`/friends/${otherUid}`}
        className="flex items-center gap-3 p-3 hover:bg-slate-900/60"
      >
        <Avatar name={name} photoURL={photo} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-100">{name}</p>
            {mutual ? (
              <span className="shrink-0 rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-200">
                맞팔
              </span>
            ) : incoming ? (
              <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                팔로우 중
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                나를 팔로우
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-500">{email}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <ScopeBadge prefix="내가 공개" scope={outgoing?.scope} tone="brand" />
            <ScopeBadge prefix="내가 보는 범위" scope={incoming?.scope} tone="slate" />
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-slate-500" />
      </Link>
      <div className="space-y-2 border-t border-slate-800 px-3 py-2">
        {err && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">
            {err}
          </p>
        )}
        {editing && outgoing ? (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400">내가 공개할 범위</p>
            <ScopeCheckboxes value={next} onChange={setNext} />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setNext(outgoing.scope);
                }}
                className="btn-secondary flex-1 py-1.5 text-xs"
              >
                취소
              </button>
              <button
                onClick={save}
                disabled={busy !== null || (!next.calendar && !next.health)}
                className="btn-primary flex-1 py-1.5 text-xs"
              >
                {busy === "save" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                저장
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {outgoing && (
              <>
                <button
                  onClick={() => {
                    setNext(outgoing.scope);
                    setEditing(true);
                  }}
                  className="btn-secondary flex-1 py-1.5 text-xs"
                >
                  내 공개 범위 변경
                </button>
                <button
                  onClick={stopOutgoing}
                  disabled={busy !== null}
                  className="btn-secondary flex-1 py-1.5 text-xs text-rose-300 disabled:opacity-60"
                >
                  {busy === "stopOut" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  공개 중단
                </button>
              </>
            )}
            {incoming && (
              <button
                onClick={stopIncoming}
                disabled={busy !== null}
                className="btn-secondary flex-1 py-1.5 text-xs text-rose-300 disabled:opacity-60"
              >
                {busy === "stopIn" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <X size={12} />
                )}
                팔로우 끊기
              </button>
            )}
            {!incoming && !followSent && (
              <button
                onClick={followBack}
                disabled={busy !== null}
                className="btn-primary flex-1 py-1.5 text-xs disabled:opacity-60"
              >
                {busy === "follow" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Eye size={12} />
                )}
                나도 팔로우 신청
              </button>
            )}
            {!incoming && followSent && (
              <span className="flex-1 rounded-lg bg-slate-900/60 px-2 py-1.5 text-center text-[11px] text-slate-400">
                팔로우 신청을 보냈어요. 보낸 신청 탭에서 확인하세요.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScopeBadge({
  prefix,
  scope,
  tone,
}: {
  prefix: string;
  scope?: ShareScope;
  tone: "brand" | "slate";
}) {
  const parts: string[] = [];
  if (scope?.calendar) parts.push("달력");
  if (scope?.health) parts.push("건강");
  const text = scope ? (parts.length ? parts.join(", ") : "없음") : "—";
  return (
    <span
      className={cls(
        "inline-flex rounded-full px-2 py-0.5 text-[10px]",
        tone === "brand"
          ? "bg-brand-500/15 text-brand-200"
          : "bg-slate-800 text-slate-300",
      )}
    >
      {prefix}: {text}
    </span>
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

// ---- 받은 신청 탭 --------------------------------------------------------

function IncomingTab({
  requests,
  error,
}: {
  requests: FollowRequest[] | null;
  error?: string | null;
}) {
  return (
    <section className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {!error && requests === null && (
        <p className="card p-4 text-center text-xs text-slate-500">불러오는 중…</p>
      )}
      {requests?.length === 0 && (
        <p className="card p-4 text-center text-xs text-slate-500">
          받은 팔로우 신청이 없어요.
        </p>
      )}
      {requests?.map((r) => (
        <IncomingCard key={r.id} req={r} />
      ))}
    </section>
  );
}

function IncomingCard({ req }: { req: FollowRequest }) {
  // 기본은 "요청대로 공개". 사용자가 토글하면 직접 선택 모드.
  const [mode, setMode] = useState<"asis" | "custom">("asis");
  const [custom, setCustom] = useState<ShareScope>(req.requestedScope);
  const finalScope = mode === "asis" ? req.requestedScope : custom;
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onAccept() {
    setErr(null);
    setBusy("accept");
    try {
      await acceptFollowRequest(req.id, finalScope);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function onReject() {
    setErr(null);
    setBusy("reject");
    try {
      await rejectFollowRequest(req.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={req.fromName} photoURL={req.fromPhotoURL} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">{req.fromName}</p>
          <p className="truncate text-xs text-slate-500">{req.fromEmail}</p>
        </div>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <p className="text-[11px] text-slate-400">
          <Eye size={11} className="mb-0.5 mr-1 inline" />
          상대가 보고 싶은 범위
        </p>
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
          <ScopeCheckboxes value={custom} onChange={setCustom} />
        </div>
      )}
      {err && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onReject}
          disabled={busy !== null}
          className="btn-secondary flex-1 py-2 text-xs text-rose-300 disabled:opacity-60"
        >
          {busy === "reject" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <X size={12} />
          )}
          거절
        </button>
        <button
          onClick={onAccept}
          disabled={busy !== null || (!finalScope.calendar && !finalScope.health)}
          className="btn-primary flex-1 py-2 text-xs disabled:opacity-60"
        >
          {busy === "accept" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          수락
        </button>
      </div>
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

// ---- 보낸 신청 탭 --------------------------------------------------------

function OutgoingTab({
  requests,
  error,
}: {
  requests: FollowRequest[] | null;
  error?: string | null;
}) {
  return (
    <section className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {!error && requests === null && (
        <p className="card p-4 text-center text-xs text-slate-500">불러오는 중…</p>
      )}
      {requests?.length === 0 && (
        <p className="card p-4 text-center text-xs text-slate-500">
          보낸 팔로우 신청이 없어요.
        </p>
      )}
      {requests?.map((r) => (
        <OutgoingCard key={r.id} req={r} />
      ))}
    </section>
  );
}

function OutgoingCard({ req }: { req: FollowRequest }) {
  const link = useMemo(() => buildInviteLink(req.id), [req.id]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function cancel() {
    if (!confirm("이 팔로우 신청을 취소할까요?")) return;
    setBusy(true);
    try {
      await cancelFollowRequest(req.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("링크를 복사하세요", link);
    }
  }
  return (
    <div className="card space-y-3 p-4">
      <div>
        <p className="text-xs text-slate-400">대상 이메일</p>
        <p className="truncate text-sm font-medium text-slate-100">{req.toEmail}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <p className="text-[11px] text-slate-400">내가 보고 싶은 범위</p>
        <p className="mt-0.5 text-xs font-medium text-slate-100">
          {scopeText(req.requestedScope)}
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={copy} className="btn-secondary flex-1 py-2 text-xs">
          {copied ? <Check size={12} /> : <Link2 size={12} />}
          {copied ? "복사됨" : "초대 링크 복사"}
        </button>
        <button
          onClick={cancel}
          disabled={busy}
          className="btn-secondary flex-1 py-2 text-xs text-rose-300 disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          취소
        </button>
      </div>
    </div>
  );
}

function scopeText(s: ShareScope): string {
  const parts: string[] = [];
  if (s.calendar) parts.push("달력");
  if (s.health) parts.push("건강");
  return parts.length ? parts.join(", ") : "없음";
}
