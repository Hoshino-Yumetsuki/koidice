/**
 * .pc nn 重命名人物卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc nn 命令
 */
export function registerPcNnCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.nn <newName:text>', '重命名当前人物卡')
    .usage('.pc.nn [新卡名]')
    .example('.pc.nn Bob')
    .action(async ({ session }, newName) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        if (!newName || newName.trim() === '') {
          return '请指定新的卡名喵~';
        }

        const targetName = newName.trim();

        // 获取当前绑定的卡
        const currentCard = await characterService.getBoundCard(session);
        if (!currentCard) {
          return '当前没有绑定人物卡，请使用 .pc.tag 绑定喵~';
        }

        // 重命名
        await characterService.renameCard(session, currentCard.cardName, targetName);

        return `已将人物卡 ${currentCard.cardName} 重命名为 ${targetName}`;
      } catch (error) {
        logger.error('重命名人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '重命名人物卡时发生错误';
      }
    });
}
