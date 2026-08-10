import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Mic, MicOff, Volume2, VolumeX, Keyboard, Send, Trash2, MessageSquare, Sparkles, Settings as SettingsIcon } from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import ChatPanel from "./components/ChatPanel";
import SettingsModal from "./components/SettingsModal";
import Clock from "./components/Clock";
import { playPCM, speakFallback, playEffect, stopVoice } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking" | "reconnecting";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
  time?: number;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const STATUS_LABEL: Record<AppState, string> = {
  idle: "Standby",
  listening: "Listening...",
  processing: "Replying...",
  speaking: "Speaking...",
  reconnecting: "Reconnecting...",
};

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("zoya_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    // Debounced persistence so the typewriter effect doesn't thrash localStorage
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("zoya_chat_history", JSON.stringify(messages));
      } catch (e) {
        console.error("Failed to save chat history", e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [messages]);

  const [isMuted, setIsMuted] = useState<boolean>(() => localStorage.getItem("zoya_muted") === "1");

  useEffect(() => {
    localStorage.setItem("zoya_muted", isMuted ? "1" : "0");
    if (isMuted) {
      stopVoice();
    }
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);
  const [playbackAnalyser, setPlaybackAnalyser] = useState<AnalyserNode | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const speakSeqRef = useRef(0);

  const speakText = useCallback(async (text: string) => {
    const seq = ++speakSeqRef.current;
    setAppState("speaking");
    const audioBase64 = await Promise.race([
      getZoyaAudio(text),
      // Agar Gemini TTS 6s me response nahi deta, to turant browser voice use karo
      new Promise<null>((r) => setTimeout(() => r(null), 6000)),
    ]);
    if (seq !== speakSeqRef.current) return;
    if (audioBase64) {
      await playPCM(audioBase64);
    } else {
      // Fallback to the browser's built-in voice when Gemini TTS is unavailable
      await speakFallback(text);
    }
  }, []);

  // Reveals a chat message progressively (typewriter effect)
  const typewrite = useCallback(async (messageId: string, fullText: string) => {
    const step = 4;
    for (let i = step; i <= fullText.length; i += step) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: fullText.slice(0, i) } : m)));
      await new Promise((r) => setTimeout(r, 12));
    }
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: fullText } : m)));
  }, []);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    // Open the chat panel so the user can see the conversation
    setShowChat(true);
    const ts = Date.now();
    playEffect("send");
    setMessages((prev) => [...prev, { id: ts.toString(), sender: "user", text: finalTranscript, time: ts }]);

    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText, time: Date.now() }]);

      if (!isMuted) {
        await speakText(responseText);
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 900);
    } else {
      // 2. General Chit-Chat via Gemini (with a typewriter reveal)
      responseText = await getZoyaResponse(finalTranscript, messagesRef.current);
      const replyId = Date.now().toString() + "-z";
      setMessages((prev) => [...prev, { id: replyId, sender: "zoya", text: "", time: Date.now() }]);

      // Run the typewriter and the voice in parallel so the reply feels instant:
      // audio starts playing while the text is still being revealed.
      const reveal: Promise<void>[] = [typewrite(replyId, responseText)];
      if (!isMuted) {
        reveal.push(speakText(responseText));
      }
      await Promise.all(reveal);
      setAppState("idle");
    }
  }, [isMuted, isSessionActive, speakText, typewrite]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      playEffect("end");
      stopVoice();
      setIsSessionActive(false);
      setLiveAnalyser(null);
      setPlaybackAnalyser(null);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetZoyaSession();
    } else {
      if (!process.env.GEMINI_API_KEY) {
        alert("Voice session ke liye GEMINI_API_KEY chahiye! .env.local me apni API key daalo. Tab tak text mode (Keyboard button) use karo.");
        return;
      }
      try {
        setIsSessionActive(true);
        resetZoyaSession();

        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;

        session.onStateChange = (state) => {
          setAppState(state);
        };

        session.onMessage = (sender, text) => {
          setShowChat(true);
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text, time: Date.now() }]);
        };

        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 800);
        };

        await session.start();
        setLiveAnalyser(session.analyser);
        setPlaybackAnalyser(session.playbackAnalyser);
        playEffect("start");
      } catch (e) {
        console.error("Failed to start session", e);
        playEffect("error");
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setLiveAnalyser(null);
        setPlaybackAnalyser(null);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  // Voice dictation for the text box (uses the Web Speech API)
  const [isDictating, setIsDictating] = useState(false);
  const dictationRef = useRef<any>(null);

  const startDictation = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      alert("Your browser does not support voice input. Try Chrome.");
      return;
    }
    if (isDictating) {
      dictationRef.current?.stop();
      setIsDictating(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setTextInput((prev) => (prev ? prev + " " : "") + transcript.trim());
    };
    recognition.onend = () => setIsDictating(false);
    recognition.onerror = () => setIsDictating(false);
    recognition.start();
    dictationRef.current = recognition;
    setIsDictating(true);
  }, [isDictating]);

  const clearChat = useCallback(() => {
    setMessages([]);
    stopVoice();
    resetZoyaSession();
  }, []);

  // Deterministic floating particles (cheap, transform-only)
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: (i * 7.3) % 100,
        size: 2 + (i % 4),
        duration: 9 + ((i * 3.7) % 14),
        delay: -((i * 2.3) % 16),
        opacity: 0.25 + ((i % 5) / 10),
      })),
    []
  );

  return (
    <div className="h-[100dvh] w-screen bg-[#03030a] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal
          onClose={() => setShowPermissionModal(false)}
        />
      )}

      {/* Cinematic Aurora Background (radial gradients — no expensive blur filter) */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div
          className="absolute top-[-15%] left-[-10%] w-[60%] h-[55%] rounded-full animate-aurora"
          style={{ background: "radial-gradient(circle, rgba(109,40,217,0.22) 0%, transparent 65%)" }}
        />
        <div
          className="absolute bottom-[-15%] right-[-10%] w-[55%] h-[50%] rounded-full animate-aurora-reverse"
          style={{ background: "radial-gradient(circle, rgba(14,165,233,0.16) 0%, transparent 65%)" }}
        />
        <div
          className="absolute top-[30%] right-[15%] w-[35%] h-[35%] rounded-full animate-aurora"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.12) 0%, transparent 70%)" }}
        />
      </div>

      {/* Cinematic HUD grid overlay */}
      <div className="absolute inset-0 w-full h-full pointer-events-none grid-overlay" />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((p) => (
          <span
            key={p.id}
            className="particle"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              background:
                p.id % 2 === 0
                  ? "radial-gradient(circle, rgba(103,232,249,0.95), rgba(103,232,249,0))"
                  : "radial-gradient(circle, rgba(196,181,253,0.95), rgba(196,181,253,0))",
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full z-20 shrink-0 px-4 md:px-8 py-4 md:py-5">
        <div className="max-w-7xl mx-auto flex justify-between items-center glass rounded-2xl md:rounded-full px-4 md:px-6 py-3 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-400 via-sky-500 to-violet-500 flex items-center justify-center font-display font-bold text-xl shadow-lg shadow-cyan-500/40 ring-1 ring-white/25">
                Z
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#0a0a16]" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-300/80 animate-ping-soft" />
            </div>
            <div className="leading-tight">
              <h1
                className="font-display font-bold text-lg md:text-xl tracking-[0.35em] text-gradient-animated"
                style={{ filter: "drop-shadow(0 0 14px rgba(34,211,238,0.45))" }}
              >
                ZOYA
              </h1>
              <p className="text-[10px] md:text-[11px] text-white/40 tracking-[0.28em] uppercase font-mono">
                AI Voice Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <Clock />
            <div className="h-8 w-px bg-white/10 hidden sm:block" />
            {/* Chat toggle */}
            <button
              onClick={() => setShowChat(!showChat)}
              className={`relative p-2.5 rounded-full border transition-all duration-300 ${
                showChat
                  ? "bg-violet-500/25 border-violet-400/50 text-violet-200"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:scale-110"
              }`}
              title="Toggle chat history"
            >
              <MessageSquare size={18} />
              {messages.length > 0 && !showChat && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-400 text-[9px] flex items-center justify-center font-semibold shadow shadow-violet-500/40">
                  {messages.length > 9 ? "9+" : messages.length}
                </span>
              )}
            </button>
            {messages.length > 0 && !showChat && (
              <button
                onClick={clearChat}
                className="p-2.5 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
                title="Clear Chat History"
              >
                <Trash2 size={17} className="opacity-70" />
              </button>
            )}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-2.5 rounded-full border transition-all duration-300 ${
                isMuted
                  ? "bg-red-500/15 border-red-400/30 text-red-300"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:scale-110"
              }`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX size={17} className="opacity-80" />
              ) : (
                <Volume2 size={17} className="opacity-70" />
              )}
            </button>
            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 hover:scale-110 transition-all border border-white/10"
              title="Settings"
            >
              <SettingsIcon size={17} className="opacity-70" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Visualizer */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-10 pointer-events-none">
        {/* Left status column */}
        <div className="flex w-[22%] lg:w-[20%] h-full flex-col justify-center gap-4 z-10">
          <div className="flex items-center gap-2">
            <motion.span
              key={appState}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-[11px] md:text-xs font-mono tracking-[0.2em] uppercase px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm text-white/60"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  appState === "listening" ? "bg-violet-400 animate-pulse" :
                  appState === "processing" ? "bg-sky-400 animate-pulse" :
                  appState === "speaking" ? "bg-cyan-400 animate-pulse" :
                  appState === "reconnecting" ? "bg-amber-400 animate-pulse" :
                  "bg-white/40"
                }`}
              />
              {STATUS_LABEL[appState]}
            </motion.span>
          </div>
          <div className="hidden lg:block text-white/25 text-[11px] font-mono leading-relaxed">
            <p>&gt; v1.0 stable</p>
            <p>&gt; voice engine: ok</p>
            <p>&gt; api: {process.env.GEMINI_API_KEY ? "connected" : "no-key"}</p>
          </div>
        </div>

        {/* Center Visualizer */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} analyser={liveAnalyser} outputAnalyser={playbackAnalyser} />
        </div>

        {/* Right status column */}
        <div className="flex w-[22%] lg:w-[20%] h-full flex-col justify-center gap-4 z-10">
          <div className="flex justify-end">
            <div className="text-right text-white/25 text-[11px] font-mono leading-relaxed hidden lg:block">
              <p>&gt; session: {isSessionActive ? "live" : "idle"}</p>
              <p>&gt; mic: {isSessionActive ? "on" : "off"}</p>
              <p>&gt; audio: {isMuted ? "muted" : "on"}</p>
            </div>
          </div>
        </div>
      </main>

      {/* Chat Panel */}
      <ChatPanel
        messages={messages}
        isTyping={appState === "processing"}
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        onClear={clearChat}
      />

      {/* Settings */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-5 md:pb-7 z-20 shrink-0 gap-3">
        <AnimatePresence>
          {showTextInput && (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-1.5 bg-white/[0.06] border border-white/10 rounded-full p-1.5 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Zoya..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={startDictation}
                className={`p-2.5 rounded-full transition-all ${
                  isDictating
                    ? "bg-red-500/30 text-red-300 animate-pulse border border-red-400/50"
                    : "text-white/50 hover:text-white hover:bg-white/10"
                }`}
                title={isDictating ? "Stop listening" : "Speak instead of typing"}
              >
                <Mic size={15} />
              </button>
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="p-2.5 rounded-full bg-gradient-to-tr from-sky-500 to-cyan-400 hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100 transition-all"
              >
                <Send size={15} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="glass rounded-full px-5 md:px-7 py-3 flex items-center gap-4 shadow-2xl shadow-black/50">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-7 md:px-9 py-3.5 md:py-4 rounded-full font-semibold tracking-wide transition-all duration-300 btn-shine
              ${
                isSessionActive
                  ? "bg-gradient-to-tr from-red-500/30 to-rose-500/30 text-red-200 border border-red-400/60 hover:brightness-125"
                  : "bg-gradient-to-tr from-sky-500 to-cyan-400 text-white border border-white/25 hover:brightness-110 hover:scale-105 animate-breathe"
              }
            `}
          >
            {isSessionActive && (
              <span className="absolute inset-0 rounded-full border-2 border-red-400/50 animate-ping-soft" />
            )}
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <span className="relative flex items-center justify-center">
                  <Mic size={20} className="relative" />
                </span>
                <span>Start Session</span>
              </>
            )}
          </button>

          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-110 hover:rotate-6 transition-all"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>

        {/* Developer credit */}
        <div className="flex items-center gap-2 text-[11px] md:text-xs text-white/35">
          <Sparkles size={12} className="text-violet-300/60" />
          <span>
            Developed by{" "}
            <span className="text-gradient-animated font-semibold tracking-wide">Abhay</span>
          </span>
          <span className="text-white/20">•</span>
          <span className="font-mono">v2.0</span>
        </div>
      </footer>
    </div>
  );
}
