import { useEffect, useRef } from "react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking" | "reconnecting";

interface VisualizerProps {
  state: VisualizerState;
  analyser?: AnalyserNode | null;
  outputAnalyser?: AnalyserNode | null;
}

interface Theme {
  primary: string;
  secondary: string;
  glow: string;
}

const THEMES: Record<VisualizerState, Theme> = {
  idle: { primary: "34,211,238", secondary: "168,85,247", glow: "34,211,238" },
  listening: { primary: "168,85,247", secondary: "34,211,238", glow: "168,85,247" },
  processing: { primary: "56,189,248", secondary: "99,102,241", glow: "56,189,248" },
  speaking: { primary: "34,211,238", secondary: "129,140,248", glow: "34,211,238" },
  reconnecting: { primary: "251,191,36", secondary: "34,211,238", glow: "251,191,36" },
};

const STATUS_TEXT: Record<VisualizerState, string> = {
  idle: "○ Standby",
  listening: "● Listening",
  processing: "● Thinking",
  speaking: "● Speaking",
  reconnecting: "◌ Reconnecting",
};

export default function Visualizer({ state, analyser, outputAnalyser }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastFrame = 0;
    const freqData = new Uint8Array(512);

    const draw = (time: number) => {
      const st = stateRef.current;
      const now = performance.now();
      // Throttle idle frames to save CPU (prevents the "hangy" feel)
      const fps = st === "idle" ? 30 : 60;
      if (now - lastFrame < 1000 / fps) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrame = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const theme = THEMES[st];
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.36;
      const t = time / 1000;

      // Pick the analyser that matches the current state
      const activeAnalyser = st === "speaking" ? outputAnalyser : analyser;
      let hasAudio = false;
      if (activeAnalyser) {
        try {
          activeAnalyser.getByteFrequencyData(freqData);
          hasAudio = freqData.some((v) => v > 0);
        } catch {
          hasAudio = false;
        }
      }

      // Determine amplitude source
      let amp: number;
      if (hasAudio) {
        amp = 0.35 + (freqData.reduce((a, b) => a + b, 0) / (freqData.length * 255)) * 0.65;
      } else {
        switch (st) {
          case "speaking":
            amp = 0.55 + 0.45 * Math.abs(Math.sin(t * 7));
            break;
          case "listening":
            amp = 0.3 + 0.3 * Math.abs(Math.sin(t * 2.5));
            break;
          case "processing":
            amp = 0.35 + 0.3 * Math.abs(Math.sin(t * 4));
            break;
          default:
            amp = 0.12 + 0.08 * Math.abs(Math.sin(t * 0.9));
        }
      }

      const barCount = 72;
      const baseRadius = radius * 0.78;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      // Frequency spectrum bars around the core
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        let val: number;
        if (hasAudio) {
          const idx = Math.floor((i / barCount) * 70);
          val = freqData[idx] / 255;
        } else {
          val = amp * (0.55 + 0.45 * Math.sin(i * 0.35 - t * 4));
        }
        const len = 4 + val * radius * 0.34;
        const innerR = baseRadius - len / 2;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * (innerR + len);
        const y2 = cy + Math.sin(angle) * (innerR + len);

        // Soft outer glow layer
        ctx.strokeStyle = `rgba(${theme.primary},${0.08 + val * 0.15})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Crisp inner layer
        ctx.strokeStyle = `rgba(${theme.secondary},${0.25 + val * 0.75})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Inner mirrored bars (pointing inward)
      for (let i = 0; i < 36; i++) {
        const angle = (i / 36) * Math.PI * 2 + Math.PI / 2;
        let val: number;
        if (hasAudio) {
          const idx = Math.floor((i / 36) * 60) + 10;
          val = freqData[idx] / 255;
        } else {
          val = amp * (0.5 + 0.5 * Math.sin(i * 0.5 + t * 5));
        }
        const len = 3 + val * radius * 0.18;
        ctx.strokeStyle = `rgba(${theme.glow},${0.12 + val * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * baseRadius * 0.72, cy + Math.sin(angle) * baseRadius * 0.72);
        ctx.lineTo(cx + Math.cos(angle) * (baseRadius * 0.72 - len), cy + Math.sin(angle) * (baseRadius * 0.72 - len));
        ctx.stroke();
      }

      // Outer rotating dashed arc ring
      const ringSpeed = st === "idle" ? 0.05 : 0.3;
      ctx.strokeStyle = `rgba(${theme.primary},0.28)`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.02, t * ringSpeed + (i * Math.PI * 2) / 6, t * ringSpeed + (i * Math.PI * 2) / 6 + 0.45);
        ctx.stroke();
      }

      // Inner counter-rotating ring
      ctx.strokeStyle = `rgba(${theme.secondary},0.2)`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.55, -t * ringSpeed * 1.4, -t * ringSpeed * 1.4 + Math.PI * 0.7);
      ctx.stroke();

      // Orbiting satellites
      const satRadius = radius * 0.9;
      const s1 = t * (st === "idle" ? 0.4 : 1.6);
      const s2 = -t * (st === "idle" ? 0.3 : 1.1);
      ctx.fillStyle = `rgba(${theme.primary},${0.4 + amp * 0.6})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(s1) * satRadius, cy + Math.sin(s1) * satRadius, 2.5 + amp * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${theme.secondary},${0.4 + amp * 0.6})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(s2) * radius * 0.62, cy + Math.sin(s2) * radius * 0.62, 2 + amp * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Central soft glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.34);
      grad.addColorStop(0, `rgba(${theme.glow},${0.16 + amp * 0.1})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.34, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none">
      {/* Ambient radial glow (CSS — cheap) */}
      <div
        className="absolute w-[62%] h-[62%] rounded-full animate-aurora"
        style={{
          background: `radial-gradient(circle, rgba(${THEMES[state].glow},0.14) 0%, transparent 65%)`,
          transition: "background 1s ease",
        }}
      />

      {/* Canvas spectrum */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Core overlay */}
      <div
        className="relative w-[26%] h-[26%] min-w-[120px] min-h-[120px] max-w-[240px] max-h-[240px] rounded-full flex items-center justify-center"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)",
          boxShadow: `0 0 45px rgba(${THEMES[state].glow},0.45), inset 0 0 35px rgba(${THEMES[state].glow},0.22)`,
          transition: "box-shadow 1s ease",
        }}
      >
        {/* Rotating conic gradient ring */}
        <div className="absolute -inset-[7px] rounded-full overflow-hidden opacity-80">
          <div
            className="absolute inset-0 conic-ring"
            style={{ filter: `blur(6px)`, transition: "opacity 1s ease" }}
          />
        </div>
        <div
          className="absolute -inset-px rounded-full"
          style={{ boxShadow: `0 0 14px rgba(${THEMES[state].primary},0.5)` }}
        />

        <div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: `rgba(${THEMES[state].primary},0.6)`, transition: "border-color 1s ease" }}
        />
        <div
          className="absolute inset-2 rounded-full border border-dashed"
          style={{ borderColor: `rgba(${THEMES[state].secondary},0.4)`, transition: "border-color 1s ease" }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 -right-2 flex items-center justify-center">
          <span className="relative flex w-3 h-3">
            <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full" style={{ backgroundColor: `rgba(${THEMES[state].primary},1)` }} />
            <span className="relative inline-flex rounded-full w-3 h-3" style={{ backgroundColor: `rgba(${THEMES[state].primary},1)` }} />
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span
            className="font-display font-bold tracking-[0.35em] text-base md:text-2xl bg-gradient-to-r from-cyan-300 via-sky-200 to-violet-300 bg-clip-text text-transparent"
            style={{ filter: `drop-shadow(0 0 16px rgba(${THEMES[state].primary},0.9))` }}
          >
            ZOYA
          </span>
          <span className="mt-1 font-mono text-[9px] md:text-[10px] tracking-[0.45em] uppercase opacity-60" style={{ color: "#e2e8f0" }}>
            {STATUS_TEXT[state]}
          </span>
        </div>
      </div>
    </div>
  );
}
