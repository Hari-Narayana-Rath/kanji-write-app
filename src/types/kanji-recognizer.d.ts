declare module 'kanji-recognizer' {
  export class KanjiWriter {
    constructor(elementId: string, kanjiData: string[], options?: Record<string, unknown>)
    onCorrect: () => void | Promise<void>
    onIncorrect: () => void
    onComplete?: () => void
    clear(): void
    hint(): void
    animate(): Promise<void>
    destroy(): void
  }

  export class KanjiVGParser {
    static baseUrl: string
    static fetchData(char: string): Promise<string[]>
  }
}
