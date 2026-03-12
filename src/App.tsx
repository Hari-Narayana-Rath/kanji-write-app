import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { KanjiVGParser, KanjiWriter } from 'kanji-recognizer'
import './App.css'
import { lessonDeck, type LessonCard } from './data/lessonDeck'
import {
  getNextDueAt,
  hydrateProgress,
  saveProgress,
  scheduleReview,
  selectNextCard,
  type ReviewGrade,
  type ReviewProgressMap,
} from './lib/srs'

const PROGRESS_KEY = 'kanji-write-progress'
const MAX_HINTS = 2

type Level = 'N5' | 'N4' | 'N3'

function formatReviewTime(timestamp: number | null) {
  if (!timestamp) return 'All reviews finished for now'

  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(timestamp)
}

function getLevelCards(level: Level) {
  return lessonDeck.filter((card) => card.jlpt === level)
}

function getLevelProgress(progress: ReviewProgressMap, level: Level) {
  const cards = getLevelCards(level)
  return Object.fromEntries(cards.map((card) => [card.id, progress[card.id]]))
}

function getDueCount(progress: ReviewProgressMap, level: Level) {
  const now = Date.now()
  return getLevelCards(level).filter((card) => progress[card.id]?.dueAt <= now).length
}

function getNextDue(progress: ReviewProgressMap, level: Level) {
  return getNextDueAt(getLevelProgress(progress, level))
}

function useKanjiPaths(card: LessonCard | null) {
  const [state, setState] = useState<{
    cardId: string | null
    paths: string[] | null
    error: string | null
  }>({
    cardId: null,
    paths: null,
    error: null,
  })

  useEffect(() => {
    if (!card) return

    let cancelled = false
    KanjiVGParser.baseUrl = '/kanjivg/kanji/'

    KanjiVGParser.fetchData(card.kanji)
      .then((paths) => {
        if (!cancelled) {
          setState({ cardId: card.id, paths, error: null })
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({ cardId: card.id, paths: null, error: error.message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [card])

  return {
    loading: Boolean(card && state.cardId !== card.id),
    paths: state.cardId === card?.id ? state.paths : null,
    error: state.cardId === card?.id ? state.error : null,
  }
}

function HomePage({
  progress,
  onStart,
}: {
  progress: ReviewProgressMap
  onStart: (level: Level) => void
}) {
  const levels: Level[] = ['N5', 'N4', 'N3']

  return (
    <main className="screen home-screen">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Kanji Write</p>
          <h1>Choose a level</h1>
          <p className="lead">Progress is saved locally in this browser. Each deck stays separate.</p>
        </div>
      </header>

      <section className="level-grid">
        {levels.map((level) => {
          const cards = getLevelCards(level)
          const due = getDueCount(progress, level)
          const nextDue = getNextDue(progress, level)

          return (
            <article key={level} className="level-card">
              <div className="level-card-top">
                <p className="eyebrow">{level}</p>
                <h2>{cards.length} kanji</h2>
              </div>

              <div className="level-stats">
                <div>
                  <span className="stat-label">Due now</span>
                  <strong>{due}</strong>
                </div>
                <div>
                  <span className="stat-label">Next due</span>
                  <strong>{formatReviewTime(nextDue)}</strong>
                </div>
              </div>

              <p className="level-note">
                {level === 'N5' && 'Foundation deck for beginner writing practice.'}
                {level === 'N4' && 'Intermediate deck with only N4 kanji.'}
                {level === 'N3' && 'Upper-intermediate deck with only N3 kanji.'}
              </p>

              <button type="button" className="primary-button" onClick={() => onStart(level)}>
                Open {level}
              </button>
            </article>
          )
        })}
      </section>
    </main>
  )
}

function PracticeBoard({
  card,
  level,
  loading,
  paths,
  error,
  onGrade,
}: {
  card: LessonCard | null
  level: Level
  loading: boolean
  paths: string[] | null
  error: string | null
  onGrade: (card: LessonCard, grade: ReviewGrade) => void
}) {
  const writerId = useId().replace(/[:]/g, '')
  const stageRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<KanjiWriter | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [animating, setAnimating] = useState(false)

  const onKanjiComplete = useEffectEvent(() => {
    setCompleted(true)
    setAnimating(false)
  })

  useEffect(() => {
    if (!stageRef.current || !card || !paths) return

    stageRef.current.innerHTML = ''

    const writer = new KanjiWriter(writerId, paths, {
      width: 420,
      height: 420,
      strokeColor: '#1d3529',
      correctColor: '#1d3529',
      incorrectColor: '#b7410e',
      hintColor: '#0f766e',
      gridColor: '#d8d2c3',
      strokeWidth: 6,
      showGhost: false,
      showGrid: true,
      passThreshold: 18,
      startDistThreshold: 42,
      lengthRatioMin: 0.38,
      lengthRatioMax: 1.85,
      hintDuration: 900,
      snapDuration: 170,
    })

    writer.onComplete = onKanjiComplete
    writerRef.current = writer

    return () => {
      writer.destroy()
      writerRef.current = null
    }
  }, [card, paths, writerId])

  function handleHint() {
    if (!writerRef.current || hintsUsed >= MAX_HINTS || completed || animating) return
    writerRef.current.hint()
    setHintsUsed((value) => value + 1)
  }

  function handleReset() {
    if (!writerRef.current || animating) return
    writerRef.current.clear()
    setCompleted(false)
  }

  function handleReveal() {
    if (!writerRef.current || animating || completed) return
    setAnimating(true)
    setHintsUsed(MAX_HINTS)
    writerRef.current.animate().catch(() => setAnimating(false))
  }

  return (
    <section className="practice-card">
      <header className="prompt-header">
        <div>
          <p className="eyebrow">Write the kanji for</p>
          <h1>{card?.kana ?? 'おつかれさま'}</h1>
        </div>
      </header>

      <section className="stage-panel">
        <div className="board-wrap">
          {!card ? (
            <div className="empty-state">
              <p>No more due cards in {level}.</p>
              <span>Come back later for the next review.</span>
            </div>
          ) : (
            <>
              {loading && <div className="board-overlay">Loading stroke data…</div>}
              {error && <div className="board-overlay">{error}</div>}
              <div id={writerId} ref={stageRef} className="writer-stage" />
              {completed && (
                <div className="completion-banner">
                  <span>Kanji complete</span>
                  <strong>{card.kanji}</strong>
                </div>
              )}
            </>
          )}
        </div>

        <div className="tool-row">
          <button
            type="button"
            onClick={handleHint}
            disabled={!card || loading || completed || hintsUsed >= MAX_HINTS || animating}
          >
            Hint
          </button>
          <button type="button" onClick={handleReset} disabled={!card || loading || animating}>
            Reset
          </button>
          <button type="button" onClick={handleReveal} disabled={!card || loading || completed || animating}>
            Reveal
          </button>
        </div>
      </section>

      {card && (
        <footer className="review-panel">
          <div className="grade-row">
            <button type="button" className="grade again" onClick={() => onGrade(card, 'again')} disabled={!completed}>
              Again
            </button>
            <button type="button" className="grade easy" onClick={() => onGrade(card, 'easy')} disabled={!completed}>
              Easy
            </button>
          </div>
        </footer>
      )}
    </section>
  )
}

function PracticePage({
  level,
  progress,
  onGrade,
}: {
  level: Level
  progress: ReviewProgressMap
  onGrade: (card: LessonCard, grade: ReviewGrade) => void
}) {
  const cards = getLevelCards(level)
  const currentCard = selectNextCard(cards, getLevelProgress(progress, level))
  const { loading, paths, error } = useKanjiPaths(currentCard)

  return (
    <main className="screen practice-screen">
      <header className="practice-topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Kanji Write</p>
          <strong>{level} writing</strong>
        </div>
        <div className="topbar-stats">
          <span>{getDueCount(progress, level)} due</span>
        </div>
      </header>

      <PracticeBoard
        key={currentCard?.id ?? 'empty'}
        card={currentCard}
        level={level}
        loading={loading}
        paths={paths}
        error={error}
        onGrade={onGrade}
      />
    </main>
  )
}

function App() {
  const [currentLevel, setCurrentLevel] = useState<Level | null>(null)
  const [progress, setProgress] = useState<ReviewProgressMap>(() =>
    hydrateProgress(lessonDeck, PROGRESS_KEY),
  )

  useEffect(() => {
    saveProgress(progress, PROGRESS_KEY)
  }, [progress])

  function handleGrade(card: LessonCard, grade: ReviewGrade) {
    setProgress((previous) => scheduleReview(previous, card.id, grade, Date.now()))
  }

  if (!currentLevel) {
    return <HomePage progress={progress} onStart={setCurrentLevel} />
  }

  return <PracticePage level={currentLevel} progress={progress} onGrade={handleGrade} />
}

export default App
