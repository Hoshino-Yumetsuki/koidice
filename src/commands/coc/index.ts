import type { Command, Context } from 'koishi'
import type { Config } from '../../config'
import type { DiceAdapter } from '../../wasm'

import { registerGrowthCommand } from './growth'
import { registerSanityCheckCommand } from './sanity'
import { registerCOCGeneratorCommand } from './generator'

/**
 * 注册所有COC相关命令
 * @param parent 父命令
 * @param ctx Koishi Context
 * @param config 配置
 * @param diceAdapter Dice适配器
 */
export function registerCOCCommands(
  parent: Command,
  ctx: Context,
  config: Config,
  diceAdapter: DiceAdapter
) {
  registerGrowthCommand(parent, ctx, config, diceAdapter)
  registerSanityCheckCommand(parent, ctx, config, diceAdapter)
  registerCOCGeneratorCommand(parent, config, diceAdapter)
}

// 导出各个子模块
export * from './growth'
export * from './sanity'
export * from './generator'
