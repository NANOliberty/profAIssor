"""답변별 음성 지표의 세션 집계와 결정론적 코칭 생성."""

from typing import List, Optional, Tuple

from schemas import (
    SpeechMetrics,
    SpeechSummary,
    TranscriptTurn,
)

PACE_SLOW_MAX = 90.0
PACE_FAST_MIN = 160.0
VOLUME_LOW_MAX_DB = 4.0
VOLUME_HIGH_MIN_DB = 10.0
MIN_VOLUME_VOICED_MS = 8_000


def _round_optional(value: Optional[float], digits: int = 1) -> Optional[float]:
    """선택 수치의 제한 자릿수 반올림."""
    if value is None:
        return None
    return round(value, digits)


def _pace_status(pace_wpm: Optional[float]):
    """세션 말 빠르기 상태 판정."""
    if pace_wpm is None:
        return None
    if pace_wpm < PACE_SLOW_MAX:
        return "slow"
    if pace_wpm >= PACE_FAST_MIN:
        return "fast"
    return "balanced"


def _volume_status(volume_variation_db: Optional[float]):
    """세션 내 상대 음량 변화 상태 판정."""
    if volume_variation_db is None:
        return None
    if volume_variation_db < VOLUME_LOW_MAX_DB:
        return "low"
    if volume_variation_db >= VOLUME_HIGH_MIN_DB:
        return "high"
    return "moderate"


def build_speech_summary(
    transcript: List[TranscriptTurn],
) -> Optional[SpeechSummary]:
    """음성 지표가 존재하는 답변의 세션 단위 가중 집계."""
    measured: List[SpeechMetrics] = [
        turn.speech_metrics
        for turn in transcript
        if turn.speech_metrics is not None
    ]
    if not measured:
        return None

    reliable = [
        metric
        for metric in measured
        if metric.confidence != "low"
        and metric.voiced_duration_ms > 0
    ]

    total_voiced_duration_ms = sum(
        metric.voiced_duration_ms for metric in reliable
    )
    total_stt_word_count = sum(
        metric.stt_word_count for metric in reliable
    )

    session_pace_wpm: Optional[float] = None
    if total_voiced_duration_ms >= 4_000 and total_stt_word_count >= 5:
        session_pace_wpm = (
            total_stt_word_count
            / (total_voiced_duration_ms / 60_000)
        )

    long_pause_count = sum(
        metric.long_pause_count for metric in reliable
    )
    longest_pause_values = [
        metric.longest_pause_ms
        for metric in reliable
        if metric.longest_pause_ms is not None
    ]

    latency_values = [
        metric.initial_response_latency_ms
        for metric in reliable
        if metric.initial_response_latency_ms is not None
    ]
    average_initial_latency_ms = (
        sum(latency_values) / len(latency_values)
        if latency_values
        else None
    )

    weighted_volume_sum = 0.0
    weighted_volume_duration = 0
    for metric in reliable:
        if metric.volume_variation_db is None:
            continue
        weighted_volume_sum += (
            metric.volume_variation_db
            * metric.voiced_duration_ms
        )
        weighted_volume_duration += metric.voiced_duration_ms

    volume_variation_db: Optional[float] = None
    if weighted_volume_duration >= MIN_VOLUME_VOICED_MS:
        volume_variation_db = (
            weighted_volume_sum / weighted_volume_duration
        )

    recognized_filler_count = sum(
        metric.recognized_filler_count for metric in measured
    )

    return SpeechSummary(
        measured_answer_count=len(measured),
        reliable_answer_count=len(reliable),
        total_answer_count=len(transcript),
        total_voiced_duration_ms=total_voiced_duration_ms,
        session_pace_wpm=_round_optional(session_pace_wpm),
        pace_status=_pace_status(session_pace_wpm),
        long_pause_count=long_pause_count,
        longest_pause_ms=(
            max(longest_pause_values)
            if longest_pause_values
            else None
        ),
        recognized_filler_count=recognized_filler_count,
        filler_measurement="recognized_minimum",
        average_initial_latency_ms=_round_optional(
            average_initial_latency_ms
        ),
        volume_variation_db=_round_optional(volume_variation_db),
        volume_variation_status=_volume_status(
            volume_variation_db
        ),
    )


def _seconds(milliseconds: Optional[float]) -> str:
    """밀리초의 사용자 표시용 초 변환."""
    if milliseconds is None:
        return "0초"
    return f"{milliseconds / 1000:.1f}초"


def build_speech_delivery_feedback(
    summary: Optional[SpeechSummary],
) -> str:
    """측정된 상태만 사용하는 실행 가능한 음성 코칭 생성."""
    if summary is None:
        return ""

    observations: List[str] = [
        (
            f"전체 {summary.total_answer_count}개 답변 중 "
            f"{summary.measured_answer_count}개에서 음성 지표를 수집했습니다."
        )
    ]
    actions: List[str] = []

    if summary.pace_status == "fast" and summary.session_pace_wpm is not None:
        observations.append(
            f"합산 말 빠르기는 약 {summary.session_pace_wpm:.1f}어절/분으로 현재 분석 기준 빠른 편입니다."
        )
        actions.append(
            "핵심 결론이나 수치를 말한 뒤 0.5~1초 정도 쉬고 다음 근거로 넘어가세요."
        )
    elif summary.pace_status == "slow" and summary.session_pace_wpm is not None:
        observations.append(
            f"합산 말 빠르기는 약 {summary.session_pace_wpm:.1f}어절/분으로 현재 분석 기준 느린 편입니다."
        )
        actions.append(
            "첫 문장에서 결론을 먼저 말하고, 근거는 두 문장 이내로 이어가는 방식으로 답변 밀도를 높이세요."
        )
    elif summary.pace_status == "balanced" and summary.session_pace_wpm is not None:
        observations.append(
            f"합산 말 빠르기는 약 {summary.session_pace_wpm:.1f}어절/분으로 현재 분석 범위 안에 있습니다."
        )

    if summary.long_pause_count > 0:
        observations.append(
            f"발화 중 1.5초 이상 멈춤이 {summary.long_pause_count}회 있었고, 최장 멈춤은 {_seconds(summary.longest_pause_ms)}였습니다."
        )
        actions.append(
            "답변을 시작하기 전에 결론과 근거 한 가지를 정한 뒤, 문장 사이에는 짧은 쉼만 남겨보세요."
        )

    if (
        summary.average_initial_latency_ms is not None
        and summary.average_initial_latency_ms >= 2_000
    ):
        observations.append(
            f"질문 뒤 첫 발화까지의 평균 지연은 {_seconds(summary.average_initial_latency_ms)}였습니다."
        )
        actions.append(
            "질문을 들은 뒤 완성된 문장을 만들기보다 결론 한 문장을 먼저 말하고 설명을 이어가세요."
        )

    if summary.volume_variation_status == "low":
        observations.append(
            "측정 가능한 답변의 상대 음량 변화 폭이 작은 편이었습니다."
        )
        actions.append(
            "핵심 결론과 수치에서만 음량을 조금 높이고, 보충 설명에서는 원래 크기로 돌아오세요."
        )

    if summary.recognized_filler_count > 0:
        observations.append(
            f"Chrome final STT에서 명확히 확인된 필러는 최소 {summary.recognized_filler_count}회입니다."
        )
        actions.append(
            "필러가 나오려는 순간에는 소리를 채우지 말고 짧게 멈춘 뒤 첫 문장을 시작하세요."
        )

    excluded_count = (
        summary.measured_answer_count
        - summary.reliable_answer_count
    )
    if excluded_count > 0:
        observations.append(
            f"측정 신뢰도가 낮은 답변 {excluded_count}개는 속도·멈춤 판정에서 제외했습니다."
        )

    if not actions:
        actions.append(
            "현재 측정에서는 뚜렷한 속도·멈춤 문제가 확인되지 않았습니다. 핵심 수치 뒤에 짧은 쉼을 넣는 연습을 유지하세요."
        )

    return " ".join([*observations, *actions[:3]])


def build_speech_report(
    transcript: List[TranscriptTurn],
) -> Tuple[Optional[SpeechSummary], str]:
    """세션 음성 요약과 결정론적 코칭 동시 생성."""
    summary = build_speech_summary(transcript)
    return summary, build_speech_delivery_feedback(summary)