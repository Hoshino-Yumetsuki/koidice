/**
 * .pc cpy 复制人物卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc cpy 命令
 */
export function registerPcCpyCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.cpy <args:text>', '复制人物卡')
    .usage('.pc.cpy [卡名1]=[卡名2]')
    .example('.pc.cpy Alice=Bob')
    .action(async ({ session }, args) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        if (!args || !args.includes('=')) {
          return '请使用格式: .pc.cpy 目标卡名=源卡名 喵~';
        }

        const [targetName, sourceName] = args.split('=').map((s) => s.trim());

        if (!targetName || !sourceName) {
          return '请指定有效的卡名喵~';
        }

        // 复制
        await characterService.copyCard(session, sourceName, targetName);

        return `已将 ${sourceName} 的属性复制到 ${targetName}`;
      } catch (error) {
        logger.error('复制人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '复制人物卡时发生错误';
      }
    });
}
