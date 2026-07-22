"""답변 평가 라우터."""

from fastapi import APIRouter

from schemas import EvaluateRequest, EvaluateResponse
from services.evaluation_service import evaluate_answer

router = APIRouter(prefix="/api")


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    return evaluate_answer(req)