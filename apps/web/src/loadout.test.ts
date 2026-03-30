// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { deriveLoadoutForSlot, parseLoadoutHeaderDirectives } from './loadout'

describe('loadout header directives', () => {
  it('parses ;@slotN directives from the first 3 non-blank comment lines', () => {
    const src = [';@slot1 BULLET', ';@slot2 EMPTY', ';@slot3 ARMOR', 'WAIT 1'].join('\n')
    expect(parseLoadoutHeaderDirectives(src)).toEqual({
      hasDirectives: true,
      loadout: ['BULLET', null, 'ARMOR'],
    })
  })

  it('ignores directives after the first 3 non-blank comment lines', () => {
    const src = ['; bot header line 1', '; bot header line 2', '; bot header line 3', ';@slot1 SAW', 'WAIT 1'].join('\n')
    expect(parseLoadoutHeaderDirectives(src)).toEqual({
      hasDirectives: false,
      loadout: [null, null, null],
    })
  })

  it('defaults to EMPTY/EMPTY/EMPTY when no directives are present', () => {
    expect(deriveLoadoutForSlot('BOT1', 'WAIT 1')).toEqual([null, null, null])
    expect(deriveLoadoutForSlot('BOT2', 'WAIT 1')).toEqual([null, null, null])

    const src = [';@slot1 EMPTY', ';@slot2 EMPTY', ';@slot3 EMPTY', 'WAIT 1'].join('\n')
    expect(deriveLoadoutForSlot('BOT1', src)).toEqual([null, null, null])
  })
})
