import { compileBotProgram } from './compileBotProgram.js'

/**
 * Runtime-friendly wrapper around `compileBotProgram`.
 *
 * Guarantees for downstream consumers/tests:
 * - `program.pcToSourceLine[0] === 0`
 * - `program.pcToSourceLine.length === program.instructions.length + 1`
 * - control-flow instructions do not retain any string label fields
 *
 * @param {string} sourceText
 * @returns {{ program: { instructions: any[], pcToSourceLine: number[], labels?: Record<string, number> }, errors: {line:number,message:string}[] }}
 */
export function compileBotSource(sourceText) {
  const r = compileBotProgram(sourceText)

  const instructions = r.program.instructions.map((instr) => {
    if (!instr || typeof instr !== 'object') return instr

    if (instr.kind === 'GOTO') {
      return { kind: 'GOTO', targetPc: instr.pc }
    }

    if (instr.kind === 'IF_GOTO') {
      return { kind: 'IF_GOTO', expr: instr.expr, targetPc: instr.pc }
    }

    return instr
  })

  return {
    program: {
      instructions,
      pcToSourceLine: r.program.pcToSourceLine,
      labels: r.program.labels ?? {},
    },
    errors: r.errors,
  }
}
