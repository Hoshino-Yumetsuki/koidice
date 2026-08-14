/**
 * .pc del 删除人物卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc del 命令
 */
export function registerPcDelCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.del <cardName:text>', '删除人物卡')
    .usage('.pc.del [卡名]')
    .example('.pc.del Alice')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        if (!cardName || cardName.trim() === '') {
          return '请指定要删除的卡名喵~';
        }

        const targetName = cardName.trim();

        // 检查卡是否存在
        const card = await characterService.getCard(session, targetName);
        if (!card) {
          return `人物卡 ${targetName} 不存在喵~`;
        }

        // 删除
        const success = await characterService.deleteCard(session, targetName);

        return success ? `已删除人物卡: ${targetName}` : '删除失败';
      } catch (error) {
        logger.error('删除人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '删除人物卡时发生错误';
      }
    });
}
