import fs from 'node:fs/promises'
import path from 'node:path'
import kanji from 'kanji'

const root = process.cwd()
const sourcePath = path.join(root, 'jlpt-kanji.json')
const outputPath = path.join(root, 'src', 'data', 'lessonDeck.ts')
const svgDir = path.join(root, 'public', 'kanjivg', 'kanji')
const levels = new Set(['N5', 'N4', 'N3'])

function toHiragana(value) {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  )
}

function normalizeReading(reading) {
  return toHiragana(reading.replace(/-/g, '').replace(/\./g, '').trim())
}

function pickReading(char) {
  const readings = kanji.readings(char)
  const preferred = readings.kun.find((value) => !value.startsWith('-'))
    ?? readings.kun[0]
    ?? readings.on[0]
    ?? char

  return normalizeReading(preferred)
}

function pickMeaning(description) {
  const match = description.match(/means (.+?)\./i)
  return match ? match[1] : description
}

function getHex(char) {
  return char.codePointAt(0).toString(16).padStart(5, '0').toLowerCase()
}

function serializeDeck(cards) {
  const body = cards
    .map(
      (card) =>
        `  { id: '${card.id}', kanji: '${card.kanji}', kana: '${card.kana}', meaning: '${card.meaning.replace(/'/g, "\\'")}', strokes: ${card.strokes}, jlpt: '${card.jlpt}' },`,
    )
    .join('\n')

  return `export type LessonCard = {
  id: string
  kanji: string
  kana: string
  meaning: string
  strokes: number
  jlpt: 'N5' | 'N4' | 'N3'
}

export const lessonDeck: LessonCard[] = [
${body}
]
`
}

async function downloadSvg(char) {
  const hex = getHex(char)
  const targetPath = path.join(svgDir, `${hex}.svg`)

  try {
    await fs.access(targetPath)
    return
  } catch {
    // File is missing. Continue to download.
  }

  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${char} (${hex}): ${response.status}`)
  }

  const svg = await response.text()
  await fs.writeFile(targetPath, svg, 'utf8')
}

async function main() {
  const raw = await fs.readFile(sourcePath, 'utf8')
  const source = JSON.parse(raw)
  const cards = source
    .filter((entry) => levels.has(entry.jlpt) && entry.strokes)
    .map((entry) => ({
      id: `${entry.jlpt.toLowerCase()}-${entry.kanji.codePointAt(0).toString(16)}`,
      kanji: entry.kanji,
      kana: pickReading(entry.kanji),
      meaning: pickMeaning(entry.description),
      strokes: entry.strokes,
      jlpt: entry.jlpt,
    }))

  await fs.mkdir(svgDir, { recursive: true })
  await fs.writeFile(outputPath, serializeDeck(cards), 'utf8')

  for (const card of cards) {
    await downloadSvg(card.kanji)
  }

  console.log(`Generated ${cards.length} cards and synced SVGs.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
