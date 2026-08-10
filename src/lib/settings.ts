export interface AppSettings {
  voice: string;
  soundFx: boolean;
  pitch: number;
}

const STORAGE_KEY = "zoya_settings";
const DEFAULTS: AppSettings = {
  voice: "Kore",
  soundFx: true,
  pitch: 1.2,
};

let cached: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  return next;
}

export const GEMINI_VOICES = [
  { name: "Kore", label: "Kore", desc: "Balanced female voice" },
  { name: "Leda", label: "Leda", desc: "Soft & sweet female voice" },
  { name: "Aoede", label: "Aoede", desc: "Warm expressive female voice" },
  { name: "Zephyr", label: "Zephyr", desc: "Bright female voice" },
] as const;
