"""종합 리포트 라우터."""

from fastapi import APIRouter

from schemas import ReportRequest, ReportResponse
from services.report_service import build_report

router = APIRouter(prefix="/api")


@router.post("/report", response_model=ReportResponse)
def report(req: ReportRequest) -> ReportResponse:
    return build_report(req)