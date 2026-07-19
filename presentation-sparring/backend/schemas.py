"""Pydantic request/response models for the sparring API."""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


Difficulty = Literal["easy", "medium", "hard"]
AcademicField = Literal["engineering", "humanities", "natural"]

# 질문 생성과 꼬리질문 흐름에서 사용하는 네 가지 공통 질문 유형
QuestionType = Literal[
    "evidence",
    "counterexample",
    "application",
    "definition",
]

# 일반 답변과 답변 불가 상태를 구분해 프론트 표시 방식을 분리
AnswerStatus = Literal["answered", "unknown"]


class Slide(BaseModel):
    index: int
    text: str


# --- /api/slides/extract ---


class SlideExtractResponse(BaseModel):
    slides: List[Slide]


# --- /api/questions ---


class QuestionRequest(BaseModel):
    script: str
    slides: List[Slide] = Field(default_factory=list)
    persona_id: str
    difficulty: Difficulty = "medium"
    field: Optional[AcademicField] = None

    # 답변 불가 뒤 새 질문을 만들 때 이전 질문의 반복을 방지
    excluded_questions: List[str] = Field(default_factory=list)


class QuestionResponse(BaseModel):
    question: str
    question_type: QuestionType
    targets_slide: Optional[int] = None

    # 질문 문자열만으로는 꼬리질문이 원래 의도를 잃기 쉬우므로,
    # 최초 질문을 만들 때 사용한 내부 평가 맥락도 함께 반환
    question_focus: str = ""
    context_slides: List[int] = Field(default_factory=list)
    expected_answer_points: List[str] = Field(default_factory=list)


# --- /api/evaluate ---


class EvaluateRequest(BaseModel):
    script: str
    slides: List[Slide] = Field(default_factory=list)
    persona_id: str
    question: str

    # 현재 persona의 최초 질문과 최초 질문 유형
    # 꼬리질문이 같은 핵심 주제를 유지하는 기준점으로 사용
    root_question: Optional[str] = None
    root_question_type: Optional[QuestionType] = None

    # 현재 화면에 표시된 질문의 유형
    # 꼬리질문에서 유형이 한 번 전환되면 다음 평가에는 전환된 유형이 들어옴
    question_type: Optional[QuestionType] = None

    # 최초 질문 생성 시 LLM이 정한 내부 평가 맥락
    question_focus: str = ""
    context_slides: List[int] = Field(default_factory=list)
    expected_answer_points: List[str] = Field(default_factory=list)

    answer: str
    turn: int = 0

    # 최초 질문 이후 허용되는 최대 꼬리질문 횟수
    max_turns: int = Field(default=2, ge=0, le=3)

    # 최초 질문에서 선택한 난이도를 평가와 꼬리질문에도 유지
    difficulty: Difficulty = "medium"
    field: Optional[AcademicField] = None

    # STT 오인식 보정에 사용할 발표 관련 용어
    term_hints: List[str] = Field(default_factory=list)

    # 현재 질문의 답변 불가 뒤 제공된 쉬운 재질문 여부 표시
    is_unknown_retry: bool = False


class EvaluateResponse(BaseModel):
    verdict: str
    strengths: str
    gaps: str
    followup: Optional[str] = None

    # 꼬리질문이 생성된 경우 그 질문의 유형을 명시
    # 프론트엔드는 이 값을 다음 평가 요청의 question_type으로 사용
    followup_question_type: Optional[QuestionType] = None

    # 답변 불가 상태에서는 일반 rubric 대신 핵심 보충과 관련 슬라이드를 표시
    answer_status: AnswerStatus = "answered"
    supplement: Optional[str] = None
    related_slides: List[int] = Field(default_factory=list)

    rubric: Dict[str, str] = Field(default_factory=dict)


# --- /api/report ---


class TranscriptTurn(BaseModel):
    persona_id: str
    question: str

    # 이후 리포트에서 유형별 대응 약점을 분석할 수 있도록 보관
    # 기존 저장 데이터 호환을 위해 선택 필드로 둠
    question_type: Optional[QuestionType] = None

    answer: str
    verdict: str = ""
    gaps: str = ""

    # 종합 리포트에서도 답변 불가와 보충 내용을 구분할 수 있게 보관
    answer_status: AnswerStatus = "answered"
    supplement: Optional[str] = None
    related_slides: List[int] = Field(default_factory=list)


# 리포트가 슬라이드/대본 수정을 구체적으로 제안할 때 사용하는 행동 유형
# 자유 서술이 아니라 유형을 고정해 두면 프론트에서 아이콘·필터링이 가능하고,
# LLM이 막연한 조언 대신 실행 가능한 행동 하나를 고르도록 유도할 수 있음
RevisionActionType = Literal[
    "sentence_split",      # 문장 분리 — 한 문장에 여러 정보가 몰린 경우
    "signal_phrase",       # 신호 문장 추가 — "정리하면", "차이점은" 등 구조 안내
    "emphasis_shift",      # 강조 위치 이동 — 핵심을 문장 앞/뒤로 이동
    "term_explanation",    # 용어 설명 추가 — 전문 용어에 쉬운 풀이 덧붙이기
    "other",
]


class Revision(BaseModel):
    """관찰→영향→수정 행동→수정 예시 구조의 개별 코칭 항목."""

    slide_index: Optional[int] = None

    # 대본·답변에서 실제로 관찰된 사실 한 문장 (판단이 아니라 관찰)
    observation: str

    # 그 관찰이 청중 이해에 미치는 영향 한 문장
    impact: str

    action_type: RevisionActionType = "other"

    # 위 네 범주 중 하나를 구체화한 실행 지시 한 문장
    action: str

    # 대본에 실제로 넣을 수 있는 한국어 문장 예시
    example: str


class ReportRequest(BaseModel):
    script: str
    slides: List[Slide] = Field(default_factory=list)
    transcript: List[TranscriptTurn] = Field(default_factory=list)
    field: Optional[AcademicField] = None


class SlideCoverage(BaseModel):
    index: int
    covered: bool
    missing_point: Optional[str] = None


class ReportResponse(BaseModel):
    content_feedback: str
    delivery_feedback: str
    response_feedback: str
    slide_coverage: List[SlideCoverage]
    filler_count: int
    word_count: int

    # 1-4C: 관찰→영향→수정 행동→수정 예시 구조의 구체적 코칭 항목
    # 기존 저장 데이터(localStorage SessionRecord)와의 호환을 위해
    # 기본값을 빈 리스트/빈 문자열로 두어 이전 리포트도 그대로 읽힘
    revisions: List[Revision] = Field(default_factory=list)
    answer_structure_tip: str = ""