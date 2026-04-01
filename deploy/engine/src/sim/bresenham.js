/**
 * Bresenham 8-connected line stepping.
 * Returns intermediate points excluding the start, including the end.
 *
 * All inputs must be integers.
 */
export function bresenhamPoints(from, to) {
  let x0 = from.x
  let y0 = from.y
  const x1 = to.x
  const y1 = to.y

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1

  let err = dx - dy

  /** @type {Array<{x:number,y:number}>} */
  const out = []

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err

    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }

    if (e2 < dx) {
      err += dx
      y0 += sy
    }

    out.push({ x: x0, y: y0 })
  }

  return out
}

function pushUniquePoint(out, p) {
  const last = out[out.length - 1]
  if (last && last.x === p.x && last.y === p.y) return
  out.push(p)
}

/**
 * Bresenham "supercover" stepping.
 *
 * This is a conservative variant used for collision detection.
 * It includes the start point and the end point, and when the
 * line crosses a grid corner (a diagonal step), it also includes
 * the two orthogonal neighbor points that are touched at that same
 * parametric time.
 *
 * Determinism notes:
 * - Inputs must be integers.
 * - Order is deterministic.
 * - For diagonal corner-crossings, we emit the intermediate points
 *   in a deterministic order (x-step then y-step), then emit the
 *   diagonal point.
 *
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 */
export function supercoverPoints(from, to) {
  let x0 = from.x
  let y0 = from.y
  const x1 = to.x
  const y1 = to.y

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1

  let err = dx - dy

  /** @type {Array<{x:number,y:number}>} */
  const out = [{ x: x0, y: y0 }]

  while (!(x0 === x1 && y0 === y1)) {
    const prevX = x0
    const prevY = y0

    const e2 = 2 * err
    const stepX = e2 > -dy
    const stepY = e2 < dx

    if (stepX) {
      err -= dy
      x0 += sx
    }

    if (stepY) {
      err += dx
      y0 += sy
    }

    if (stepX && stepY) {
      // Corner-crossing: include both orthogonal neighbors (supercover).
      // These correspond to stepping x-only and y-only at the same
      // parametric time as the diagonal step.
      pushUniquePoint(out, { x: prevX + sx, y: prevY })
      pushUniquePoint(out, { x: prevX, y: prevY + sy })
    }

    pushUniquePoint(out, { x: x0, y: y0 })
  }

  return out
}
