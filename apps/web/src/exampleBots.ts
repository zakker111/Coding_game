import bot0Md from '../../../examples/bot0.md?raw'
import bot1Md from '../../../examples/bot1.md?raw'
import bot2Md from '../../../examples/bot2.md?raw'
import bot3Md from '../../../examples/bot3.md?raw'
import bot4Md from '../../../examples/bot4.md?raw'

export type ExampleBotId = 'bot0' | 'bot1' | 'bot2' | 'bot3' | 'bot4'

export type ExampleBot = {
  id: ExampleBotId
  displayName: string
  sourceText: string
}

function extractFirstTextFence(md: string): string {
  // Match the first fenced block like:
  // ```text\n...\n```
  const m = md.match(/```text\s*\n([\s\S]*?)\n```/)
  if (!m) return ''

  // Keep a trailing newline to match how the rest of the app stores sources.
  const body = m[1].replace(/\s+$/, '')
  return body.length ? `${body}\n` : ''
}

export const EXAMPLE_BOTS: Record<ExampleBotId, ExampleBot> = {
  bot0: {
    id: 'bot0',
    displayName: 'Powerup Seeker (starter)',
    sourceText: extractFirstTextFence(bot0Md),
  },
  bot1: {
    id: 'bot1',
    displayName: 'Zone Patrol Shooter',
    sourceText: extractFirstTextFence(bot1Md),
  },
  bot2: {
    id: 'bot2',
    displayName: 'Chaser Shooter',
    sourceText: extractFirstTextFence(bot2Md),
  },
  bot3: {
    id: 'bot3',
    displayName: 'Corner Bunker',
    sourceText: extractFirstTextFence(bot3Md),
  },
  bot4: {
    id: 'bot4',
    displayName: 'Saw Rusher',
    sourceText: extractFirstTextFence(bot4Md),
  },
}

export const EXAMPLE_OPPONENT_IDS: Array<Exclude<ExampleBotId, 'bot0'>> = [
  'bot1',
  'bot2',
  'bot3',
  'bot4',
]
