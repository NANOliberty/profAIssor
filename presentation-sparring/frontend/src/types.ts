export type PersonaId = 'standard' | 'professor' | 'peer' | 'layperson'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type AcademicField = 'engineering' | 'humanities' | 'natural'

export type QuestionType =
  | 'evidence'
  | 'counterexample'
  | 'application'
  | 'definition'

export type AnswerStatus = 'answered' | 'unknown'

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
  followup: string | null
  followup_question_type: QuestionType | null
  answer_status: AnswerStatus
  supplement: string | null
  related_slides: number[]
  rubric: Record<string, string>
}

export interface TranscriptTurn {
  persona_id: string
  question: string
  question_type?: QuestionType
  answer: string
  verdict: string
  gaps: string
  answer_status?: AnswerStatus
  supplement?: string | null
  related_slides?: number[]
}

export interface SlideExtractResponse {
  slides: Slide[]
}

export interface SlideCoverage {
  index: number
  covered: boolean
  missing_point: string | null
}

export interface Report {
  content_feedback: string
  delivery_feedback: string
  response_feedback: string
  slide_coverage: SlideCoverage[]
  filler_count: number
  word_count: number
}

export type Stage = 'setup' | 'spar' | 'report' | 'history'

/** A message rendered in the chat-style spar screen. */
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