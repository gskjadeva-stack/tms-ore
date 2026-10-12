import { Play, Pause, RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";

// status: 'idle' | 'running' | 'paused' | 'stopped'
export default function TimerControls({
  status = "idle",
  onStart,
  onPause,
  onResume,
  onStop,
  size = "sm",
  compact = false,
}) {
  const btn = (opts) => (
    <button
      type="button"
      onClick={opts.onClick}
      disabled={opts.disabled}
      title={opts.title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium transition-colors border",
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
        opts.disabled
          ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50"
          : cn(opts.className, "hover:opacity-90")
      )}
    >
      <opts.icon className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />
      {!compact && opts.label}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      {btn({
        icon: Play,
        label: "Start",
        title: "Start",
        onClick: onStart,
        disabled: status === "running" || status === "paused",
        className: "bg-emerald-600 text-white border-emerald-600",
      })}
      {btn({
        icon: Pause,
        label: "Pause",
        title: "Pause",
        onClick: onPause,
        disabled: status !== "running",
        className: "bg-amber-500 text-white border-amber-500",
      })}
      {btn({
        icon: RotateCcw,
        label: "Resume",
        title: "Resume",
        onClick: onResume,
        disabled: status !== "paused",
        className: "bg-sky-600 text-white border-sky-600",
      })}
      {btn({
        icon: Square,
        label: "Stop",
        title: "Stop",
        onClick: onStop,
        disabled: status !== "running" && status !== "paused",
        className: "bg-rose-600 text-white border-rose-600",
      })}
    </div>
  );
}