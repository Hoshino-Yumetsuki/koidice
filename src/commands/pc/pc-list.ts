/**
 * .pc list 列出所有人物卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc list 命令
 */
export function registerPcListCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.list', '列出所有人物卡')
    .usage('.pc.list')
    .example('.pc.list')
    .action(async ({ session }) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        const cards = await characterService.getAllCards(session);

        if (cards.length === 0) {
          return '还没有任何人物卡，使用 .pc.new 创建喵~';
        }

        // 获取当前绑定的卡
        const boundCard = await characterService.getBoundCard(session);

        const cardList = cards
          .map((card) => {
            const bound = card.id === boundCard?.id ? ' ★' : '';
            const attrCount = Object.keys(
              JSON.parse(card.attributes) as Record<string, number>
            ).length;
            return `- ${card.cardName} [${card.cardType}] (${attrCount}个属性)${bound}`;
          })
          .join('\n');

        return `${session.username} 的人物卡列表 (${cards.length}/16):\n${cardList}\n\n★ 表示当前群组绑定的人物卡`;
      } catch (error) {
        logger.error('列出人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '列出人物卡时发生错误';
      }
    });
}
