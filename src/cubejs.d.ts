declare module 'cubejs' {
  export default class Cube {
    constructor(state?: Cube | unknown)
    static fromString(s: string): Cube
    static random(): Cube
    static initSolver(): void
    static asyncInit(workerPath: string, cb: () => void): void
    static asyncSolve(cube: Cube, cb: (algorithm: string) => void): void
    static inverse(algorithm: string): string
    asString(): string
    clone(): Cube
    randomize(): void
    isSolved(): boolean
    move(algorithm: string): void
    solve(maxDepth?: number): string
  }
}
