import { Brain, Mic, RotateCcw, Shield, Target } from 'lucide-react'
import { coverageRate } from '../lib/coverage'
import { loadSessions } from '../lib/sessionStore'
import type { Report } from '../types'

interface Props {
  report: Report
  onRestart: () => void
}

export default function ReportScreen({ report, onRestart }: Props) {
  // Rough speaking-rate estimate: assume ~120 어절/분 delivery pace.
  const estMinutes = report.word_count > 0 ? (report.word_count / 120).toFixed(1) : '0'
  const uncovered = report.slide_coverage.filter((s) => !s.covered)

  // sessions[0] is this just-completed session (saveSession runs right
  // before this screen renders) — sessions[1] is the one to compare against.
  const previous = loadSessions()[1] ?? null
  const fillerDelta = previous ? report.filler_count - previous.report.filler_count : null
  const minutesDelta = previous ? Number(estMinutes) - previous.estMinutes : null
  const coverageDelta = previous
    ? coverageRate(report.slide_coverage) - coverageRate(previous.report.slide_coverage)
    : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Hero banner */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600">
          AI 심사 결과 보고서
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">📋 피드백 리포트</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
          스파링 세션을 종합한 결과입니다. 아래에서 내용·전달·대응 분석과 슬라이드 커버리지를 확인하세요.
        </p>
      </div>

      {/* axis feedback */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card icon={<Brain className="h-5 w-5 text-indigo-500" />} title="내용" body={report.content_feedback} />
        <Card icon={<Mic className="h-5 w-5 text-indigo-500" />} title="전달" body={report.delivery_feedback} />
        <Card icon={<Shield className="h-5 w-5 text-indigo-500" />} title="대응" body={report.response_feedback} />
      </div>

      {/* slide coverage — the killer feature */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <Target className="h-5 w-5 text-indigo-600" />
          슬라이드 커버리지
          <span className="text-xs font-normal text-slate-400">
            (슬라이드에 있으나 말로 전달되지 않은 핵심)
          </span>
        </h2>

        {uncovered.length === 0 ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm font-semibold text-emerald-700">
            ✅ 모든 슬라이드의 핵심이 대본에서 언급되었습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {uncovered.map((s) => (
              <div key={s.index} className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                <span className="font-bold text-amber-700">슬라이드 {s.index}</span>
                <span className="ml-2 text-sm text-amber-900/80">
                  {s.missing_point ?? '핵심 내용이 대본에서 충분히 언급되지 않았습니다.'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* full coverage map */}
        <div className="flex flex-wrap gap-2 pt-1">
          {report.slide_coverage.map((s) => (
            <span
              key={s.index}
              className={
                'rounded-lg px-3 py-1 text-xs font-medium ' +
                (s.covered ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
              }
            >
              슬라이드 {s.index} {s.covered ? '✓ 전달됨' : '✗ 미언급'}
            </span>
          ))}
        </div>
      </section>

      {/* delivery metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="필러 단어"
          value={`${report.filler_count}회`}
          hint='"어", "그", "음" 등'
          delta={fillerDelta == null ? null : { value: fillerDelta, goodDirection: 'down', unit: '회' }}
        />
        <Metric label="총 어절 수" value={`${report.word_count}어절`} hint="대본 기준" />
        <Metric
          label="예상 발표 시간"
          value={`~${estMinutes}분`}
          hint="약 120어절/분 기준"
          delta={minutesDelta == null ? null : { value: Number(minutesDelta.toFixed(1)), goodDirection: 'down', unit: '분' }}
        />
        <Metric
          label="슬라이드 커버리지"
          value={`${coverageRate(report.slide_coverage)}%`}
          hint="말로 전달된 비율"
          delta={coverageDelta == null ? null : { value: coverageDelta, goodDirection: 'up', unit: '%p' }}
        />
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-600/10 transition-colors hover:bg-indigo-700"
      >
        <RotateCcw className="h-4 w-4" />
        새 스파링 시작
      </button>
    </div>
  )
}

function Card({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
        {icon}
        {title}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{body || '—'}</p>
    </div>
  )
}

interface Delta {
  value: number
  /** Which direction of change counts as an improvement. */
  goodDirection: 'up' | 'down'
  unit: string
}

function Metric({
  label,
  value,
  hint,
  delta,
}: {
  label: string
  value: string
  hint: string
  delta?: Delta | null
}) {
  return (
    <div className="space-y-1 rounded-2xl border border-slate-200/80 bg-white p-4 text-center shadow-sm">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-sm font-medium text-slate-600">{label}</div>
      <div className="text-xs text-slate-400">{hint}</div>
      {delta != null && delta.value !== 0 && (
        <div
          className={
            'text-xs font-semibold ' +
            ((delta.value < 0) === (delta.goodDirection === 'down') ? 'text-emerald-600' : 'text-rose-600')
          }
        >
          {delta.value > 0 ? '▲' : '▼'} {Math.abs(delta.value)}
          {delta.unit} (지난 세션 대비)
        </div>
      )}
    </div>
  )
}
