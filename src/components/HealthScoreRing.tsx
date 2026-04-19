import { scoreColor, scoreLabel } from "../lib/utils";

interface Props {
  score?: number;
  size?: number;
  label?: string;
  sub?: string;
}

export default function HealthScoreRing({ score, size = 120, label, sub }: Props) {
  const stroke = size * 0.1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const color = scoreColor(score);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <div className="text-3xl font-bold tabular-nums" style={{ color }}>
          {score ?? "—"}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400">
          {label ?? "건강 점수"}
        </div>
        <div className="mt-0.5 text-xs font-medium text-slate-300">
          {sub ?? scoreLabel(score)}
        </div>
      </div>
    </div>
  );
}
