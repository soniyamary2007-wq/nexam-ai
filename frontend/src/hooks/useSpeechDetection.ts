import { useEffect, useRef } from 'react';

const STOP = new Set(['the','and','that','this','with','from','have','which','what','when','where','will','would','could','should','their','there','about','into','than','then','them','these','those','been','were','your','also','only','each','does','following','correct','answer','option','question']);

export function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !STOP.has(w))
  );
}

type Opts = {
  enabled: boolean;
  keywords: Set<string>;          // for the CURRENT question
  questionKey: number | string;   // changes per question -> resets counter
  onWarning: (snippet: string) => void;
  threshold?: number;             // default 5
};

export function useSpeechDetection({ enabled, keywords, questionKey, onWarning, threshold = 5 }: Opts) {
  const kwRef = useRef(keywords);
  const cbRef = useRef(onWarning);
  const countRef = useRef(0);
  const heardRef = useRef<string[]>([]);

  kwRef.current = keywords;
  cbRef.current = onWarning;

  useEffect(() => {
    countRef.current = 0;
    heardRef.current = [];
  }, [questionKey]);

  useEffect(() => {
    if (!enabled) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { console.warn('Speech recognition not supported in this browser'); return; }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    let stopped = false;

    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const transcript: string = e.results[i][0].transcript;
        const words = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
        for (const w of words) {
          if (kwRef.current.has(w)) {
            countRef.current += 1;
            heardRef.current.push(w);
            if (countRef.current >= threshold) {
              cbRef.current(heardRef.current.join(', '));
              countRef.current = 0;
              heardRef.current = [];
            }
          }
        }
      }
    };
    rec.onend = () => { if (!stopped) { try { rec.start(); } catch {} } }; // Chrome stops on silence; restart
    rec.onerror = (e: any) => console.warn('Speech error', e.error);

    try { rec.start(); } catch {}
    return () => { stopped = true; try { rec.stop(); } catch {} };
  }, [enabled, threshold]);
}