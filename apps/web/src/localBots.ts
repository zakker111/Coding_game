export type LocalBot = {
  id: string
  name: string
  sourceText: string
}

export type LocalBotLibraryV1 = {
  version: 1
  selectedBotId: string
  bots: LocalBot[]
}

export const LOCAL_BOTS_STORAGE_KEY = 'nowt:workshop:myBots:v1'

export function createDefaultLocalBotLibrary(starterSourceText: string): LocalBotLibraryV1 {
  return {
    version: 1,
    selectedBotId: 'my-bot-1',
    bots: [1, 2, 3].map((i) => ({
      id: `my-bot-${i}`,
      name: `my-bot-${i}`,
      sourceText: starterSourceText,
    })),
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function normalizeParsedLibrary(parsed: unknown, starterSourceText: string): LocalBotLibraryV1 {
  if (!parsed || typeof parsed !== 'object') return createDefaultLocalBotLibrary(starterSourceText)

  const anyParsed = parsed as any
  const botsRaw: unknown = anyParsed.bots

  const bots: LocalBot[] = Array.isArray(botsRaw)
    ? botsRaw
        .map((b) => {
          if (!b || typeof b !== 'object') return null
          const anyB = b as any

          const id = anyB.id
          const name = anyB.name
          const sourceText = anyB.sourceText

          if (!isNonEmptyString(id)) return null
          if (typeof name !== 'string') return null
          if (typeof sourceText !== 'string') return null

          return { id, name, sourceText }
        })
        .filter((b): b is LocalBot => b != null)
    : []

  const seen = new Set<string>()
  const uniqueBots = bots.filter((b) => {
    if (seen.has(b.id)) return false
    seen.add(b.id)
    return true
  })

  if (!uniqueBots.length) return createDefaultLocalBotLibrary(starterSourceText)

  const selectedBotId = isNonEmptyString(anyParsed.selectedBotId) ? anyParsed.selectedBotId : uniqueBots[0].id
  const selectedExists = uniqueBots.some((b) => b.id === selectedBotId)

  return {
    version: 1,
    selectedBotId: selectedExists ? selectedBotId : uniqueBots[0].id,
    bots: uniqueBots,
  }
}

export function loadLocalBotLibrary(starterSourceText: string): LocalBotLibraryV1 {
  try {
    const raw = localStorage.getItem(LOCAL_BOTS_STORAGE_KEY)
    if (!raw) {
      const created = createDefaultLocalBotLibrary(starterSourceText)
      saveLocalBotLibrary(created)
      return created
    }

    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeParsedLibrary(parsed, starterSourceText)

    // If the stored value was malformed or missing required fields, re-save the normalized value.
    if (JSON.stringify(normalized) !== raw) {
      saveLocalBotLibrary(normalized)
    }

    return normalized
  } catch {
    const created = createDefaultLocalBotLibrary(starterSourceText)
    saveLocalBotLibrary(created)
    return created
  }
}

export function saveLocalBotLibrary(state: LocalBotLibraryV1) {
  try {
    localStorage.setItem(LOCAL_BOTS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota/unavailable
  }
}

export function createNewLocalBotId(existingIds: Iterable<string>): string {
  const set = new Set(existingIds)
  for (let i = 1; i < 10_000; i++) {
    const id = `my-bot-${i}`
    if (!set.has(id)) return id
  }
  return `my-bot-${Date.now()}`
}
