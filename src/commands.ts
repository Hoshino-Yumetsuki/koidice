import type { Context } from 'koishi'
import type { Config } from './config'
import { getDiceAdapter, type DiceAdapter } from './wasm'
import { logger } from './index'
import {
  registerRollCommand,
  registerCheckCommand,
  registerCOCCommands,
  registerDNDGeneratorCommand,
  registerDeckCommands,
  registerAttributeCharacterCommands,
  registerInsanityCommands,
  registerInitiativeCommands,
  registerSettingsCommands,
  registerObserverCommands,
  registerWODCommands,
  registerRuleCommands,
  registerNicknameCommands
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
  registerAttributeCharacterCommands(koidice, ctx, diceAdapter)
  registerRollCommand(koidice, ctx, config, diceAdapter)
  registerNicknameCommands(koidice, ctx, config, diceAdapter)

  if (config.enableCOC) {
    registerCheckCommand(koidice, ctx, config, diceAdapter)
    registerCOCCommands(koidice, ctx, config, diceAdapter)
    registerInsanityCommands(koidice, config, diceAdapter)
  }

  if (config.enableDND) {
    registerDNDGeneratorCommand(koidice, config, diceAdapter)
  }

  registerInitiativeCommands(koidice, ctx, config, diceAdapter)
  registerSettingsCommands(koidice, ctx, config, diceAdapter)
  registerObserverCommands(koidice, ctx, config, diceAdapter)
  registerWODCommands(koidice, config, diceAdapter)
  registerRuleCommands(koidice, config, diceAdapter, ctx)
}
