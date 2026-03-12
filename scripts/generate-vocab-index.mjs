import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const jlptPath = path.join(root, 'jlpt-kanji.json')
const dictPaths = [1, 2, 3, 4].map((part) => path.join(root, `dictionary_part_${part}.json`))
const outputPath = path.join(root, 'src', 'data', 'vocabIndex.ts')
const levels = new Set(['N5', 'N4', 'N3'])
const maxPerKanji = 6

function scoreEntry(entry, kanji) {
  const text = entry.kanji || ''
  const glossary = Array.isArray(entry.glossary_en) ? entry.glossary_en : []
  const primaryGloss = glossary.find((item) => !/[。.!?]/.test(item)) || glossary[0] || ''
  let score = 0

  if (text.length <= 2) score += 4
  else if (text.length === 3) score += 2
  if (text.startsWith(kanji)) score += 2
  if (/n|vs|adj|v1|v5/.test(entry.pos || '')) score += 1
  if (primaryGloss && primaryGloss.length < 40) score += 1
  if ((entry.sequence || 0) > 0) score += 1

  return score
}

function normalizeMeaning(glossary) {
  const text = (glossary || []).find((item) => !/[。.!?]/.test(item)) || glossary?.[0] || ''
  return text.replace(/'/g, "\\'")
}

function serializeIndex(index) {
  const lines = Object.entries(index)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kanji, items]) => {
      const serializedItems = items
        .map(
          (item) =>
            `{ word: '${item.word.replace(/'/g, "\\'")}', reading: '${item.reading.replace(/'/g, "\\'")}', meaning: '${item.meaning}' }`,
        )
        .join(', ')

      return `  '${kanji}': [${serializedItems}],`
    })
    .join('\n')

  return `export type VocabItem = {
  word: string
  reading: string
  meaning: string
}

export const vocabIndex: Record<string, VocabItem[]> = {
${lines}
}
`
}

async function main() {
  const jlpt = JSON.parse(await fs.readFile(jlptPath, 'utf8'))
  const targetKanji = new Set(
    jlpt.filter((entry) => levels.has(entry.jlpt) && entry.strokes).map((entry) => entry.kanji),
  )

  const index = Object.fromEntries([...targetKanji].map((kanji) => [kanji, []]))

  for (const dictPath of dictPaths) {
    const entries = JSON.parse(await fs.readFile(dictPath, 'utf8'))

    for (const entry of entries) {
      if (!entry.kanji || !entry.reading || !entry.glossary_en?.length) continue

      for (const char of [...entry.kanji]) {
        if (!targetKanji.has(char)) continue

        index[char].push({
          word: entry.kanji,
          reading: entry.reading,
          meaning: normalizeMeaning(entry.glossary_en),
          score: scoreEntry(entry, char),
          sequence: entry.sequence || Number.MAX_SAFE_INTEGER,
        })
      }
    }
  }

  const compact = Object.fromEntries(
    Object.entries(index).map(([kanji, items]) => [
      kanji,
      items
        .sort((left, right) => right.score - left.score || left.sequence - right.sequence || left.word.length - right.word.length)
        .filter((item, idx, all) => all.findIndex((candidate) => candidate.word === item.word) === idx)
        .slice(0, maxPerKanji)
        .map(({ word, reading, meaning }) => ({ word, reading, meaning })),
    ]),
  )

  await fs.writeFile(outputPath, serializeIndex(compact), 'utf8')
  console.log(`Generated vocab index for ${Object.keys(compact).length} kanji.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
