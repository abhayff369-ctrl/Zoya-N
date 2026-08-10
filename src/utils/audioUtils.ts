import { getSettings } from "../lib/settings";

// ---- Generated sound effects (no audio files needed) ----
let fxContext: AudioContext | null = null;

function getFxContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!fxContext || fxContext.state === "closed") {
      fxContext = new AudioContextClass();
    }
    return fxContext;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, start: number, freq: number, duration: number, volume = 0.06) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

export type FxType = "start" | "end" | "send" | "error";

export function playEffect(type: FxType) {
  if (!getSettings().soundFx) return;
  const ctx = getFxContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  switch (type) {
    case "start":
      tone(ctx, 0, 523.25, 0.12);
      tone(ctx, 0.12, 783.99, 0.18);
      break;
    case "end":
      tone(ctx, 0, 783.99, 0.12);
      tone(ctx, 0.12, 523.25, 0.2);
      break;
    case "send":
      tone(ctx, 0, 659.25, 0.09, 0.04);
      break;
    case "error":
      tone(ctx, 0, 220, 0.25, 0.08);
      tone(ctx, 0.05, 174.61, 0.3, 0.08);
      break;
  }
}

// =====================
// Voice playback manager
// =====================
// Zoya ek time me sirf EK voice bajati hai. Nayi voice start hote hi purani
// turant band ho jati hai, aur koi bhi stale safety-timeout nayi voice ko
// cancel nahi kar sakta. Yehi "voice aati nahi" wale random bugs khatam karta hai.
let speechToken = 0;
let activeStop: (() => void) | null = null;

function isCurrent(token: number): boolean {
  return token === speechToken;
}

function claimPlayback(stopFn: () => void): number {
  speechToken++;
  const token = speechToken;
  if (activeStop) {
    const prev = activeStop;
    activeStop = null;
    prev();
  }
  activeStop = stopFn;
  return token;
}

// Kisi bhi chalu voice playback ko turant rok deta hai.
export function stopVoice(): void {
  speechToken++;
  if (activeStop) {
    const prev = activeStop;
    activeStop = null;
    prev();
  }
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

// Detect container format of the audio bytes (WAV / MP3 / raw PCM).
function detectAudioFormat(bytes: Uint8Array): "wav" | "mp3" | "raw" {
  if (bytes.length >= 4) {
    const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (tag === "RIFF") return "wav";
    if (tag === "fLaC") return "wav";
  }
  if (bytes.length >= 3) {
    const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
    if (tag === "ID3") return "mp3";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  return "raw";
}

export function playPCM(base64Data: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("AudioContext not supported");
      resolve();
      return;
    }
    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioCtx = new AudioContextClass();

      let settled = false;
      let source: AudioBufferSourceNode | null = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (activeStop === stopFn) activeStop = null;
        audioCtx.close().catch(() => {});
        resolve();
      };

      const stopFn = () => {
        if (settled) return;
        if (source) {
          try {
            source.stop();
          } catch {}
        }
        finish();
      };

      // Interrupt any previous playback; we are the only voice now.
      const token = claimPlayback(stopFn);

      const decodeAndPlay = async () => {
        const fmt = detectAudioFormat(bytes);
        let buffer: AudioBuffer;

        if (fmt === "raw") {
          // Raw 16-bit little-endian PCM @ 24kHz
          const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
          buffer = audioCtx.createBuffer(1, pcm.length, 24000);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < pcm.length; i++) {
            data[i] = pcm[i] / 32768;
          }
        } else {
          // WAV / MP3 / FLAC — let the browser decode properly
          buffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
        }

        if (!isCurrent(token)) {
          finish();
          return;
        }

        source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);

        if (audioCtx.state === "suspended") {
          await audioCtx.resume().catch(() => {});
        }
        if (!isCurrent(token)) {
          finish();
          return;
        }

        source.start();

        // Safety timeout so playback can never hang the UI forever.
        const safetyMs = Math.max(3000, buffer.duration * 1000 + 1500);
        setTimeout(() => {
          if (isCurrent(token)) stopFn();
        }, safetyMs);

        source.onended = () => {
          if (isCurrent(token)) finish();
        };
      };

      decodeAndPlay().catch(() => finish());
    } catch (error) {
      console.error("Error playing audio:", error);
      resolve();
    }
  });
}

// Fallback voice using the browser's built-in SpeechSynthesis (works even without an API key).
const FEMALE_VOICE = /female|zira|samantha|victoria|karen|moira|tessa|fiona|hazel|serena|naomi|aria|jenny|susan|samantha|neerja|heera|priya|veena|kalpana|geeta|emma|siri|ava|natasha/i;
const MALE_VOICE = /male|david|mark|eric|daniel|brian|alex|anson|christopher|guy|rishi|james|george|oliver|tom|ryan|noah|liam/i;

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-in/i.test(v.lang) && FEMALE_VOICE.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang) && FEMALE_VOICE.test(v.name) && !MALE_VOICE.test(v.name)) ||
    voices.find((v) => /en-in/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang) && !MALE_VOICE.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}

export function speakFallback(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }
    try {
      let settled = false;
      let attempts = 0;
      let attemptVersion = 0;
      let watchdogId: number | null = null;
      let safetyTimer: number | null = null;
      let startRetryTimer: number | null = null;

      const clearTimers = () => {
        if (watchdogId !== null) {
          window.clearInterval(watchdogId);
          watchdogId = null;
        }
        if (safetyTimer !== null) {
          window.clearTimeout(safetyTimer);
          safetyTimer = null;
        }
        if (startRetryTimer !== null) {
          window.clearTimeout(startRetryTimer);
          startRetryTimer = null;
        }
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimers();
        if (activeStop === stopFn) activeStop = null;
        resolve();
      };

      const stopFn = () => {
        if (settled) return;
        try {
          window.speechSynthesis.cancel();
        } catch {}
        finish();
      };

      // Interrupt any previous playback (PCM or older TTS) and become current.
      const token = claimPlayback(stopFn);

      const trySpeak = () => {
        if (!isCurrent(token)) {
          finish();
          return;
        }
        // Flush any stuck Chrome speech queue before speaking.
        try {
          window.speechSynthesis.cancel();
        } catch {}

        const attempt = ++attemptVersion;
        let started = false;

        const voice = pickFemaleVoice();
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice) utterance.voice = voice;
        utterance.rate = 1.0;
        utterance.pitch = getSettings().pitch; // user-configurable, default more feminine
        utterance.volume = 1;
        utterance.onstart = () => {
          started = true;
        };
        utterance.onend = () => {
          if (isCurrent(token)) finish();
        };
        utterance.onerror = () => {
          if (isCurrent(token)) finish();
        };

        // Chrome races cancel() + speak() and drops the new utterance.
        // Wait one tick after cancel so the new one actually starts.
        setTimeout(() => {
          if (!isCurrent(token) || attempt !== attemptVersion) {
            finish();
            return;
          }
          try {
            window.speechSynthesis.speak(utterance);
          } catch {}
        }, 60);

        // If the utterance never starts, Chrome swallowed it -> cancel + retry.
        startRetryTimer = window.setTimeout(() => {
          startRetryTimer = null;
          if (settled) return;
          if (!started && attempts < 3) {
            attempts++;
            trySpeak();
          } else if (!started) {
            finish();
          }
        }, 2200);

        safetyTimer = window.setTimeout(() => {
          if (isCurrent(token) && attempt === attemptVersion) stopFn();
        }, Math.max(5000, text.length * 140));
      };

      // Watchdog: Chrome silently pauses speech after ~15s; keep it alive.
      watchdogId = window.setInterval(() => {
        if (settled) return;
        if (window.speechSynthesis.speaking) {
          try {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          } catch {}
        }
      }, 8000);

      // Voices may not be loaded yet on first call.
      if (window.speechSynthesis.getVoices().length === 0) {
        let done = false;
        const listener = () => {
          if (done) return;
          done = true;
          window.speechSynthesis.removeEventListener("voiceschanged", listener);
          trySpeak();
        };
        window.speechSynthesis.addEventListener("voiceschanged", listener);
        setTimeout(listener, 400); // fallback if the event never fires
      } else {
        trySpeak();
      }
    } catch (error) {
      console.error("Error speaking fallback:", error);
      resolve();
    }
  });
}

