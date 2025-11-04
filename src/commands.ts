import type { Context } from 'koishi'
import type { Config } from './config'
import { getDiceAdapter, type DiceAdapter } from './wasm'
import { logger } from './index'
import {
  registerRollCommand,
  registerCOCCheckCommand,
  registerGrowthCommand,
  registerCOCGeneratorCommand,
  registerSanityCheckCommand,
  registerDNDGeneratorCommand,
  registerDeckCommands,
  registerCharacterCommands,
  registerAttributeCommands,
  registerInsanityCommands,
  registerInitiativeCommands,
  registerSettingsCommands,
  registerObserverCommands,
  registerWODCommands,
  registerRuleCommands
} from './commands/index'

let diceAdapter: DiceAdapter | null = null

/**
 * 初始化 Dice 适配器
 */
export async function initializeDiceAdapter() {
  if (!diceAdapter) {
    diceAdapter = await getDiceAdapter()
    logger.info(`Dice WASM 模块加载成功: ${diceAdapter.getVersion()}`)
  }
  return diceAdapter
}

/**
 * 注册所有命令
 */
export async function registerCommands(ctx: Context, config: Config) {
  if (!diceAdapter) {
    throw new Error('Dice adapter not initialized')
  }

  // 创建主命令
  const koidice = ctx
    .command('koidice', 'Dice! TRPG骰子机器人')
    .alias('koid')
    .usage('使用 koidice.<子命令> 或 koid.<子命令> 调用功能')

  // 注册所有子命令
  registerDeckCommands(koidice, config, diceAdapter)
  registerCharacterCommands(koidice, config, diceAdapter)
  registerAttributeCommands(koidice, config, diceAdapter)
  registerRollCommand(koidice, config, diceAdapter)

  if (config.enableCOC) {
    registerCOCCheckCommand(koidice, config, diceAdapter)
    registerGrowthCommand(koidice, config, diceAdapter)
    registerCOCGeneratorCommand(koidice, config, diceAdapter)
    registerSanityCheckCommand(koidice, config, diceAdapter)
    registerInsanityCommands(koidice, config, diceAdapter)
  }

  if (config.enableDND) {
    registerDNDGeneratorCommand(koidice, config, diceAdapter)
  }

  registerInitiativeCommands(koidice, config, diceAdapter)
  registerSettingsCommands(koidice, config, diceAdapter)
  registerObserverCommands(koidice, config, diceAdapter)
  registerWODCommands(koidice, config, diceAdapter)
  registerRuleCommands(koidice, config, diceAdapter)
}
