"""PPTX·PDF 슬라이드 텍스트 추출 라우터."""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

import pdf_extract
import ppt_extract
from schemas import SlideExtractResponse

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

_MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20MB
# Content types tolerated per extension. Browsers/OSes are inconsistent about
# the exact MIME they attach, so "octet-stream"/"" are accepted for both.
_UPLOAD_CONTENT_TYPES = {
    "pptx": {
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/octet-stream",
        "",
    },
    "pdf": {
        "application/pdf",
        "application/x-pdf",
        "application/octet-stream",
        "",
    },
}
_UNSUPPORTED_FORMAT_DETAIL = "지원하지 않는 파일 형식입니다. .pptx 또는 .pdf 파일만 업로드할 수 있습니다."


@router.post("/slides/extract", response_model=SlideExtractResponse)
async def extract_slides_endpoint(file: UploadFile = File(...)):
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "ppt":
        raise HTTPException(
            status_code=400,
            detail="구버전 .ppt 파일은 지원하지 않습니다. PowerPoint에서 .pptx로 저장 후 업로드해주세요.",
        )
    if ext not in _UPLOAD_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=_UNSUPPORTED_FORMAT_DETAIL,
        )

    # 브라우저·운영체제별 MIME 차이를 고려한 실제 파일 데이터 읽기
    content = await file.read()

    # 빈 파일 업로드 방지
    if not content:
        raise HTTPException(
            status_code=400,
            detail="업로드된 파일의 내용이 비어 있습니다.",
        )

    # 업로드 파일 크기 제한
    if len(content) > _MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail="파일 크기가 20MB를 초과합니다.",
        )

    extractor = pdf_extract if ext == "pdf" else ppt_extract
    label = "PDF" if ext == "pdf" else "PPT"
    try:
        slides = extractor.extract_slides(content)
    except Exception:  # noqa: BLE001
        logger.exception("%s extraction failed for %s", label, filename)
        raise HTTPException(
            status_code=400,
            detail=f"{label} 파일을 읽는 중 오류가 발생했습니다. 파일이 손상되지 않았는지 확인해주세요.",
        )

    return SlideExtractResponse(slides=slides)

