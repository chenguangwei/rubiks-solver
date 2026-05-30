export function splitAlgorithm(algorithm: string): string[] {
  return algorithm.split(/\s+/).filter(Boolean)
}

export function movesToArray(moves: string[] | string): string[] {
  return Array.isArray(moves) ? moves : splitAlgorithm(moves)
}

export function invertMove(move: string): string {
  if (move.endsWith("'")) return move.slice(0, -1)
  if (move.endsWith('2')) return move
  return `${move}'`
}

export function invertMoves(moves: readonly string[]): string[] {
  return [...moves].reverse().map(invertMove)
}
