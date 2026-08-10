import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bot, User, Trash2, Check, Copy, Download } from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "zoya";
  text: string;
  time?: number;
}

interface ChatPanelProps {
  messages: Message[];
  isTyping: boolean;
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
}

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition-colors"
      title="Copy message"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

export default function ChatPanel({ messages, isTyping, isOpen, onClose, onClear }: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute top-20 right-3 md:top-24 md:right-4 bottom-20 md:bottom-24 z-30 w-[90vw] max-w-[380px] flex flex-col rounded-3xl border border-white/10 bg-[#08080f]/80 backdrop-blur-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.03] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Bot size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Chat with Zoya</p>
                <p className="text-[11px] text-emerald-400/80 flex items-center gap-1 leading-tight">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  AI Assistant Online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    const lines = messages.map((m) => `${m.sender === "zoya" ? "Zoya" : "You"} (${formatTime(m.time)}): ${m.text}`).join("\n");
                    const blob = new Blob([`Zoya AI Voice Assistant - Developed by Abhay\n\n${lines}`], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "zoya-chat.txt";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="p-2 rounded-lg text-white/50 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                  title="Export chat"
                >
                  <Download size={16} />
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={onClear}
                  className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Clear chat"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                title="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto slim-scrollbar px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-60">
                <div className="w-14 h-14 rounded-full border border-white/15 flex items-center justify-center">
                  <Bot size={24} className="text-violet-300" />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">Koi baat nahi hui abhi tak</p>
                  <p className="text-white/40 text-xs mt-1">Mic dabao ya text likho — Zoya ready hai!</p>
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`group flex items-start gap-2 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.sender === "user"
                        ? "bg-gradient-to-br from-sky-500 to-cyan-400"
                        : "bg-gradient-to-br from-cyan-400 to-violet-500"
                    }`}
                  >
                    {msg.sender === "user" ? <User size={13} className="text-white" /> : <Bot size={13} className="text-white" />}
                  </div>
                  <div
                    className={`relative max-w-[78%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                      msg.sender === "user"
                        ? "bg-gradient-to-br from-sky-500/20 to-cyan-400/10 border border-sky-400/20 text-sky-100 rounded-tr-sm"
                        : "bg-white/[0.06] border border-white/10 text-white/90 rounded-tl-sm"
                    }`}
                  >
                    <p>{msg.text}</p>
                    <div className={`mt-1.5 flex items-center gap-1.5 ${msg.sender === "user" ? "justify-end" : "justify-between"}`}>
                      <span className="text-[9px] text-white/30 font-mono">{formatTime(msg.time)}</span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton text={msg.text} />
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center shrink-0">
                  <Bot size={13} className="text-white" />
                </div>
                <div className="bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                      className="w-1.5 h-1.5 rounded-full bg-violet-300"
                    />
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={endRef} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
