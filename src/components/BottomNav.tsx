import { Link, useLocation } from "react-router-dom";
import { Calendar, HeartPulse, Settings } from "lucide-react";
import { cls } from "../lib/utils";

const items = [
  { to: "/", label: "달력", icon: Calendar },
  { to: "/health", label: "건강", icon: HeartPulse },
  { to: "/settings", label: "설정", icon: Settings },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-screen-sm -translate-x-1/2
                 border-t border-slate-800/80 bg-slate-950/85 backdrop-blur"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="flex items-stretch justify-around">
        {items.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? pathname === "/" || pathname.startsWith("/day") : pathname === to;
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cls(
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors",
                  active ? "text-brand-400" : "text-slate-400 hover:text-slate-200",
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                <span className={cls(active && "font-semibold")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
