import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Heart, Loader2, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  addComment,
  deleteComment,
  editComment,
  setMyLike,
  subscribeComments,
  subscribeLikes,
} from "../lib/social";
import type { MealComment } from "../types";
import { cls } from "../lib/utils";

interface Props {
  ownerUid: string;
  mealId: string;
}

/**
 * 식단 좋아요·댓글 블록.
 *
 * - Firebase 가 ready 이고 로그인된 경우에만 렌더하세요.
 * - viewer 는 share 가 있어야 read 가 가능 (rules 가 통제). 권한 오류는 조용히 무시.
 */
export default function MealSocialBlock({ ownerUid, mealId }: Props) {
  const { user } = useAuth();
  const myUid = user?.uid;
  const isOwner = myUid === ownerUid;

  const [likedUids, setLikedUids] = useState<string[] | null>(null);
  const [comments, setComments] = useState<MealComment[] | null>(null);
  const [accessErr, setAccessErr] = useState(false);

  useEffect(() => {
    if (!myUid) return;
    setAccessErr(false);
    const unsubL = subscribeLikes(
      ownerUid,
      mealId,
      (uids) => setLikedUids(uids),
      () => {
        setAccessErr(true);
        setLikedUids([]);
      },
    );
    const unsubC = subscribeComments(
      ownerUid,
      mealId,
      (rows) => setComments(rows),
      () => {
        setAccessErr(true);
        setComments([]);
      },
    );
    return () => {
      unsubL();
      unsubC();
    };
  }, [myUid, ownerUid, mealId]);

  const liked = useMemo(
    () => (myUid && likedUids ? likedUids.includes(myUid) : false),
    [likedUids, myUid],
  );

  if (!myUid || accessErr) return null;

  return (
    <div className="space-y-3 border-t border-slate-800 pt-3">
      <LikeRow
        ownerUid={ownerUid}
        mealId={mealId}
        liked={liked}
        likeCount={likedUids?.length ?? 0}
        loading={likedUids === null}
      />
      <CommentsSection
        ownerUid={ownerUid}
        mealId={mealId}
        comments={comments}
        myUid={myUid}
        isOwner={isOwner}
      />
    </div>
  );
}

function LikeRow({
  ownerUid,
  mealId,
  liked,
  likeCount,
  loading,
}: {
  ownerUid: string;
  mealId: string;
  liked: boolean;
  likeCount: number;
  loading: boolean;
}) {
  const [busy, setBusy] = useState(false);
  // optimistic 토글: 응답이 늦어도 즉시 반영.
  const [pendingLiked, setPendingLiked] = useState<boolean | null>(null);
  const effectiveLiked = pendingLiked ?? liked;

  useEffect(() => {
    setPendingLiked(null);
  }, [liked]);

  async function toggle() {
    setBusy(true);
    setPendingLiked(!effectiveLiked);
    try {
      await setMyLike(ownerUid, mealId, !effectiveLiked);
    } catch (e) {
      setPendingLiked(null);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || loading}
        className={cls(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60",
          effectiveLiked
            ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/20"
            : "bg-slate-800/60 text-slate-300 hover:bg-slate-800",
        )}
        aria-pressed={effectiveLiked}
      >
        <Heart
          size={14}
          className={cls(effectiveLiked && "fill-current")}
        />
        <span className="text-xs font-medium">
          {loading ? "—" : likeCount}
        </span>
      </button>
      <span className="text-[11px] text-slate-500">
        {effectiveLiked ? "좋아요 취소하기" : "좋아요"}
      </span>
    </div>
  );
}

function CommentsSection({
  ownerUid,
  mealId,
  comments,
  myUid,
  isOwner,
}: {
  ownerUid: string;
  mealId: string;
  comments: MealComment[] | null;
  myUid: string;
  isOwner: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <MessageCircle size={12} />
        <span>댓글 {comments?.length ?? 0}</span>
      </div>
      {comments === null ? (
        <p className="text-[11px] text-slate-500">불러오는 중…</p>
      ) : (
        comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            myUid={myUid}
            isOwner={isOwner}
            ownerUid={ownerUid}
            mealId={mealId}
          />
        ))
      )}
      <NewCommentInput ownerUid={ownerUid} mealId={mealId} />
    </div>
  );
}

function CommentRow({
  comment,
  myUid,
  isOwner,
  ownerUid,
  mealId,
}: {
  comment: MealComment;
  myUid: string;
  isOwner: boolean;
  ownerUid: string;
  mealId: string;
}) {
  const isMine = comment.authorUid === myUid;
  const canEdit = isMine;
  const canDelete = isMine || isOwner;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  useEffect(() => {
    setDraft(comment.text);
  }, [comment.text]);

  async function save() {
    setBusy("save");
    try {
      await editComment(ownerUid, mealId, comment.id, draft);
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("이 댓글을 삭제할까요?")) return;
    setBusy("delete");
    try {
      await deleteComment(ownerUid, mealId, comment.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg bg-slate-900/40 p-2.5 text-xs">
      <div className="flex items-start gap-2">
        <CommentAvatar name={comment.authorName} photoURL={comment.authorPhotoURL} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[12px] font-semibold text-slate-200">
              {comment.authorName}
            </span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {formatRelative(comment.createdAt)}
              {comment.updatedAt > comment.createdAt && " · 수정됨"}
            </span>
          </div>
          {editing ? (
            <CommentEditForm
              draft={draft}
              setDraft={setDraft}
              busy={busy === "save"}
              onCancel={() => {
                setEditing(false);
                setDraft(comment.text);
              }}
              onSave={save}
            />
          ) : (
            <p className="mt-0.5 break-words text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap">
              {comment.text}
            </p>
          )}
        </div>
        {!editing && (canEdit || canDelete) && (
          <div className="flex shrink-0 gap-0.5">
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="rounded p-1 text-slate-500 hover:text-slate-200"
                aria-label="수정"
              >
                <Pencil size={12} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={remove}
                disabled={busy !== null}
                className="rounded p-1 text-slate-500 hover:text-rose-400 disabled:opacity-50"
                aria-label="삭제"
              >
                {busy === "delete" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentEditForm({
  draft,
  setDraft,
  busy,
  onCancel,
  onSave,
}: {
  draft: string;
  setDraft: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(taRef, draft);
  return (
    <div className="mt-1.5 space-y-1.5">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (draft.trim() && !busy) onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={1}
        className="input resize-none text-xs leading-relaxed"
        autoFocus
      />
      <div className="flex gap-1.5">
        <button
          onClick={onCancel}
          className="btn-secondary flex-1 py-1 text-[11px]"
        >
          취소
        </button>
        <button
          onClick={onSave}
          disabled={busy || !draft.trim()}
          className="btn-primary flex-1 py-1 text-[11px] disabled:opacity-60"
        >
          {busy && <Loader2 size={10} className="animate-spin" />}
          저장
        </button>
      </div>
    </div>
  );
}

function NewCommentInput({
  ownerUid,
  mealId,
}: {
  ownerUid: string;
  mealId: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(taRef, text);

  async function submit() {
    if (!text.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      await addComment(ownerUid, mealId, text);
      setText("");
      taRef.current?.focus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-1.5">
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        placeholder="댓글 달기…"
        className="input min-w-0 flex-1 resize-none text-xs leading-relaxed"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !text.trim()}
        className="btn-primary shrink-0 px-3 py-2 text-xs disabled:opacity-60"
        aria-label="댓글 보내기"
        title="Cmd / Ctrl + Enter 로도 보낼 수 있어요"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      </button>
      {text && (
        <button
          type="button"
          onClick={() => setText("")}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-slate-200"
          aria-label="지우기"
        >
          <X size={14} />
        </button>
      )}
      {err && (
        <p className="basis-full text-[11px] text-rose-300">{err}</p>
      )}
    </div>
  );
}

function CommentAvatar({ name, photoURL }: { name: string; photoURL?: string }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt=""
        className="h-6 w-6 shrink-0 rounded-full border border-slate-800 object-cover"
      />
    );
  }
  const initial = name ? Array.from(name)[0]?.toUpperCase() ?? "?" : "?";
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-[10px] font-semibold text-slate-200">
      {initial}
    </div>
  );
}

/**
 * textarea 가 입력 길이에 맞춰 자동으로 늘어나도록 하는 훅.
 * - rows 속성보다 직관적이고, 모바일에서 한 줄 댓글이 잘리지 않도록 한다.
 * - 최대 높이는 maxPx (기본 7줄 정도) 까지만, 그 이상이면 내부 스크롤.
 */
function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement>,
  value: string,
  maxPx = 140,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [ref, value, maxPx]);
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
