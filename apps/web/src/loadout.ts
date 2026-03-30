import type { Loadout, ModuleId, SlotId } from '@coding-game/replay'

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n')
}

const KNOWN_MODULES: readonly ModuleId[] = ['BULLET', 'SAW', 'SHIELD', 'ARMOR']

function parseModuleId(raw: string): ModuleId | null {
  const upper = raw.trim().toUpperCase()
  if (upper === 'EMPTY' || upper === 'NONE') return null
  if ((KNOWN_MODULES as readonly string[]).includes(upper)) return upper as ModuleId
  // Unknown module => treat as empty.
  return null
}

export type LoadoutParseResult = {
  loadout: Loadout

  /** True if we saw at least one ;@slotN directive (even if it set EMPTY). */
  hasDirectives: boolean
}

/**
 * Parse Workshop "locked header" loadout directives from the top-of-script comment header:
 *   ;@slot1 BULLET
 *   ;@slot2 EMPTY
 *   ;@slot3 ARMOR
 *
 * Only the first 3 non-blank comment lines are considered.
 */
export function parseLoadoutHeaderDirectives(sourceText: string): LoadoutParseResult {
  const lines = normalizeNewlines(String(sourceText ?? '')).split('\n')

  const loadout: Loadout = [null, null, null]

  let headerCommentLinesSeen = 0
  let hasDirectives = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Only scan the leading comment header.
    if (!trimmed.startsWith(';')) break

    headerCommentLinesSeen++

    const m = trimmed.match(/^;\s*@slot([123])\s*[:=]?\s*(\S+)\s*$/i)
    if (m) {
      const slot = Number(m[1])
      const mod = parseModuleId(m[2])

      hasDirectives = true
      if (slot >= 1 && slot <= 3) loadout[slot - 1] = mod
    }

    if (headerCommentLinesSeen >= 3) break
  }

  return { loadout, hasDirectives }
}

/**
 * Temporary Phase 2 wiring: derive a per-slot Loadout from source headers.
 *
 * If no directives are present, default to the empty loadout.
 *
 * This matches the `rulesetVersion = 0.2.0` contract: omitted/unknown loadouts are not silently inferred.
 */
export function deriveLoadoutForSlot(_slotId: SlotId, sourceText: string): Loadout {
  const parsed = parseLoadoutHeaderDirectives(sourceText)

  if (!parsed.hasDirectives) return [null, null, null]
  return parsed.loadout
}
