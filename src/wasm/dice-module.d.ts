declare module '*.js' {
  import type { DiceModule, EmscriptenModuleConfig } from './types';

  const createDiceModule: (config?: EmscriptenModuleConfig) => Promise<DiceModule>;
  export default createDiceModule;
}
