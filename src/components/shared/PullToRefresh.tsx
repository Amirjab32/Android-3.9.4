import React, { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Check, ArrowDown } from "lucide-react";
import { syncManager } from "@/lib/sync";

interface Props {
  children: React.ReactNode;
}

export default function PullToRefresh({ children }: Props) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const THRESHOLD = 65;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // فقط وقتی صفحه در بالاترین نقطه ممکن قرار دارد
    if (window.scrollY <= 2 && !isRefreshing) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    } else {
      isPullingRef.current = false;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPullingRef.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    // فقط کشیدن به سمت پایین در صورتی که صفحه اسکرول نشده باشد
    if (diff > 0 && window.scrollY <= 2) {
      // فرمول میرایی برای حس طبیعی فیزیکی کشش
      const damped = Math.min(110, Math.pow(diff, 0.82) * 1.6);
      setPullY(damped);
      
      // جلوگیری از اسکرول مرورگر هنگام اجرای عمل کشیدن به پایین
      if (diff > 15 && e.cancelable) {
        e.preventDefault();
      }
    } else {
      setPullY(0);
      isPullingRef.current = false;
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || isRefreshing) return;
    isPullingRef.current = false;

    if (pullY >= THRESHOLD) {
      // ویبره سبک گوشی در صورت پشتیبانی
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }
      } catch (_) {}

      setIsRefreshing(true);
      setPullY(THRESHOLD);

      try {
        // اجرای همگام‌سازی واقعی با سرور کلادفلر
        await syncManager.forceSync();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("focusflow-data-changed"));
          window.dispatchEvent(new CustomEvent("focusflow-db-synced"));
        }
      } catch (err) {
        console.error("Pull to refresh sync failed:", err);
      }

      setJustFinished(true);
      setTimeout(() => {
        setJustFinished(false);
        setIsRefreshing(false);
        setPullY(0);
      }, 600);
    } else {
      setPullY(0);
    }
  }, [pullY, isRefreshing]);

  useEffect(() => {
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const isTriggered = pullY >= THRESHOLD;

  return (
    <div className="relative w-full">
      {/* نشانگر شناور ریفرش به سبک اپلیکیشن‌های بومی */}
      {(pullY > 0 || isRefreshing) && (
        <div
          className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none transition-transform duration-150"
          style={{
            top: `${Math.max(12, Math.min(85, pullY - 10))}px`,
          }}
        >
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/95 border border-zinc-700/80 shadow-2xl text-xs backdrop-blur-md">
            {justFinished ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400 font-bold">اطلاعات به‌روز شد</span>
              </>
            ) : isRefreshing ? (
              <>
                <RefreshCw className="h-4 w-4 text-indigo-400 animate-spin" />
                <span className="text-zinc-200 font-medium">در حال دریافت از سرور...</span>
              </>
            ) : isTriggered ? (
              <>
                <RefreshCw className="h-4 w-4 text-amber-400" />
                <span className="text-amber-300 font-bold">رها کنید برای همگام‌سازی</span>
              </>
            ) : (
              <>
                <ArrowDown 
                  className="h-4 w-4 text-zinc-400 transition-transform duration-150"
                  style={{ transform: `rotate(${(pullY / THRESHOLD) * 180}deg)` }}
                />
                <span className="text-zinc-400">برای به‌روزرسانی بکشید</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* محتوای اصلی برنامه */}
      <div
        style={{
          transform: pullY > 0 ? `translateY(${Math.min(pullY * 0.45, 45)}px)` : undefined,
          transition: isPullingRef.current ? "none" : "transform 0.25s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
