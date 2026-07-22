export type PersonaId = 'standard' | 'professor' | 'peer' | 'layperson'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type AcademicField = 'engineering' | 'humanities' | 'natural'
export type QuestionType =
  | 'evidence'
  | 'counterexample'
  | 'application'
  | 'definition'
export type AnswerStatus = 'answered' | 'unknown'
export type QuestionRole = 'root' | 'followup' | 'retry'
export type SpeechInputMode = 'speech' | 'mixed'
export type SpeechMetricConfidence = 'high' | 'medium' | 'low'
export type PaceStatus = 'slow' | 'balanced' | 'fast'
export type VolumeVariationStatus = 'low' | 'moderate' | 'high'
export type FillerCountMode =
  | 'recognized_minimum'
  | 'unavailable'
  | 'legacy_script'

/** 평가 직후 프론트엔드에서 실행할 질문 흐름 구분. */
export type EvaluationNextAction =
  | 'retry_after_unknown'
  | 'ask_followup'
  | 'move_to_new_root'
  | 'finish'

export interface Persona {
  id: PersonaId
  name: string
  emoji: string
  blurb: string
}

export interface Slide {
  index: number
  text: string
}

export interface QuestionResponse {
  question: string
  question_type: QuestionType
  targets_slide: number | null
  question_focus: string
  context_slides: number[]
  expected_answer_points: string[]
}

export interface EvaluateResponse {
  verdict: string
  strengths: string
  gaps: string
  answer_status: AnswerStatus
  rubric: Record<string, string>
  next_action: EvaluationNextAction

  followup: string | null
  followup_question_type: QuestionType | null
  followup_focus: string
  followup_expected_answer_points: string[]

  supplement: string | null
  related_slides: number[]
  retry_question: string | null
  retry_question_type: QuestionType | null
  retry_question_focus: string
  retry_expected_answer_points: string[]
}

/** 답변 한 건에서 수집한 음성 요약 지표. */
export interface SpeechMetrics {
  input_mode: SpeechInputMode

  /** 사용자가 직접 마이크를 켠 구간 수. */
  segment_count: number

  /** 마이크가 켜져 있던 전체 시간 합계. */
  captured_duration_ms: number

  /** VAD에서 실제 발화로 판정한 시간 합계. */
  voiced_duration_ms: number

  /** 첫 유효 발화 구간의 마이크 시작부터 첫 발화까지의 지연. */
  initial_response_latency_ms: number | null

  /** 용어 보정 전 final STT 기준 어절 수. */
  stt_word_count: number

  /** 순수 발화 시간 기준 어절/분. */
  pace_wpm: number | null

  /** 동일 마이크 구간 안의 발화 사이 멈춤 횟수. */
  internal_pause_count: number

  /** 1.5초 이상 내부 멈춤 횟수. */
  long_pause_count: number

  /** 가장 긴 내부 멈춤 길이. */
  longest_pause_ms: number | null

  /** 발화 프레임 안에서의 상대 음량 변화 폭. */
  volume_variation_db: number | null

  /** final STT에서 명확히 남은 강한 필러 최소 횟수. */
  recognized_filler_count: number

  /** 필러 수치가 실제 총횟수가 아닌 인식 하한선임을 나타내는 구분. */
  filler_measurement: 'recognized_minimum'

  /** 측정값 사용 가능성 판단. */
  confidence: SpeechMetricConfidence

  /** 신뢰도 저하 사유. */
  confidence_reasons: string[]
}

export interface TranscriptTurn {
  persona_id: string
  question: string
  question_type?: QuestionType
  question_role?: QuestionRole
  answer: string
  verdict: string
  strengths: string
  gaps: string
  answer_status?: AnswerStatus
  supplement?: string | null
  related_slides?: number[]
  rubric: Record<string, string>

  /** 음성 답변에서만 존재하는 선택 지표. */
  speech_metrics?: SpeechMetrics
}

export interface SpeechSummary {
  measured_answer_count: number
  reliable_answer_count: number
  total_answer_count: number
  total_voiced_duration_ms: number
  session_pace_wpm: number | null
  pace_status: PaceStatus | null
  long_pause_count: number
  longest_pause_ms: number | null
  recognized_filler_count: number
  filler_measurement: 'recognized_minimum'
  average_initial_latency_ms: number | null
  volume_variation_db: number | null
  volume_variation_status: VolumeVariationStatus | null
}

export interface SlideExtractResponse {
  slides: Slide[]
}

export interface SlideCoverage {
  index: number
  covered: boolean
  missing_point: string | null
}

export type RevisionActionType =
  | 'sentence_split'
  | 'signal_phrase'
  | 'emphasis_shift'
  | 'term_explanation'
  | 'other'

export interface Revision {
  slide_index: number | null
  observation: string
  impact: string
  action_type: RevisionActionType
  action: string
  example: string
}

export interface Report {
  content_feedback: string
  delivery_feedback: string
  response_feedback: string
  slide_coverage: SlideCoverage[]
  filler_count: number
  filler_count_mode?: FillerCountMode
  word_count: number
  speech_summary?: SpeechSummary | null
  speech_delivery_feedback?: string
  revisions?: Revision[]
  answer_structure_tip?: string
}

export type Stage = 'setup' | 'spar' | 'report' | 'history'

export interface ChatMessage {
  role: 'question' | 'answer' | 'verdict'
  personaId: PersonaId
  text: string
  questionType?: QuestionType
  rubric?: Record<string, string>
  answerStatus?: AnswerStatus
  supplement?: string | null
  relatedSlides?: number[]
}