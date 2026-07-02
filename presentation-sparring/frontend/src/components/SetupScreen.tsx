import { FileText, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { PERSONAS } from '../personas'
import type { PersonaId, Slide } from '../types'
import SlideInput from './SlideInput'

interface Props {
  onStart: (data: { script: string; slides: Slide[]; personaIds: PersonaId[] }) => void
}

const SAMPLE_SCRIPT =
  '안녕하세요. 저희 연구는 트랜스포머 모델의 어텐션 계산 효율성을 개선하는 방법을 제안합니다. ' +
  '기존 어텐션은 계산 복잡도가 높다는 문제가 있었고, 저희는 이를 줄이는 방향으로 접근했습니다. ' +
  '음 그 결과 속도가 빨라졌습니다. 감사합니다.'

const SAMPLE_SLIDES: Slide[] = [
  { index: 1, text: '문제 정의: 셀프 어텐션의 계산 복잡도 O(n^2)' },
  { index: 2, text: '제안 방법: 희소 어텐션(sparse attention)으로 O(n log n) 달성' },
  { index: 3, text: '실험 결과: GLUE 벤치마크에서 2.3배 속도 향상, 정확도 유지' },
]

export default function SetupScreen({ onStart }: Props) {
  const [script, setScript] = useState(SAMPLE_SCRIPT)
  const [slides, setSlides] = useState<Slide[]>(SAMPLE_SLIDES)
  const [selected, setSelected] = useState<PersonaId[]>(['professor', 'peer'])

  const toggle = (id: PersonaId) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  const canStart = script.trim().length > 0 && selected.length > 0

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          prof<span className="text-indigo-600">AI</span>ssor
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-500">
          여러 관점의 까다로운 청중을 동시에 상대하는 발표 질의응답 스파링 도구.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left column: script + slides */}
        <div className="space-y-6 lg:col-span-7">
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <label
              htmlFor="script-textarea"
              className="flex items-center gap-2 text-lg font-semibold text-slate-800"
            >
              <FileText className="h-5 w-5 text-indigo-500" />
              발표 대본
            </label>
            <p className="text-xs text-slate-400">
              실제로 발표할 대본을 그대로 붙여넣으세요. AI 심사관이 이를 바탕으로 날카로운 꼬리 질문을 던집니다.
            </p>
            <textarea
              id="script-textarea"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={9}
              placeholder="실제로 발표할 대본을 그대로 붙여넣으세요."
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <label className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              발표자료 슬라이드 텍스트
            </label>
            <p className="text-xs text-slate-400">
              슬라이드별 핵심 텍스트를 입력하면, 대본에서 말로 전달되지 않은 슬라이드 내용을 리포트에서 찾아줍니다.
            </p>
            <SlideInput slides={slides} onChange={setSlides} />
          </div>
        </div>

        {/* Right column: persona selection + CTA */}
        <div className="space-y-6 lg:col-span-5">
          <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Users className="h-5 w-5 text-indigo-500" />
              청중 페르소나 선택
              <span className="text-xs font-normal text-slate-400">(1개 이상)</span>
            </h2>
            <div className="space-y-3">
              {PERSONAS.map((p) => {
                const active = selected.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={
                      'relative flex w-full items-start gap-3.5 rounded-xl border-2 p-4 text-left transition-all ' +
                      (active
                        ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/50')
                    }
                  >
                    <span className="select-none text-3xl" role="img" aria-label={p.name}>
                      {p.emoji}
                    </span>
                    <div className="space-y-1 pr-6">
                      <div className="text-sm font-bold text-slate-800">{p.name}</div>
                      <p className="text-xs leading-normal text-slate-500">{p.blurb}</p>
                    </div>
                    {active && (
                      <div className="absolute right-3.5 top-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600">
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={!canStart}
            onClick={() => onStart({ script, slides: slides.filter((s) => s.text.trim()), personaIds: selected })}
            className="w-full rounded-xl bg-indigo-600 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-600/10 transition-all hover:scale-[1.01] hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            스파링 시작 →
          </button>
        </div>
      </div>
    </div>
  )
}
