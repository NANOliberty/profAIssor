"""공개 페르소나 목록 라우터. 백엔드에서 통합적으로 관리하도록 수정함"""

from typing import List

from fastapi import APIRouter

from personas import list_personas
from schemas import PersonaSummary

router = APIRouter(prefix="/api", tags=["personas"])


@router.get(
    "/personas",
    response_model=List[PersonaSummary],
)
def get_personas() -> List[PersonaSummary]:
    """프론트 표시용 페르소나 목록 조회."""
    return [
        PersonaSummary(**persona)
        for persona in list_personas()
    ]