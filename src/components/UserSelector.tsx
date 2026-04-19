import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { db, getSettings, patchSettings } from "../lib/db";
import type { User } from "../types";
import { cls } from "../lib/utils";

interface Props {
  className?: string;
  onAdd?: () => void;
  showAdd?: boolean;
}

export default function UserSelector({ className, onAdd, showAdd }: Props) {
  const users = useLiveQuery(() => db.users.orderBy("createdAt").toArray(), []);
  const settings = useLiveQuery(() => getSettings(), []);
  const activeId = settings?.activeUserId;

  if (!users) return null;

  return (
    <div className={cls("flex items-center gap-2 overflow-x-auto px-1", className)}>
      {users.map((u) => (
        <UserPill
          key={u.id}
          user={u}
          active={u.id === activeId}
          onSelect={() => patchSettings({ activeUserId: u.id })}
        />
      ))}
      {showAdd && users.length < 4 && (
        <button
          onClick={onAdd}
          className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-dashed
                     border-slate-700 px-3 text-sm text-slate-400 hover:text-slate-200"
        >
          <Plus size={16} /> 가족 추가
        </button>
      )}
    </div>
  );
}

function UserPill({
  user,
  active,
  onSelect,
}: {
  user: User;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cls(
        "flex h-11 shrink-0 items-center gap-2 rounded-full border px-1.5 pr-4 text-sm transition-all",
        active
          ? "border-transparent bg-slate-800 ring-2 ring-offset-2 ring-offset-slate-950"
          : "border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60",
      )}
      style={active ? { ["--tw-ring-color" as string]: user.color } : undefined}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: user.color }}
      >
        {user.name.slice(0, 1)}
      </span>
      <span className={cls("font-medium", active ? "text-white" : "")}>{user.name}</span>
    </button>
  );
}
