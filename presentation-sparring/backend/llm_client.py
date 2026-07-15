"""LLM provider abstraction.

LLM_PROVIDER 환경변수로 openai, gemini, mock 중 하나를 선택
각 provider는 하나의 모델 설정만 사용하며, persona별 모델 티어 라우팅은 사용하지 않음
"""

import json
import os
import re
from typing import Optional

import requests


PROVIDER = os.getenv("LLM_PROVIDER", "mock").lower()

# provider별로 하나의 모델만 사용하며, persona는 프롬프트만 변경할 예정
_MODEL_CONFIG = {
    "openai": {
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "url": "https://api.openai.com/v1/chat/completions",
    },
    "gemini": {
        "model": os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        "url": "https://generativelanguage.googleapis.com/v1beta/models",
    },
    "mock": {
        "model": "mock",
    },
}

_TIMEOUT = 60


def _resolve_model(provider: str, model_hint: Optional[str] = None) -> str:
    """선택한 provider의 단일 모델명을 반환

    model_hint는 기존 main.py 호출부와의 호환성을 위해 받지만,
    모델 선택에는 사용하지 않음
    """
    _ = model_hint
    return _MODEL_CONFIG.get(provider, {}).get("model", "")


def _call_openai(system: str, user: str, model: str) -> str:
    """OpenAI Chat Completions API를 호출하고 응답 텍스트를 반환"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    response = requests.post(
        _MODEL_CONFIG["openai"]["url"],
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.7,
        },
        timeout=_TIMEOUT,
    )
    response.raise_for_status()

    data = response.json()
    return data["choices"][0]["message"]["content"]


def _call_gemini(system: str, user: str, model: str) -> str:
    """Gemini generateContent API를 호출하고 응답 텍스트를 반환"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    url = (
        f"{_MODEL_CONFIG['gemini']['url']}/"
        f"{model}:generateContent?key={api_key}"
    )

    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json={
            "system_instruction": {
                "parts": [{"text": system}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user}],
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
            },
        },
        timeout=_TIMEOUT,
    )
    response.raise_for_status()

    data = response.json()
    parts = data["candidates"][0]["content"]["parts"]
    return "".join(part.get("text", "") for part in parts)


def _call_mock(system: str, user: str, model: str) -> str:
    """API 키 없이 전체 흐름을 검사할 수 있는 고정 JSON 응답을 반환"""
    _ = model

    if '"targets_slide"' in system:
        return json.dumps(
            {
                "question": (
                    "발표에서 제시한 핵심 주장의 근거가 명확하지 않은데, "
                    "그 주장을 뒷받침하는 구체적인 데이터나 사례가 있나요?"
                ),
                "targets_slide": 1,
            },
            ensure_ascii=False,
        )

    if '"verdict"' in system and '"followup"' in system:
        followup = None
        if "현재 턴: 0" in user:
            followup = (
                "방금 언급한 근거가 실제로 그 결론으로 이어지는지, "
                "논리 단계를 하나씩 설명해 주시겠어요?"
            )

        return json.dumps(
            {
                "verdict": "질문에 부분적으로 답했으나 근거 제시가 부족합니다.",
                "strengths": "핵심 개념을 이해하고 답변의 방향은 맞습니다.",
                "gaps": "구체적 근거와 예시가 부족해 설득력이 약합니다.",
                "followup": followup,
                "rubric": {
                    "직접성": "보통",
                    "근거": "부족",
                    "논리": "보통",
                },
            },
            ensure_ascii=False,
        )

    return json.dumps(
        {
            "content_feedback": (
                "핵심 주장은 있으나 근거의 구체성이 부족합니다. "
                "데이터나 사례로 보강하세요."
            ),
            "delivery_feedback": (
                "전달 구조는 무난하나 전문 용어에 대한 쉬운 설명이 필요합니다."
            ),
            "response_feedback": (
                "질문의 의도를 파악하는 능력은 좋으나, "
                "압박 질문에서 근거로 방어하는 훈련이 필요합니다."
            ),
            "slide_coverage": [],
        },
        ensure_ascii=False,
    )


_DISPATCH = {
    "openai": _call_openai,
    "gemini": _call_gemini,
    "mock": _call_mock,
}


def chat(
    system: str,
    user: str,
    model_hint: Optional[str] = None,
) -> str:
    """설정된 provider에 요청을 보내고 원문 텍스트를 반환"""
    provider_call = _DISPATCH.get(PROVIDER)
    if provider_call is None:
        raise RuntimeError(
            f"Unknown LLM_PROVIDER={PROVIDER!r}. "
            "Use openai|gemini|mock."
        )

    model = _resolve_model(PROVIDER, model_hint)
    return provider_call(system, user, model)


def chat_json(
    system: str,
    user: str,
    model_hint: Optional[str] = None,
) -> dict:
    """LLM 응답에서 JSON 객체를 추출해 반환"""
    raw_response = chat(system, user, model_hint)
    return extract_json(raw_response)


def extract_json(text: str) -> dict:
    """코드 블록이나 설명이 섞인 응답에서 첫 JSON 객체를 추출"""
    normalized = text.strip()

    # ```json ... ``` 형태의 코드 블록을 우선 제거
    fenced_json = re.search(
        r"```(?:json)?\s*(.*?)```",
        normalized,
        re.DOTALL,
    )
    if fenced_json:
        normalized = fenced_json.group(1).strip()

    try:
        return json.loads(normalized)
    except json.JSONDecodeError:
        pass

    # JSON 바깥에 설명이 붙은 경우 가장 바깥쪽 객체를 다시 시도
    json_object = re.search(r"\{.*\}", normalized, re.DOTALL)
    if json_object:
        return json.loads(json_object.group(0))

    raise ValueError(
        "Could not parse JSON from LLM response: "
        f"{normalized[:200]}"
    )