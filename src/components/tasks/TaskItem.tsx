import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Check, Clock, Loader2, MessageSquare, Play, Pause, FileText, ChevronDown, Copy, CheckSquare, Square, Pencil } from "lucide-react";
import { Task, RecurringActivity, TaskStore } from "@/lib/store";
import { toShamsiShort, getGregorianToday, dayDiff, toPersianDigits } from "@/lib/shamsi";
import { useThemeStyles } from "@/lib/useThemeStyles";

interface ParsedLine {
  originalIndex: number;
  raw: string;
  isCheckable: boolean;
  isChecked: boolean;
  text: string;
}

function parseDescriptionLines(desc: string): ParsedLine[] {
  const lines = desc.split("\n");
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (/^(\[x\]|- \[x\]|\[X\]|- \[X\]|✓)\s*/.test(trimmed)) {
      const text = trimmed.replace(/^(\[x\]|- \[x\]|\[X\]|- \[X\]|✓)\s*/, "");
      return { originalIndex: idx, raw: line, isCheckable: true, isChecked: true, text };
    }
    if (/^(\[ \]|-\s*\[ \])\s*/.test(trimmed)) {
      const text = trimmed.replace(/^(\[ \]|-\s*\[ \])\s*/, "");
      return { originalIndex: idx, raw: line, isCheckable: true, isChecked: false, text };
    }
    if (/^[•\-\*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[•\-\*]\s+/, "");
      return { originalIndex: idx, raw: line, isCheckable: true, isChecked: false, text };
    }
    return { originalIndex: idx, raw: line, isCheckable: false, isChecked: false, text: line };
  });
}

interface Props {
  task: Task;
  onStatusChange: (task: Task, status: "todo" | "in_progress" | "done") => void;
  onDelete: (id: string) => void;
  activities?: RecurringActivity[];
  showTimer?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f43f5e",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
};

const STATUS_CONFIG = {
  todo: {
    borderColor: "rgba(148,163,184,0.35)",
    bgAccent: "rgba(148,163,184,0.06)",
    badgeBg: "rgba(148,163,184,0.15)",
    badgeColor: "#94a3b8",
    badgeLabel: "در انتظار",
    icon: Clock,
    iconColor: "#94a3b8",
    leftBarColor: "#94a3b8",
  },
  in_progress: {
    borderColor: "rgba(251,191,36,0.45)",
    bgAccent: "rgba(251,191,36,0.07)",
    badgeBg: "rgba(251,191,36,0.15)",
    badgeColor: "#fbbf24",
    badgeLabel: "در حال انجام",
    icon: Loader2,
    iconColor: "#fbbf24",
    leftBarColor: "#fbbf24",
  },
  done: {
    borderColor: "rgba(52,211,153,0.4)",
    bgAccent: "rgba(52,211,153,0.07)",
    badgeBg: "rgba(52,211,153,0.15)",
    badgeColor: "#34d399",
    badgeLabel: "انجام شد",
    icon: Check,
    iconColor: "#34d399",
    leftBarColor: "#34d399",
  },
};

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${toPersianDigits(h)}:${toPersianDigits(pad(m))}:${toPersianDigits(pad(s))}`;
  return `${toPersianDigits(pad(m))}:${toPersianDigits(pad(s))}`;
}

export default function TaskItem({ task, onStatusChange, onDelete, activities = [], showTimer = true }: Props) {
  const { fg, fgMuted, cardBg } = useThemeStyles();
  const [hovered, setHovered] = useState(false);
  const [displaySeconds, setDisplaySeconds] = useState(task.elapsed_seconds || 0);
  const [showDescription, setShowDescription] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const today = getGregorianToday();
  const isOverdue =
    task.status !== "done" && task.scheduled_date && task.scheduled_date < today;
  const overdueDays = isOverdue ? Math.abs(dayDiff(task.scheduled_date!, today)) : 0;
  const status = task.status;
  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;
  const iconClass =
    status === "in_progress" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5";
  const activity = activities.find((a) => a.id === task.activity_id);

  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescText, setEditDescText] = useState(task.description || "");
  const hasDescription = Boolean(task.description && task.description.trim().length > 0);

  useEffect(() => {
    setEditDescText(task.description || "");
  }, [task.description]);

  useEffect(() => {
    if (status === "in_progress" && task.timer_started_at) {
      const base = task.elapsed_seconds || 0;
      const startedAt = task.timer_started_at;
      const tick = () => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setDisplaySeconds(base + elapsed);
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setDisplaySeconds(task.elapsed_seconds || 0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, task.timer_started_at, task.elapsed_seconds]);

  const parsedLines = parseDescriptionLines(task.description || "");
  const checkableCount = parsedLines.filter((l) => l.isCheckable).length;
  const checkedCount = parsedLines.filter((l) => l.isCheckable && l.isChecked).length;

  const handleToggleChecklist = (lineIndex: number) => {
    if (!task.description) return;
    const lines = task.description.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const line = lines[lineIndex];
    const trimmed = line.trim();

    let newLine = line;
    if (/^(\[x\]|- \[x\]|\[X\]|- \[X\]|✓)\s*/.test(trimmed)) {
      const text = trimmed.replace(/^(\[x\]|- \[x\]|\[X\]|- \[X\]|✓)\s*/, "");
      newLine = `[ ] ${text}`;
    } else if (/^(\[ \]|-\s*\[ \])\s*/.test(trimmed)) {
      const text = trimmed.replace(/^(\[ \]|-\s*\[ \])\s*/, "");
      newLine = `[x] ${text}`;
    } else if (/^[•\-\*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[•\-\*]\s+/, "");
      newLine = `[x] ${text}`;
    }

    lines[lineIndex] = newLine;
    const updatedDescription = lines.join("\n");
    TaskStore.update(task.id, { description: updatedDescription });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      onClick={() => setShowDescription((prev) => !prev)}
      className="relative flex flex-col overflow-hidden rounded-xl px-4 py-3 transition-colors cursor-pointer select-none"
      style={{
        border: `1px solid ${activity ? `${activity.color}40` : isOverdue ? "rgba(244,63,94,0.4)" : showDescription ? "rgba(129,140,248,0.5)" : cfg.borderColor}`,
        backgroundColor: showDescription
          ? "rgba(99,102,241,0.06)"
          : hovered
            ? cfg.bgAccent
            : status === "todo" && !isOverdue
              ? cardBg
              : cfg.bgAccent,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute right-0 top-0 h-full w-1 rounded-r-xl"
        style={{ backgroundColor: activity ? activity.color : isOverdue ? "#f43f5e" : cfg.leftBarColor }}
      />
      <div className="flex items-center gap-3 w-full">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(task, status === "done" ? "todo" : "done");
          }}
          className="group flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-110 cursor-pointer"
          style={{
            borderColor: status === "done"
              ? "#10b981"
              : activity
                ? activity.color
                : isOverdue
                  ? "#f43f5e"
                  : "rgba(148,163,184,0.5)",
            backgroundColor: status === "done" ? "#10b981" : "transparent",
          }}
        >
          {status === "done" ? (
            <Check className="h-3.5 w-3.5 text-white stroke-[3px]" />
          ) : (
            <Check className="h-3 w-3 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity stroke-[3px]" />
          )}
        </button>
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className="truncate text-sm font-medium"
            style={{
              color: status === "done" ? fgMuted : fg,
              textDecoration: status === "done" ? "line-through" : "none",
              opacity: status === "done" ? 0.6 : 1,
            }}
          >
            {task.title}
            {activity && (
              <span className="mr-1 text-xs opacity-70" style={{ color: activity.color }}>
                [{activity.name}]
              </span>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: isOverdue ? "rgba(244,63,94,0.12)" : cfg.badgeBg,
                color: isOverdue ? "#f87171" : cfg.badgeColor,
              }}
            >
              <StatusIcon className={iconClass} />
              {isOverdue ? `${toPersianDigits(overdueDays)} روز تأخیر` : cfg.badgeLabel}
            </span>
            {task.scheduled_date && (
              <span className="text-xs" style={{ color: fgMuted }}>
                {toShamsiShort(task.scheduled_date)}
              </span>
            )}
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: `${PRIORITY_COLORS[task.priority]}18`,
                color: PRIORITY_COLORS[task.priority],
              }}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
            {showTimer && status !== "done" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task, status === "in_progress" ? "todo" : "in_progress");
                }}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-all hover:bg-amber-500/15 cursor-pointer"
                style={{
                  backgroundColor: status === "in_progress" ? "rgba(251,191,36,0.15)" : "rgba(128,128,128,0.08)",
                  color: status === "in_progress" ? "#fbbf24" : fgMuted,
                  border: status === "in_progress" ? "1px solid rgba(251,191,36,0.3)" : "1px solid transparent",
                }}
                title={status === "in_progress" ? "توقف تایمر" : "شروع تایمر"}
              >
                {status === "in_progress" ? (
                  <>
                    <Pause className="h-3 w-3 animate-pulse text-amber-400" />
                    <span>درحال انجام ({formatTimer(displaySeconds)})</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 text-indigo-400" />
                    <span>شروع کار {displaySeconds > 0 ? `(${formatTimer(displaySeconds)})` : ""}</span>
                  </>
                )}
              </button>
            )}
            {showTimer && status === "done" && displaySeconds > 0 && (
              <span
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono font-medium"
                style={{
                  backgroundColor: "rgba(128,128,128,0.1)",
                  color: fgMuted,
                }}
              >
                ⏱ {formatTimer(displaySeconds)}
              </span>
            )}
            {task.tags && task.tags.length > 0 && task.tags.map((t) => (
              <span
                key={t}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: "rgba(99,102,241,0.12)", color: "#818cf8" }}
              >
                #{t}
              </span>
            ))}
            {task.comment && (
              <span className="text-[11px]" style={{ color: fgMuted }} title={task.comment}>
                <MessageSquare className="inline h-3 w-3 mr-0.5" />
                {task.comment.length > 20 ? task.comment.slice(0, 20) + "..." : task.comment}
              </span>
            )}
            {hasDescription && (
              <span
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: showDescription ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.09)",
                  color: showDescription ? "#a5b4fc" : "#818cf8",
                  border: showDescription ? "1px solid rgba(129,140,248,0.35)" : "1px solid transparent",
                }}
              >
                <FileText className="h-3 w-3" />
                <span>توضیحات</span>
                {checkableCount > 0 && (
                  <span className="text-[10px] opacity-80 mr-0.5">
                    ({toPersianDigits(checkedCount)}/{toPersianDigits(checkableCount)})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons in Corner */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setShowDescription((prev) => !prev)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer hover:bg-white/10"
            style={{
              backgroundColor: showDescription
                ? "rgba(99,102,241,0.2)"
                : hasDescription
                  ? "rgba(99,102,241,0.12)"
                  : "rgba(255,255,255,0.04)",
              color: showDescription
                ? "#a5b4fc"
                : hasDescription
                  ? "#818cf8"
                  : fgMuted,
            }}
            title={showDescription ? "بستن توضیحات" : hasDescription ? "مشاهده توضیحات و تمرین‌ها" : "افزودن توضیحات"}
          >
            <ChevronDown
              className={`h-4.5 w-4.5 transition-transform duration-300 ease-in-out ${
                showDescription ? "rotate-180 text-indigo-400" : ""
              }`}
            />
          </button>
          
          <button
            onClick={() => onDelete(task.id)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer"
            style={{ opacity: hovered ? 1 : 0.65, color: fgMuted }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(244,63,94,0.12)";
              (e.currentTarget as HTMLElement).style.color = "#f87171";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLElement).style.color = fgMuted;
            }}
            title="حذف تسک"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showDescription && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 10 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="w-full overflow-hidden rounded-xl p-3 text-xs leading-relaxed"
            style={{
              backgroundColor: "rgba(0,0,0,0.28)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[11px] font-medium">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-indigo-400">
                  <FileText className="h-3.5 w-3.5" />
                  <span>توضیحات و تمرین‌های تسک</span>
                </span>
                {checkableCount > 0 && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {toPersianDigits(checkedCount)} از {toPersianDigits(checkableCount)} تمرین انجام شد
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditingDesc((prev) => !prev)}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 cursor-pointer"
                  title="ویرایش متن توضیحات"
                >
                  <Pencil className="h-3 w-3 text-indigo-400" />
                  <span>{isEditingDesc ? "مشاهده" : "ویرایش"}</span>
                </button>
                {hasDescription && (
                  <button
                    type="button"
                    onClick={() => {
                      if (task.description) {
                        navigator.clipboard.writeText(task.description);
                        setCopiedDesc(true);
                        setTimeout(() => setCopiedDesc(false), 2000);
                      }
                    }}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 cursor-pointer"
                  >
                    {copiedDesc ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>کپی متن</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {isEditingDesc ? (
              <div className="space-y-2 pt-1" dir="rtl">
                <textarea
                  value={editDescText}
                  onChange={(e) => setEditDescText(e.target.value)}
                  placeholder="توضیحات، ویدیوها و تمرین‌ها را بنویسید (خطوط با • به چک‌لیست تبدیل می‌شوند)..."
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs text-right leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  style={{ color: fg }}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditDescText(task.description || "");
                      setIsEditingDesc(false);
                    }}
                    className="px-2.5 py-1 text-[11px] rounded bg-white/5 hover:bg-white/10 text-gray-400"
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      TaskStore.update(task.id, { description: editDescText });
                      setIsEditingDesc(false);
                    }}
                    className="px-3 py-1 text-[11px] font-semibold rounded bg-indigo-600 hover:bg-indigo-700 text-white shadow"
                  >
                    ذخیره توضیحات
                  </button>
                </div>
              </div>
            ) : hasDescription ? (
              <div className="text-right font-sans select-text text-xs leading-6 space-y-0.5" dir="rtl">
                {parsedLines.map((line) => {
                  if (line.isCheckable) {
                    return (
                      <div
                        key={line.originalIndex}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleChecklist(line.originalIndex);
                        }}
                        className="group flex items-start gap-2 py-1 px-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer select-none"
                      >
                        <div className="mt-1 flex-shrink-0">
                          {line.isChecked ? (
                            <CheckSquare className="h-4 w-4 text-emerald-400 fill-emerald-500/20" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-500 group-hover:text-gray-300" />
                          )}
                        </div>
                        <span
                          className={`flex-1 text-xs leading-5 transition-all ${
                            line.isChecked
                              ? "line-through opacity-60 text-emerald-200/70"
                              : ""
                          }`}
                          style={{ color: line.isChecked ? fgMuted : fg }}
                        >
                          {line.text}
                        </span>
                      </div>
                    );
                  }

                  if (!line.raw.trim()) {
                    return <div key={line.originalIndex} className="h-1.5" />;
                  }

                  const isHeader =
                    line.raw.trim().endsWith(":") ||
                    line.raw.trim().startsWith("📁") ||
                    line.raw.trim().startsWith("🎸") ||
                    line.raw.trim().startsWith("🎵") ||
                    line.raw.trim().startsWith("📄");

                  return (
                    <div
                      key={line.originalIndex}
                      className={`px-1 ${
                        isHeader
                          ? "font-bold text-indigo-300 pt-2 pb-0.5 text-[11px]"
                          : "py-0.5 text-xs opacity-90"
                      }`}
                      style={{ color: isHeader ? "#a5b4fc" : fg }}
                    >
                      {line.raw}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs py-2 px-1 text-gray-400">
                <span>هنوز توضیح یا تمرینی برای این تسک ثبت نشده است.</span>
                <button
                  type="button"
                  onClick={() => setIsEditingDesc(true)}
                  className="text-indigo-400 hover:text-indigo-300 text-[11px] font-semibold underline cursor-pointer"
                >
                  + افزودن توضیحات
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
