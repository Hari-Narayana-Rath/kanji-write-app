import type { LessonCard } from '../data/lessonDeck'

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

export type ReviewProgress = {
  cardId: string
  dueAt: number
  intervalDays: number
  ease: number
  reps: number
  lapses: number
  lastGrade: ReviewGrade | null
}

export type ReviewProgressMap = Record<string, ReviewProgress>

const DAY_MS = 24 * 60 * 60 * 1000

function defaultProgress(cardId: string): ReviewProgress {
  return {
    cardId,
    dueAt: Date.now(),
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    lastGrade: null,
  }
}

export function hydrateProgress(cards: LessonCard[], storageKey: string): ReviewProgressMap {
  const defaults = Object.fromEntries(cards.map((card) => [card.id, defaultProgress(card.id)]))

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return defaults

    const parsed = JSON.parse(raw) as ReviewProgressMap
    return { ...defaults, ...parsed }
  } catch {
    return defaults
  }
}

export function saveProgress(progress: ReviewProgressMap, storageKey: string) {
  window.localStorage.setItem(storageKey, JSON.stringify(progress))
}

export function countDueCards(progress: ReviewProgressMap, now = Date.now()) {
  return Object.values(progress).filter((item) => item.dueAt <= now).length
}

export function getNextDueAt(progress: ReviewProgressMap) {
  const upcoming = Object.values(progress)
    .map((item) => item.dueAt)
    .filter((dueAt) => dueAt > Date.now())
    .sort((left, right) => left - right)

  return upcoming[0] ?? null
}

export function selectNextCard(cards: LessonCard[], progress: ReviewProgressMap, now = Date.now()) {
  return cards
    .filter((card) => progress[card.id]?.dueAt <= now)
    .sort((left, right) => {
      const leftProgress = progress[left.id]
      const rightProgress = progress[right.id]

      if (leftProgress.dueAt !== rightProgress.dueAt) {
        return leftProgress.dueAt - rightProgress.dueAt
      }

      return leftProgress.reps - rightProgress.reps
    })[0] ?? null
}

export function getQueuePreview(cards: LessonCard[], progress: ReviewProgressMap, limit: number, now = Date.now()) {
  return cards
    .filter((card) => progress[card.id]?.dueAt <= now)
    .sort((left, right) => progress[left.id].dueAt - progress[right.id].dueAt)
    .slice(0, limit)
}

export function scheduleReview(
  progress: ReviewProgressMap,
  cardId: string,
  grade: ReviewGrade,
  now = Date.now(),
) {
  const current = progress[cardId] ?? defaultProgress(cardId)
  const updated = { ...current }

  switch (grade) {
    case 'again':
      updated.intervalDays = 0
      updated.ease = Math.max(1.3, updated.ease - 0.2)
      updated.reps = 0
      updated.lapses += 1
      updated.dueAt = now + 10 * 60 * 1000
      break
    case 'hard':
      updated.intervalDays = Math.max(1, Math.round(Math.max(updated.intervalDays, 1) * 1.2))
      updated.ease = Math.max(1.3, updated.ease - 0.15)
      updated.reps += 1
      updated.dueAt = now + updated.intervalDays * DAY_MS
      break
    case 'good':
      updated.intervalDays =
        updated.reps === 0 ? 1 : updated.reps === 1 ? 3 : Math.max(4, Math.round(updated.intervalDays * updated.ease))
      updated.ease = Math.min(3.2, updated.ease + 0.05)
      updated.reps += 1
      updated.dueAt = now + updated.intervalDays * DAY_MS
      break
    case 'easy':
      updated.intervalDays =
        updated.reps === 0
          ? 3
          : Math.max(5, Math.round(updated.intervalDays * updated.ease * 1.35))
      updated.ease = Math.min(3.4, updated.ease + 0.1)
      updated.reps += 1
      updated.dueAt = now + updated.intervalDays * DAY_MS
      break
  }

  updated.lastGrade = grade

  return {
    ...progress,
    [cardId]: updated,
  }
}
