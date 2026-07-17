import { Mic, Send, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { evaluateAnswer, fetchQuestion } from '../api'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { buildTermDictionary, correctText } from '../lib/termCorrection'
import { getPersona } from '../personas'
import type {
  AcademicField,
  ChatMessage,
  Difficulty,
  PersonaId,
  QuestionType,
  Slide,
  TranscriptTurn,
} from '../types'

interface Props {
  script: string
  slides: Slide[]
  personaIds: PersonaId[]
  difficulty: Difficulty
  maxTurns: number
  field: AcademicField | null
  onFinish: (transcript: TranscriptTurn[]) => void
}

export default function SparScreen({
  script,
  slides,
  personaIds,
  difficulty,
  maxTurns,
  field,
  onFinish,
}: Props) {
  const [personaIndex, setPersonaIndex] = useState(0)
  const [turn, setTurn] = useState(0)
  const [question, setQuestion] = useState<string | null>(null)
  const [rootQuestion, setRootQuestion] = useState<string | null>(null)

  // 최초 질문 유형은 전체 흐름의 기준점으로 유지하고,
  // 현재 질문 유형은 꼬리질문에서 한 번 전환될 수 있습니다.
  const [rootQuestionType, setRootQuestionType] =
    useState<QuestionType | null>(null)
  const [questionType, setQuestionType] = useState<QuestionType | null>(null)

  // 최초 질문을 만들 때 백엔드가 선택한 자료 맥락을 평가 요청까지 보존합니다.
  const [questionFocus, setQuestionFocus] = useState('')
  const [contextSlides, setContextSlides] = useState<number[]>([])
  const [expectedAnswerPoints, setExpectedAnswerPoints] = useState<string[]>([])

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interim, setInterim] = useState('')

  // 마지막 평가를 먼저 보여준 뒤 사용자가 직접 리포트로 이동하게 합니다.
  const [readyForReport, setReadyForReport] = useState(false)

  const transcriptRef = useRef<TranscriptTurn[]>([])

  // 답변 불가 뒤 같은 persona가 새 질문을 만들 때 이전 질문을 제외합니다.
  const askedQuestionsRef = useRef<Partial<Record<PersonaId, string[]>>>({})

  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 대본과 슬라이드에서 용어 사전을 한 번 만들고 STT 오인식 보정에 재사용합니다.
  const termDict = useMemo(() => buildTermDictionary(script, slides), [script, slides])

  const {
    supported: sttSupported,
    listening,
    micError,
    toggle: toggleMic,
    stop: stopMic,
  } = useSpeechRecognition({
    onFinal: (text) => {
      if (!text) return

      const corrected = correctText(text, termDict)
      setAnswer((previous) =>
        (previous.trim() ? `${previous.trimEnd()} ` : '') + corrected,
      )
    },
    onInterim: setInterim,
  })

  const activePersonaId = personaIds[personaIndex]
  const persona = getPersona(activePersonaId)

  const pushMessage = (message: ChatMessage) => {
    setMessages((previous) => [...previous, message])
  }

  // 각 persona의 최초 질문과 질문 유형을 불러오고 꼬리질문의 기준점으로 보관합니다.
  const loadFirstQuestion = async (targetPersonaIndex: number) => {
    setBusy(true)
    setError(null)

    try {
      const personaId = personaIds[targetPersonaIndex]
      const excludedQuestions = askedQuestionsRef.current[personaId] ?? []
      const response = await fetchQuestion(
        script,
        slides,
        personaId,
        difficulty,
        field,
        excludedQuestions,
      )

      askedQuestionsRef.current[personaId] = [
        ...excludedQuestions,
        response.question,
      ]

      setQuestion(response.question)
      setRootQuestion(response.question)
      setRootQuestionType(response.question_type)
      setQuestionType(response.question_type)
      setQuestionFocus(response.question_focus)
      setContextSlides(response.context_slides)
      setExpectedAnswerPoints(response.expected_answer_points)

      pushMessage({
        role: 'question',
        personaId,
        text: response.question,
        questionType: response.question_type,
      })
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : String(exception))
    } finally {
      setBusy(false)
    }
  }

  // React StrictMode의 개발 환경 이중 실행을 막고 첫 질문을 한 번만 요청합니다.
  useEffect(() => {
    if (startedRef.current) return

    startedRef.current = true
    void loadFirstQuestion(0)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  const submit = async () => {
    if (!question || !answer.trim() || busy || readyForReport) return

    stopMic()
    setInterim('')

    const personaId = activePersonaId
    const currentQuestion = question
    const firstQuestion = rootQuestion ?? currentQuestion

    // 정상적인 질문 응답에는 항상 유형이 포함됩니다.
    // 이전 상태와의 호환을 위해 값이 없으면 정의 확인형으로 처리합니다.
    const firstQuestionType = rootQuestionType ?? questionType ?? 'definition'
    const currentQuestionType = questionType ?? firstQuestionType
    const currentTurn = turn
    const studentAnswer = answer.trim()

    setBusy(true)
    setError(null)

    pushMessage({
      role: 'answer',
      personaId,
      text: studentAnswer,
    })
    setAnswer('')

    try {
      const evaluation = await evaluateAnswer({
        script,
        slides,
        personaId,
        rootQuestion: firstQuestion,
        rootQuestionType: firstQuestionType,
        question: currentQuestion,
        questionType: currentQuestionType,
        questionFocus,
        contextSlides,
        expectedAnswerPoints,
        answer: studentAnswer,
        turn: currentTurn,
        maxTurns,
        difficulty,
        field,
        termHints: termDict,
      })

      const isUnknown = evaluation.answer_status === 'unknown'

      pushMessage({
        role: 'verdict',
        personaId,
        text: isUnknown
          ? `평가: ${evaluation.verdict}`
          : `평가: ${evaluation.verdict}\n✅ ${evaluation.strengths}\n⚠️ ${evaluation.gaps}`,
        rubric: isUnknown ? undefined : evaluation.rubric,
        answerStatus: evaluation.answer_status,
        supplement: evaluation.supplement,
        relatedSlides: evaluation.related_slides,
      })

      transcriptRef.current.push({
        persona_id: personaId,
        question: currentQuestion,
        question_type: currentQuestionType,
        answer: studentAnswer,
        verdict: evaluation.verdict,
        gaps: evaluation.gaps,
        answer_status: evaluation.answer_status,
        supplement: evaluation.supplement,
        related_slides: evaluation.related_slides,
      })

      if (isUnknown && currentTurn < maxTurns) {
        // 같은 질문을 다시 묻지 않고 남은 질문 횟수로 새 핵심 주제를 확인합니다.
        setTurn(currentTurn + 1)
        setQuestion(null)
        setRootQuestion(null)
        setRootQuestionType(null)
        setQuestionType(null)
        setQuestionFocus('')
        setContextSlides([])
        setExpectedAnswerPoints([])

        await loadFirstQuestion(personaIndex)
        return
      }

      if (evaluation.followup) {
        // 핵심 주제와 난이도는 유지하되, 첫 꼬리질문에서는
        // 이해 확인을 위해 인접 질문 유형으로 한 번 전환될 수 있습니다.
        const nextQuestionType =
          evaluation.followup_question_type ?? currentQuestionType

        setQuestion(evaluation.followup)
        setQuestionType(nextQuestionType)
        setTurn(currentTurn + 1)

        pushMessage({
          role: 'question',
          personaId,
          text: evaluation.followup,
          questionType: nextQuestionType,
        })

        setBusy(false)
        return
      }

      // 꼬리질문이 없으면 다음 persona로 이동합니다.
      const nextPersonaIndex = personaIndex + 1

      if (nextPersonaIndex < personaIds.length) {
        setPersonaIndex(nextPersonaIndex)
        setTurn(0)
        setQuestion(null)
        setRootQuestion(null)
        setRootQuestionType(null)
        setQuestionType(null)
        setQuestionFocus('')
        setContextSlides([])
        setExpectedAnswerPoints([])

        await loadFirstQuestion(nextPersonaIndex)
        return
      }

      // 마지막 답변도 화면에서 확인할 수 있도록 자동 이동하지 않습니다.
      setQuestion(null)
      setReadyForReport(true)
      setBusy(false)
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : String(exception))
      setBusy(false)
    }
  }

  const openReport = () => {
    if (!readyForReport || busy) return
    onFinish([...transcriptRef.current])
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Persona banner + progress */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-5 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 select-none items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-lg">
            {persona.emoji}
          </span>
          <div>
            <div className="text-sm font-bold text-slate-800">{persona.name}</div>
            <div className="text-xs text-slate-400">현재 상대 페르소나</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {personaIds.map((personaId, index) => (
            <span
              key={personaId}
              className={
                'h-2 w-8 rounded-full ' +
                (index < personaIndex
                  ? 'bg-indigo-600'
                  : index === personaIndex
                    ? 'animate-pulse bg-indigo-400'
                    : 'bg-slate-200')
              }
              title={getPersona(personaId).name}
            />
          ))}
          <span className="ml-2 text-xs font-semibold text-slate-400">
            {personaIndex + 1} / {personaIds.length}
          </span>
        </div>
      </div>

      {/* Chat log */}
      <div
        ref={scrollRef}
        className="flex h-[420px] flex-col space-y-4 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
      >
        {messages.map((message, index) => {
          const messagePersona = getPersona(message.personaId)

          if (message.role === 'answer') {
            return (
              <div key={index} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">
                  {message.text}
                </div>
              </div>
            )
          }

          if (message.role === 'verdict') {
            const rubricEntries = message.rubric
              ? Object.entries(message.rubric)
              : []
            const relatedSlides = message.relatedSlides ?? []

            return (
              <div key={index} className="flex justify-center">
                <div className="w-full max-w-[90%] space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                  <div className="whitespace-pre-wrap">{message.text}</div>

                  {message.answerStatus === 'unknown' && message.supplement && (
                    <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2.5">
                      <div className="mb-1 text-[11px] font-bold text-indigo-600">
                        핵심 보충
                      </div>
                      <div className="whitespace-pre-wrap text-slate-600">
                        {message.supplement}
                      </div>
                    </div>
                  )}

                  {message.answerStatus === 'unknown' && relatedSlides.length > 0 && (
                    <div className="text-[11px] text-slate-500">
                      관련 발표 자료: {relatedSlides.map((slide) => `${slide}번 슬라이드`).join(', ')}
                    </div>
                  )}

                  {rubricEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {rubricEntries.map(([axis, value]) => (
                        <span
                          key={axis}
                          className={
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                            (value === '우수'
                              ? 'bg-emerald-50 text-emerald-700'
                              : value === '보통'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700')
                          }
                        >
                          {axis} {value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          }

          return (
            <div key={index} className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
                <div className="mb-1 flex items-center gap-1 text-xs font-bold text-indigo-600">
                  <span>{messagePersona.emoji}</span>
                  <span>{messagePersona.name}</span>
                </div>

                <span className="whitespace-pre-wrap text-slate-700">
                  {message.text}
                </span>
              </div>
            </div>
          )
        })}

        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-400 shadow-sm">
              생각 중…
              <div className="flex gap-1">
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-600"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-600"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-600"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
          오류: {error}
        </div>
      )}

      {micError && !readyForReport && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
          {micError}
        </div>
      )}

      {/* Live dictation preview */}
      {listening && !readyForReport && (
        <div className="flex items-center gap-2 text-xs text-indigo-600">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          받아쓰는 중…
          <span className="text-slate-400">{interim || '(말해보세요)'}</span>
        </div>
      )}

      {readyForReport ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 shadow-sm">
          <div>
            <div className="text-sm font-bold text-slate-800">
              모든 질의응답이 완료되었습니다.
            </div>
            <div className="mt-1 text-xs text-slate-500">
              마지막 답변의 피드백을 확인한 뒤 종합 리포트로 이동해 주세요.
            </div>
          </div>

          <button
            type="button"
            onClick={openReport}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
종합 리포트 보기
          </button>
        </div>
      ) : (
        /* Answer input */
        <div className="flex gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          {sttSupported && (
            <button
              type="button"
              data-testid="mic-btn"
              onClick={toggleMic}
              disabled={busy || !question}
              title={listening ? '받아쓰기 중지' : '음성으로 답변 (STT)'}
              className={
                'flex h-auto w-12 shrink-0 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-40 ' +
                (listening
                  ? 'border-rose-300 bg-rose-50 text-rose-500'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-400 hover:text-indigo-600')
              }
            >
              {listening ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          )}

          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy || !question}
            rows={2}
            placeholder={
              sttSupported
                ? '답변을 입력하거나 마이크 버튼으로 말하세요… (Ctrl/⌘ + Enter 로 전송)'
                : '답변을 입력하세요… (Ctrl/⌘ + Enter 로 전송)'
            }
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !question || !answer.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            답변
          </button>
        </div>
      )}
    </div>
  )
}