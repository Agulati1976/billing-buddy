import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Minimal typings for the Web Speech API (not in lib.dom by default)
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInputOptions {
  lang?: string;
  onResult?: (text: string, isFinal: boolean) => void;
}

export function useVoiceInput({ lang = "en-IN", onResult }: UseVoiceInputOptions = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      try { recRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  const start = useCallback(async () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      toast.error("Voice search not supported in this browser");
      return;
    }
    // Request microphone access as a runtime permission prompt where supported
    // (Capacitor WebView / some browsers won't prompt from SpeechRecognition alone)
    const md = (typeof navigator !== "undefined" ? (navigator as unknown as { mediaDevices?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> } }).mediaDevices : undefined);
    if (md?.getUserMedia) {
      try {
        const probeStream = await md.getUserMedia({ audio: true });
        // Release immediately so we don't hold the mic; SpeechRecognition opens its own stream.
        probeStream.getTracks().forEach((t) => t.stop());
      } catch {
        toast.error("Microphone permission denied");
        return;
      }
    }

    try {
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        const text = (final || interim).trim();
        if (text) onResult?.(text, !!final);
      };
      rec.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          toast.error("Microphone permission denied");
        } else if (ev.error !== "aborted" && ev.error !== "no-speech") {
          toast.error(`Voice error: ${ev.error}`);
        }
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch (err) {
      console.error(err);
      toast.error("Could not start voice input");
      setListening(false);
    }
  }, [lang, onResult]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, supported, start, stop, toggle };
}
