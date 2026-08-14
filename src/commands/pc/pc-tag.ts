/**
 * .pc tag 绑定人物卡到群组命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc tag 命令
 */
export function registerPcTagCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.tag [cardName:text]', '绑定人物卡到当前群组')
    .usage('.pc.tag ([卡名])')
    .example('.pc.tag Alice')
    .example('.pc.tag')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        const guildId = session.guildId || '';
        const isPrivate = !guildId;

        if (!cardName || cardName.trim() === '') {
          // 解绑
          await characterService.bindCard(session, null);
          if (isPrivate) {
            return '已解绑全局默认人物卡';
          }
          return '已解绑当前群组的人物卡，将使用全局默认卡';
        }

        const targetName = cardName.trim();

        // 检查卡是否存在
        const card = await characterService.getCard(session, targetName);
        if (!card) {
          return `人物卡 ${targetName} 不存在，请先创建喵~`;
        }

        // 绑定
        await characterService.bindCard(session, targetName);

        if (isPrivate) {
          return `已将 ${targetName} 设为全局默认人物卡`;
        }
        return `已在当前群组绑定人物卡: ${targetName}`;
      } catch (error) {
        logger.error('绑定人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '绑定人物卡时发生错误';
      }
    });
}
