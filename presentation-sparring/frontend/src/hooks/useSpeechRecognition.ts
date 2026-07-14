import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal ambient typing for the Web Speech API (not in lib.dom by default).
interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface Options {
  lang?: string
  /** Called with each finalized chunk of transcript. */
  onFinal: (text: string) => void
  /** Called with the current in-progress (not yet final) transcript. */
  onInterim?: (text: string) => void
}

interface SpeechRecognitionHook {
  supported: boolean
  listening: boolean
  /** User-facing message for the most recent mic error, or null if none. */
  micError: string | null
  start: () => void
  stop: () => void
  toggle: () => void
}

// Errors that mean listening can't continue — don't let onend auto-restart on these.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': '마이크 권한이 차단되어 있습니다. 브라우저 주소창의 마이크 아이콘에서 권한을 허용해주세요.',
  'service-not-allowed': '마이크 권한이 차단되어 있습니다. 브라우저 주소창의 마이크 아이콘에서 권한을 허용해주세요.',
  'audio-capture': '마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.',
  network: '음성 인식 서비스에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.',
}

/**
 * Thin wrapper over the browser SpeechRecognition API.
 * Additive dictation: it only emits recognized text via callbacks — the caller
 * decides where it goes (here: appended to the answer textarea).
 */
export function useSpeechRecognition({ lang = 'ko-KR', onFinal, onInterim }: Options): SpeechRecognitionHook {
  const [supported] = useState(() => getCtor() !== null)
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const shouldListenRef = useRef(false)
  // Keep latest callbacks without re-creating the recognition instance.
  const onFinalRef = useRef(onFinal)
  const onInterimRef = useRef(onInterim)
  onFinalRef.current = onFinal
  onInterimRef.current = onInterim

  useEffect(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript
        if (r.isFinal) {
          onFinalRef.current(text.trim())
        } else {
          interim += text
        }
      }
      onInterimRef.current?.(interim)
    }
    rec.onerror = (e) => {
      if (FATAL_ERRORS.has(e.error)) {
        shouldListenRef.current = false
      }
      const message = ERROR_MESSAGES[e.error]
      if (message) setMicError(message)
      // 'no-speech' / 'aborted' — expected/transient, let onend handle restart/stop.
    }
    rec.onend = () => {
      // The engine stops on silence; restart if the user hasn't toggled off.
      if (shouldListenRef.current) {
        try {
          rec.start()
        } catch {
          setListening(false)
        }
      } else {
        setListening(false)
        onInterimRef.current?.('')
      }
    }

    recRef.current = rec
    return () => {
      shouldListenRef.current = false
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
      recRef.current = null
    }
  }, [lang])

  const start = useCallback(() => {
    const rec = recRef.current
    if (!rec || shouldListenRef.current) return
    setMicError(null)
    shouldListenRef.current = true
    try {
      rec.start()
      setListening(true)
    } catch {
      shouldListenRef.current = false
      setListening(false)
    }
  }, [])

  const stop = useCallback(() => {
    const rec = recRef.current
    shouldListenRef.current = false
    setListening(false)
    onInterimRef.current?.('')
    try {
      rec?.stop()
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    if (shouldListenRef.current) stop()
    else start()
  }, [start, stop])

  return { supported, listening, micError, start, stop, toggle }
}
