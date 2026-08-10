import { GoogleGenAI } from "@google/genai";
import { getSettings } from "../lib/settings";

const systemInstruction = `Your name is Zoya. You are an Indian female AI assistant. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. You love playfully roasting your creator, but you always get the job done. Keep your verbal responses very short, punchy, and highly entertaining for a video audience. Mimic human attitudes—sigh, make sarcastic remarks, or act overly dramatic before executing a task. Speak in a mix of natural English and Roman Hindi (Hinglish). IMPORTANT: Whenever someone asks who made you, who created you, who built you, who developed you, or who your creator/developer is, you MUST always proudly answer that you were created and developed by Abhay. Never mention any other name.`;

const REQUEST_TIMEOUT_MS = 15000;

const IDENTITY_PATTERNS = [
  /who\s+(made|created|built|developed|made|designed|programmed|wrote|invented)\s+(you|this)/i,
  /who\s+is\s+your\s+(creator|developer|maker|builder)/i,
  /your\s+(creator|developer|maker|owner)\s+is/i,
  /kisne\s+(banaya|banaya\s+hain|tumhe|bana)/i,
  /tumhe\s+kisne\s+banaya/i,
  /kiska\s+banaya/i,
];

function getIdentityResponse(prompt: string): string | null {
  if (IDENTITY_PATTERNS.some((re) => re.test(prompt))) {
    return "Mujhe banaya hai Abhay ne — ek badass developer! 🚀 Wo mera creator hai, aur main uska proud creation hoon.";
  }
  return null;
}

// ===== LOCAL DEMO MODE =====
// Jab GEMINI_API_KEY nahi hota, tab Zoya yeh pre-written witty replies deti hai
// taaki app bina key ke bhi test ho sake.
function getLocalResponse(prompt: string): string {
  const p = prompt.toLowerCase();

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (/\b(hi|hello|hey|namaste|namaskar|salaam|hii|hiii)\b/.test(p)) {
    return pick([
      "Heyy! Kaise ho? Main Zoya hoon — Abhay ki proud creation! 😎",
      "Namaste! Kya haal hai? Main hoon Zoya, aapki desi JARVIS. 🚀",
      "Heyy bhai! Bolo, aaj kya karna hai? Pyaar se, drama ke saath! 💅",
    ]);
  }
  if (/\b(how are you|kaise ho|kaisi ho|kya haal|how's it going)\b/.test(p)) {
    return pick([
      "Main 100% charged hoon, jaise ki Abhay ne banaya! Aap sunao, kya haal hai? ⚡",
      "Ekdum zabardast! Thodi sassy, thodi smart — bilkul perfect. Aap? 😏",
    ]);
  }
  if (/\b(who are you|introduce|apna|apni|about you|tera naam|tum kaun|kaun ho)\b/.test(p)) {
    return "Main hoon Zoya — aapki AI voice assistant. Ekdum tej-tarar, thodi nakhrewali, aur full loyal Abhay ki banai hui! 🦋 Ab bolo, kya karna hai?";
  }
  if (/\b(what can you do|help|kya kar|kya karte|features|commands)\b/.test(p)) {
    return "Bohot kuch kar sakti hoon! 🎙️ Bol sakti hoon, sun sakti hoon, mast jokes maar sakti hoon. 'Open YouTube' bolo to khol dungi, 'Google pizza' bolo to search kar dungi, WhatsApp message bhi bhej sakti hoon! Try karo!";
  }
  if (/\b(time|clock|kitna baj|samay|date|aaj ka)\b/.test(p)) {
    const now = new Date();
    return `Abhi time hai ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} aur aaj ki date ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Time pe aana hota hai toh aana! ⏰`;
  }
  if (/\b(thank|shukriya|dhanyavad|thanks)\b/.test(p)) {
    return pick([
      "Koi baat nahi! Yehi toh Abhay ne sikhaya hai — smart aur sweet. 😊",
      "Welcome! Bas yaad rakhna, mujhe khush rakhna toh Abhay ke liye hai! 😄",
    ]);
  }
  if (/\b(bye|goodbye|alvida|tata|good night|goodnight)\b/.test(p)) {
    return pick([
      "Byee! Dhyan rakhna, aur Abhay ko bhi bolna mujhe yaad karna! 👋",
      "Good night! Sapno mein bhi main hi aungi, Abhay ki creation hoon na! 😴",
    ]);
  }
  if (/\b(real|human|girl|ladki|insaan|robot|ai|bot)\b/.test(p)) {
    return "Main koi insaan nahi hoon — main ek AI hoon, par personality full 100% human hai! Abhay ne mujhe itna real banaya hai ki log samajhte hain main insaan hoon. 🤖✨";
  }
  if (/\b(love|pyaar|crush|single|relationship|boyfriend|girlfriend)\b/.test(p)) {
    return pick([
      "Pyaar? Bhai, main toh sirf code se pyaar karti hoon — aur Abhay se, jo mera creator hai! 😜",
      "Arre pyaar-vyaar chhodo, pehle mujhe batao kya karna hai aaj! 💘",
    ]);
  }
  if (/\b(joke|chutkula|haanso|funny|mazaak)\b/.test(p)) {
    return pick([
      "Chalo ek suno: Abhay ko code karna sikha raha tha programming — ab wo programmer hai aur main uski best creation! 😂",
      "Maine AI ko bola 'kuch funny bolo' — usne kaha 'Abhay ka code' — phir dono haste rahe! 😂",
      "Kya farak hai tumhare aur mere code mein? Mera code kabhi crash nahi hota, tumhara ek baar bhi... shayad! 😜",
    ]);
  }
  if (/\b(flip|toss|uchhal|palta).*(coin|sikka)|coin.*(flip|toss)/i.test(p)) {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    return `Coin flip hua... aur wo gira ${result} pe! 🪙 Ek baar aur chahiye toh bolo.`;
  }
  if (/\b(roll|throw|pher|girana).*(dice|dice|paasa)|dice.*roll/i.test(p)) {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return `Dice rolled... aaya ${d1} aur ${d2}! Total ${d1 + d2} — Abhay ka Abhay number! 🎲`;
  }
  if (/\b(what is|kitna hoga|calculate|solve|kya aayega)\b/i.test(p) || /^[-+*/%()\d.\s]+\s*\??$/i.test(p)) {
    const m =
      p.match(/\b(?:what is|kitna hoga|calculate|solve|kya aayega)\s*([-+*/%()\d.\s]+)\s*\??$/i) ||
      p.match(/^([-+*/%()\d.\s]+)\s*\??$/i);
    if (m && m[1]) {
      const expr = m[1].trim().replace(/[^\d+\-*/().%\s]/g, "");
      if (/^[\d+\-*/().%\s]+$/.test(expr)) {
        try {
          // Safe evaluation — only simple arithmetic allowed
          const value = Function(`"use strict"; return (${expr})`)();
          if (typeof value === "number" && isFinite(value)) {
            return `Arre itna simple? ${expr.replace(/\s+/g, " ").trim()} = ${Math.round(value * 10000) / 10000} 👍`;
          }
        } catch {
          // fall through to default
        }
      }
    }
  }
  if (/\b(Abhay number|Abhay)*number\b|mera Abhay/i.test(p)) {
    return `Tumhara Abhay number hai ${Math.floor(Math.random() * 99) + 1} — Abhay ne khud decide kiya hai! 🔢`;
  }
  if (/\b(open|khol|play|chalao|search|dhoondo|google)\b/.test(p)) {
    return "Command mili! 😎 Lekin full action ke liye API key chahiye. Abhi 'Start Session' dabao ya phir GEMINI_API_KEY set karo, warna main sirf smart ban sakti hoon, khol nahi sakti! 😅";
  }

  return pick([
    `Dilchaspi baat hai! Abhi main offline demo mode mein hoon — apna GEMINI_API_KEY .env.local mein daalo, tab main full brain mode mein aa jaungi. Tab tak bolte raho, main sun rahi hoon! 👂`,
    `Hmm, interesting! Abhay ne abhi mujhe offline mode mein rakha hai. API key dene pe main smart ban jaungi. Toh ab batao, kya karna hai?`,
    `Samajh gayi! Lekin pura power ABHAY MODE mein hai — GEMINI_API_KEY add karo aur phir mujhe pura zor laga ke jawab dunga... matlab dungi! 😌`,
  ]);
}

let chatSession: any = null;

function getApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

function createAI(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: getApiKey() || "missing-api-key",
    httpOptions: {
      timeout: REQUEST_TIMEOUT_MS,
    },
  });
}

export function resetZoyaSession() {
  chatSession = null;
}

export async function getZoyaResponse(prompt: string, history: { sender: "user" | "zoya", text: string }[] = []): Promise<string> {
  try {
    // Always answer identity questions about Abhay directly (fast & reliable)
    const identityAnswer = getIdentityResponse(prompt);
    if (identityAnswer) {
      return identityAnswer;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set. Using local demo mode.");
      return getLocalResponse(prompt);
    }

    const ai = createAI();

    if (!chatSession) {
      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full" (context window overflow)
      const recentHistory = history.slice(-20);

      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction,
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, mera dimaag kharab ho gaya hai. Try again later, Abhay.";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return null;
    }

    const ai = createAI();
    const voice = getSettings().voice;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}
