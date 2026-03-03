import { readFile } from 'node:fs/promises';
import { createReplay, distanceMap, locEq, BUILTIN_BOT2_SOURCE, BUILTIN_BOT3_SOURCE } from './engine.js';
import { extractPreferredCodeBlock } from './markdown.js';

async function assertBuiltinSourcesMatchExamples() {
  const bot2md = await readFile(new URL('./examples/bot2.md', import.meta.url), 'utf8');
  const bot3md = await readFile(new URL('./examples/bot3.md', import.meta.url), 'utf8');

  const bot2 = extractPreferredCodeBlock(bot2md, { preferredLangs: ['text', ''] });
  const bot3 = extractPreferredCodeBlock(bot3md, { preferredLangs: ['text', ''] });

  if (bot2 !== BUILTIN_BOT2_SOURCE) throw new Error('BUILTIN_BOT2_SOURCE does not match examples/bot2.md');
  if (bot3 !== BUILTIN_BOT3_SOURCE) throw new Error('BUILTIN_BOT3_SOURCE does not match examples/bot3.md');
}

function dist(a, b) {
  const dm = distanceMap(b);
  return dm.get(`${a.sector}:${a.zone}`) ?? 999;
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await assertBuiltinSourcesMatchExamples();

  const replay = createReplay({ matchSeed: 1337, tickCap: 60, bot1SourceText: BUILTIN_BOT2_SOURCE });

  // Expect: BOT2 is the chaser shooter (moves toward closest bot, fires when SLOT1 ready)
  // Expect: BOT3 is the corner bunker (tries to go/stay at S1 Z1, shoots when close)
  const home = { sector: 1, zone: 1 };

  let sawBot2Move = false;
  let sawBot3MoveTowardHome = false;
  let sawBot2Shot = false;

  let lastBot3Loc = replay.state[0].bots.find(b => b.id === 'BOT3')?.loc ?? null;
  for (let t = 1; t < replay.state.length; t++) {
    const ev = replay.events[t] ?? [];

    if (ev.some(e => e.type === 'BOT_MOVED' && e.botId === 'BOT2')) sawBot2Move = true;

    const bot3 = replay.state[t].bots.find(b => b.id === 'BOT3');
    if (bot3 && lastBot3Loc) {
      const was = dist(lastBot3Loc, home);
      const now = dist(bot3.loc, home);
      if (now < was) sawBot3MoveTowardHome = true;
      lastBot3Loc = bot3.loc;
    }

    if (ev.some(e => e.type === 'BULLET_SPAWN' && e.ownerBotId === 'BOT2')) sawBot2Shot = true;
  }

  must(sawBot2Move, 'Expected BOT2 to move at least once');
  must(sawBot3MoveTowardHome, 'Expected BOT3 to move toward home (S1 Z1) at least once');
  must(sawBot2Shot, 'Expected BOT2 to shoot at least once');

  const finalBot3Loc = replay.state[replay.state.length - 1].bots.find(b => b.id === 'BOT3')?.loc ?? null;
  must(finalBot3Loc && (locEq(finalBot3Loc, home) || dist(finalBot3Loc, home) <= 2), 'Expected BOT3 to end near its bunker home');

  console.log('QA OK (seed=1337)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
