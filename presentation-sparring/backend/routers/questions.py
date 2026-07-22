"""질문 생성 라우터."""

from fastapi import APIRouter

from schemas import QuestionRequest, QuestionResponse
from services.question_service import generate_question

router = APIRouter(prefix="/api")


@router.post("/questions", response_model=QuestionResponse)
def questions(req: QuestionRequest) -> QuestionResponse:
    return generate_question(req)