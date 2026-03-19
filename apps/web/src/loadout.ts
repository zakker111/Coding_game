import type { Loadout, ModuleId } from '@coding-game/replay'

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n')
}

const KNOWN_MODULES: readonly ModuleId[] = ['BULLET', 'SAW', 'SHIELD', 'ARMOR']

function parseModuleId(raw: string): ModuleId | null {
  const upper = raw.trim().toUpperCase()
  if (upper === 'EMPTY' || upper === 'NONE') return null
  if ((KNOWN_MODULES as readonly string[]).includes(upper)) return upper as ModuleId
  return null
}

/**
 * Parse loadout directives from the top-of-script comment header:
 *   ;@slot1 BULLET
 *   ;@slot2 EMPTY
 *   ;@slot3 ARMOR
 *
 * If no directives are present, we default to `[BULLET, null, null]` for
 * Workshop back-compat and better UX.
 */
export function parseLoadoutFromSourceText(sourceText: string): Loadout {
  const lines = normalizeNewlines(String(sourceText ?? '')).split('\n')

  const loadout: Loadout = [null, null, null]

  let sawDirective = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Only scan the leading comment header.
    if (!trimmed.startsWith(';')) break

    const m = trimmed.match(/^;\s*@slot([123])\s+(\S+)/i)
    if (!m) continue

    sawDirective = true

    const slot = Number(m[1])
    const mod = parseModuleId(m[2])
    if (slot >= 1 && slot <= 3) loadout[slot - 1] = mod
  }

  if (!sawDirective) return ['BULLET', null, null]
  return loadout
}
