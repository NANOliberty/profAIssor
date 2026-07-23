import type {
  Persona,
  PersonaId,
} from './types'

const STORAGE_KEY = 'profAIssor.personas.v1'

/** 저장 데이터의 페르소나 구조 검증. */
function isPersona(value: unknown): value is Persona {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Persona>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.emoji === 'string' &&
    typeof candidate.blurb === 'string'
  )
}

/** 브라우저에 저장된 최근 서버 페르소나 목록 조회. */
function loadStoredPersonas(): Persona[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isPersona)
  } catch {
    return []
  }
}

let personaCache: Persona[] = loadStoredPersonas()

/** 현재 메모리의 페르소나 목록 복사본 반환. */
export function getCachedPersonas(): Persona[] {
  return [...personaCache]
}

/** 서버에서 받은 페르소나 목록으로 캐시 교체. */
export function replacePersonaCache(
  personas: Persona[],
): Persona[] {
  const validated = personas.filter(isPersona)
  if (validated.length === 0) {
    throw new Error(
      '서버에서 사용할 수 있는 평가자 정보를 받지 못했습니다.',
    )
  }

  personaCache = validated.map((persona) => ({
    ...persona,
    id: persona.id.trim(),
    name: persona.name.trim(),
    emoji: persona.emoji.trim(),
    blurb: persona.blurb.trim(),
  }))

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(personaCache),
    )
  } catch {
    // 저장 공간 제한 시 메모리 캐시만 사용
  }

  return getCachedPersonas()
}

/** ID에 해당하는 페르소나 조회. */
export function getPersona(id: PersonaId): Persona {
  return (
    personaCache.find((persona) => persona.id === id) ?? {
      id,
      name: '발표 평가자',
      emoji: '💬',
      blurb: '발표 자료를 바탕으로 질문하는 평가자입니다.',
    }
  )
}