/**
 * سیستم ذخیره‌سازی محلی فایل‌های صوتی زنگ در IndexedDB
 * جلوگیری از پر شدن حافظه ۵ مگابایتی localStorage مرورگر و پشتیبانی کامل آفلاین
 */

const AUDIO_DB_NAME = "focusflow_audio_db";
const AUDIO_STORE_NAME = "custom_sounds";
const AUDIO_DB_VERSION = 1;

function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const AudioStorageService = {
  /**
   * ذخیره فایل صوتی در IndexedDB و پشتیبان‌گیری در حافظه قابل همگام‌سازی
   */
  async saveAudio(id: string, dataUrl: string): Promise<boolean> {
    try {
      // ۱. ذخیره در IndexedDB جهت دسترسی سریع بدون افت عملکرد
      const db = await openAudioDB();
      const dbSaved = await new Promise<boolean>((resolve) => {
        const tx = db.transaction(AUDIO_STORE_NAME, "readwrite");
        const store = tx.objectStore(AUDIO_STORE_NAME);
        store.put({ id, dataUrl, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });

      // ۲. ذخیره در مخزن همگام‌سازی جهت انتقال با فایل جیسون و سرور کلودفلر
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const raw = localStorage.getItem("focusflow_custom_audio_sounds");
          const sounds = raw ? JSON.parse(raw) : {};
          sounds[id] = dataUrl;
          localStorage.setItem("focusflow_custom_audio_sounds", JSON.stringify(sounds));
          localStorage.setItem("focusflow_local_mtime", Date.now().toString());
          window.dispatchEvent(new CustomEvent("focusflow-data-changed", { detail: { key: "focusflow_custom_audio_sounds" } }));
        } catch (e) {
          console.warn("Storage quota limit for audio sync cache:", e);
        }
      }

      return dbSaved;
    } catch {
      return false;
    }
  },

  /**
   * دریافت فایل صوتی ذخیره‌شده بر اساس شناسه
   */
  async getAudio(id: string): Promise<string | null> {
    try {
      // ابتدا بررسی کش localStorage
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const raw = localStorage.getItem("focusflow_custom_audio_sounds");
          if (raw) {
            const sounds = JSON.parse(raw);
            if (sounds && sounds[id]) {
              return sounds[id];
            }
          }
        } catch {}
      }

      const db = await openAudioDB();
      return new Promise((resolve) => {
        const tx = db.transaction(AUDIO_STORE_NAME, "readonly");
        const store = tx.objectStore(AUDIO_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result && req.result.dataUrl) {
            resolve(req.result.dataUrl);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  /**
   * دریافت تمامی فایل‌های صوتی جهت خروجی فایل بکاپ و همگام‌سازی با سرور
   */
  async getAllAudio(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    // خواندن از localStorage
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = localStorage.getItem("focusflow_custom_audio_sounds");
        if (raw) {
          Object.assign(result, JSON.parse(raw));
        }
      } catch {}
    }

    // خواندن تکمیلی از IndexedDB
    try {
      const db = await openAudioDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(AUDIO_STORE_NAME, "readonly");
        const store = tx.objectStore(AUDIO_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          if (Array.isArray(req.result)) {
            for (const item of req.result) {
              if (item && item.id && item.dataUrl) {
                result[item.id] = item.dataUrl;
              }
            }
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    } catch {}

    return result;
  },

  /**
   * بازیابی و ذخیره‌سازی دسته‌ای صداهای سفارشی از فایل بکاپ یا سرور
   */
  async saveAllAudio(records: Record<string, string>): Promise<void> {
    if (!records || typeof records !== "object") return;

    // ۱. به‌روزرسانی در کش localStorage
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = localStorage.getItem("focusflow_custom_audio_sounds");
        const existing = raw ? JSON.parse(raw) : {};
        const merged = { ...existing, ...records };
        localStorage.setItem("focusflow_custom_audio_sounds", JSON.stringify(merged));
      } catch {}
    }

    // ۲. نوشتن در دیتابیس پایدار IndexedDB
    try {
      const db = await openAudioDB();
      const tx = db.transaction(AUDIO_STORE_NAME, "readwrite");
      const store = tx.objectStore(AUDIO_STORE_NAME);
      for (const [id, dataUrl] of Object.entries(records)) {
        if (id && dataUrl) {
          store.put({ id, dataUrl, updatedAt: Date.now() });
        }
      }
    } catch {}
  },

  /**
   * حذف فایل صوتی اختصاصی
   */
  async deleteAudio(id: string): Promise<boolean> {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const raw = localStorage.getItem("focusflow_custom_audio_sounds");
          if (raw) {
            const sounds = JSON.parse(raw);
            delete sounds[id];
            localStorage.setItem("focusflow_custom_audio_sounds", JSON.stringify(sounds));
            localStorage.setItem("focusflow_local_mtime", Date.now().toString());
            window.dispatchEvent(new CustomEvent("focusflow-data-changed", { detail: { key: "focusflow_custom_audio_sounds" } }));
          }
        } catch {}
      }

      const db = await openAudioDB();
      return new Promise((resolve) => {
        const tx = db.transaction(AUDIO_STORE_NAME, "readwrite");
        const store = tx.objectStore(AUDIO_STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
};
