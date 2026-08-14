/**
 * .pc 多人物卡命令模块
 * 导出所有.pc相关命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import type { ExtensionService } from '../../services/extension-service';
import { registerPcNewCommand } from './pc-new';
import { registerPcTagCommand } from './pc-tag';
import { registerPcShowCommand } from './pc-show';
import { registerPcNnCommand } from './pc-nn';
import { registerPcCpyCommand } from './pc-cpy';
import { registerPcDelCommand } from './pc-del';
import { registerPcListCommand } from './pc-list';
import { registerPcGrpCommand } from './pc-grp';
import { registerPcBuildCommand } from './pc-build';
import { registerPcRedoCommand } from './pc-redo';
import { registerPcClrCommand } from './pc-clr';
import { registerPcStatCommand } from './pc-stat';

/**
 * 注册所有.pc命令
 */
export function registerPcCommands(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService
) {
  // 注册子命令到parent
  registerPcNewCommand(parent, ctx, diceAdapter, extensionService);
  registerPcTagCommand(parent, ctx, diceAdapter);
  registerPcShowCommand(parent, ctx, diceAdapter);
  registerPcNnCommand(parent, ctx, diceAdapter);
  registerPcCpyCommand(parent, ctx, diceAdapter);
  registerPcDelCommand(parent, ctx, diceAdapter);
  registerPcListCommand(parent, ctx, diceAdapter);
  registerPcGrpCommand(parent, ctx, diceAdapter);
  registerPcBuildCommand(parent, ctx, diceAdapter);
  registerPcRedoCommand(parent, ctx, diceAdapter);
  registerPcClrCommand(parent, ctx, diceAdapter);
  registerPcStatCommand(parent, ctx, diceAdapter);
}
