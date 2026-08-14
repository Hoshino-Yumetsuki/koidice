import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../wasm';
import type { ExtensionService } from '../services/extension-service';

import { registerCharacterCommands } from './character/index';

/**
 * 注册所有人物卡相关命令
 * @param parent 父命令
 * @param ctx Koishi Context
 * @param diceAdapter Dice适配器
 * @param extensionService 扩展服务
 */
export function registerAttributeCharacterCommands(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService
) {
  registerCharacterCommands(parent, ctx, diceAdapter, extensionService);
}
