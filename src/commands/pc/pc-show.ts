/**
 * .pc show 展示人物卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc show 命令
 */
export function registerPcShowCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.show [cardName:text]', '展示人物卡属性')
    .usage('.pc.show ([卡名])')
    .example('.pc.show')
    .example('.pc.show Alice')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        let targetCard = null;
        let targetName = '';

        if (cardName?.trim()) {
          targetName = cardName.trim();
          targetCard = await characterService.getCard(session, targetName);
          if (!targetCard) {
            return `人物卡 ${targetName} 不存在喵~`;
          }
        } else {
          // 获取当前群组绑定的卡
          targetCard = await characterService.getBoundCard(session);
          if (!targetCard) {
            return '当前没有绑定人物卡，请使用 .pc.tag 绑定或指定卡名喵~';
          }
          targetName = targetCard.cardName;
        }

        const attributes = JSON.parse(targetCard.attributes) as Record<string, number>;

        if (Object.keys(attributes).length === 0) {
          return `人物卡 ${targetName} 还没有任何属性`;
        }

        const attrLines = Object.entries(attributes)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');

        return `人物卡 ${targetName} [${targetCard.cardType}]:\n${attrLines}`;
      } catch (error) {
        logger.error('展示人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '展示人物卡时发生错误';
      }
    });
}
