/**
 * 人物卡命令模块
 * 导出所有人物卡相关命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import type { ExtensionService } from '../../services/extension-service';
import { registerStSetCommand } from './st-set';
import { registerStShowCommand } from './st-show';
import { registerStSwitchCommand } from './st-switch';
import { registerStDelCommand } from './st-del';
import { registerStClrCommand } from './st-clr';
import { registerPcCommands } from '../pc';

export function registerCharacterCommands(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService
) {
  registerStShowCommand(parent, ctx, diceAdapter);
  registerStSwitchCommand(parent, ctx, diceAdapter);
  registerStDelCommand(parent, ctx, diceAdapter);
  registerStClrCommand(parent, ctx, diceAdapter);

  registerStSetCommand(parent, ctx, diceAdapter);

  // 注册.pc多人物卡命令
  registerPcCommands(parent, ctx, diceAdapter, extensionService);
}

export * from './types';
export * from './parser';
