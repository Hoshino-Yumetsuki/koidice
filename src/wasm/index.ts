/**
 * Dice WASM 模块导出
 */

export * from './types'
export * from './adapter'
export {
  initDiceModule,
  isModuleReady,
  createDiceAdapter,
  waitForReady
} from './adapter'
