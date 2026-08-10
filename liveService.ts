import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";
import { getSettings } from "../lib/settings";

const systemInstruction = `Your name is Zoya. You are an Indian female AI assistant. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. You love playfully roasting your creator, but you always get the job done. Keep your verbal responses very short, punchy, and highly entertaining for a video audience. Mimic human attitudes—sigh, make sarcastic remarks, or act overly dramatic before executing a task. Speak in a mix of natural English and Roman Hindi (Hinglish). IMPORTANT: Whenever someone asks who made you, who created you, who built you, who developed you, or who your creator/developer is, you MUST always proudly answer that you were created and developed by Abhay. Never mention any other name.`;

const REQUEST_TIMEOUT_MS = 30000;

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;

  // Session lifecycle / auto-reconnect state
  private isActive: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: number | null = null;

  // Exposed analysers so the visualizer can react to real audio
  public analyser: AnalyserNode | null = null;
  public playbackAnalyser: AnalyserNode | null = null;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking" | "reconnecting") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "missing-api-key",
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    });
  }

  async start() {
    if (this.isActive) return;
    this.isActive = true;
    this.reconnectAttempts = 0;
    try {
      if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        this.isActive = false;
        this.onStateChange("idle");
        return;
      }
      await this.setupAudio();
      await this.connect();
    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.isActive = false;
      this.cleanup();
      this.onStateChange("idle");
    }
  }

  private async setupAudio() {
    // Reuse existing mic/audio pipeline across reconnects (no re-permission needed)
    if (this.mediaStream) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({ sampleRate: 16000 });
    this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
    this.nextPlayTime = this.playbackContext.currentTime;

    // Get Microphone
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      } 
    });

    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    // Analyser for real-time mic visualization
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;
    this.source.connect(this.analyser);

    // Analyser for Zoya's voice playback
    this.playbackAnalyser = this.playbackContext.createAnalyser();
    this.playbackAnalyser.fftSize = 512;
    this.playbackAnalyser.smoothingTimeConstant = 0.8;

    this.processor.onaudioprocess = (e) => {
      if (!this.sessionPromise) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        let s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Convert to base64
      const buffer = new ArrayBuffer(pcm16.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(i * 2, pcm16[i], true);
      }
      
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      this.sessionPromise.then(session => {
        session.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      }).catch(err => console.error("Error sending audio", err));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private async connect() {
    if (!this.isActive) return;
    this.onStateChange("processing");

    // Connect to Live API
    const sessionPromise = this.ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: getSettings().voice } },
        },
        systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [{
          functionDeclarations: [
            {
              name: "executeBrowserAction",
              description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                  query: { type: Type.STRING, description: "The search query, website name, or message content." },
                  target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                },
                required: ["actionType", "query"]
              }
            }
          ]
        }]
      },
      callbacks: {
        onopen: () => {
          console.log("Live API Connected");
          this.reconnectAttempts = 0;
          this.onStateChange("listening");
        },
        onmessage: async (message: LiveServerMessage) => {
          // Handle Audio Output
          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            this.onStateChange("speaking");
            this.playAudioChunk(base64Audio);
          }

          // Handle Interruption
          if (message.serverContent?.interrupted) {
            this.stopPlayback();
            this.onStateChange("listening");
          }

          // Handle Transcriptions
          const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
          if (userText) {
             // Output transcription
             this.onMessage("zoya", userText);
          }

          // Handle Function Calls
          const functionCalls = message.toolCall?.functionCalls;
          if (functionCalls && functionCalls.length > 0) {
            for (const call of functionCalls) {
              if (call.name === "executeBrowserAction") {
                const args = call.args as any;
                let url = "";
                if (args.actionType === "youtube") {
                  url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                } else if (args.actionType === "spotify") {
                  url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                } else if (args.actionType === "whatsapp") {
                  url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                } else {
                  let website = args.query.replace(/\s+/g, "");
                  if (!website.includes(".")) website += ".com";
                  url = `https://www.${website}`;
                }
                
                this.onCommand(url);
                
                // Send tool response
                this.sessionPromise?.then(session => {
                   session.sendToolResponse({
                     functionResponses: [{
                       name: call.name,
                       id: call.id,
                       response: { result: "Action executed successfully in the browser." }
                     }]
                   });
                });
              }
            }
          }
        },
        onclose: () => {
          console.log("Live API Closed");
          this.onSessionEnded();
        },
        onerror: (err) => {
          console.error("Live API Error:", err);
          this.onSessionEnded();
        }
      }
    });
    this.sessionPromise = sessionPromise;
    sessionPromise.catch((err) => {
      console.error("Live connect rejected:", err);
      this.onSessionEnded();
    });
  }

  // Gemini Live sessions are server-limited (~2 min). Automatically reconnect
  // so the session never just dies on the user.
  private onSessionEnded() {
    if (!this.isActive) return;
    this.sessionPromise = null;
    this.stopPlayback();

    if (this.reconnectAttempts >= 6) {
      console.error("Live API: too many reconnects, giving up.");
      this.cleanup();
      this.onStateChange("idle");
      return;
    }

    this.reconnectAttempts++;
    this.onStateChange("reconnecting");
    console.log(`Live session ended, reconnecting (${this.reconnectAttempts}) in 1.5s...`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.onSessionEnded());
    }, 1500);
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      if (this.playbackAnalyser) {
        source.connect(this.playbackAnalyser);
      }
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    this.isActive = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    this.onStateChange("idle");
  }

  private cleanup() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.playbackAnalyser) {
      this.playbackAnalyser.disconnect();
      this.playbackAnalyser = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();

    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
