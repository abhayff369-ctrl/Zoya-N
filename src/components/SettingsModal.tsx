import { motion, AnimatePresence } from "motion/react";
import { Volume2, Music, SlidersHorizontal, X } from "lucide-react";
import { getSettings, updateSettings, GEMINI_VOICES } from "../lib/settings";
import { useEffect, useState } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState(getSettings());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!isOpen) return null;

  const apply = (patch: Partial<typeof settings>) => {
    setSettings(updateSettings(patch));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#0b0b14] border border-white/10 rounded-3xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-violet-500 flex items-center justify-center">
                  <SlidersHorizontal size={17} className="text-white" />
                </div>
                <h2 className="text-lg font-semibold text-white">Zoya Settings</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Voice selection */}
            <div className="mb-5">
              <p className="text-xs text-white/50 font-mono tracking-wider uppercase mb-2 flex items-center gap-1.5">
                <Volume2 size={12} /> Voice
              </p>
              <div className="grid grid-cols-2 gap-2">
                {GEMINI_VOICES.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => apply({ voice: v.name })}
                    className={`flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all ${
                      settings.voice === v.name
                        ? "bg-cyan-500/15 border-cyan-400/50 text-white"
                        : "bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/[0.07]"
                    }`}
                  >
                    <span className="text-sm font-medium">{v.label}</span>
                    <span className="text-[10px] opacity-60">{v.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sound effects */}
            <div className="mb-5">
              <p className="text-xs text-white/50 font-mono tracking-wider uppercase mb-2 flex items-center gap-1.5">
                <Music size={12} /> Sound Effects
              </p>
              <button
                onClick={() => apply({ soundFx: !settings.soundFx })}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  settings.soundFx
                    ? "bg-cyan-500/15 border-cyan-400/50"
                    : "bg-white/[0.03] border-white/10"
                }`}
              >
                <span className="text-sm text-white/80">Chime sounds on start / stop</span>
                <span
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    settings.soundFx ? "bg-cyan-400" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      settings.soundFx ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>

            {/* Fallback pitch */}
            <div>
              <p className="text-xs text-white/50 font-mono tracking-wider uppercase mb-2">
                Voice pitch (offline mode) — {settings.pitch.toFixed(1)}
              </p>
              <input
                type="range"
                min="0.7"
                max="1.6"
                step="0.05"
                value={settings.pitch}
                onChange={(e) => apply({ pitch: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full py-3 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white font-semibold hover:brightness-110 transition-all"
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
