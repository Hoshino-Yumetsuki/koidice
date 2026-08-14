/**
 * .pc redo 清空并重新生成属性命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc redo 命令
 */
export function registerPcRedoCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.redo [args:text]', '清空并重新生成人物卡属性')
    .usage('.pc.redo ([生成参数]:)(卡名)')
    .example('.pc.redo')
    .example('.pc.redo Alice')
    .example('.pc.redo 80:Alice')
    .action(async ({ session }, args) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        let cardName = '';

        if (args?.trim()) {
          const parts = args.trim().split(':');
          if (parts.length === 1) {
            cardName = parts[0]?.trim() ?? '';
          } else if (parts.length === 2) {
            cardName = parts[1]?.trim() ?? '';
          }
        }

        // 获取目标卡
        let targetCard = null;
        if (cardName) {
          targetCard = await characterService.getCard(session, cardName);
          if (!targetCard) {
            return `人物卡 ${cardName} 不存在喵~`;
          }
        } else {
          targetCard = await characterService.getBoundCard(session);
          if (!targetCard) {
            return '当前没有绑定人物卡，请使用 .pc.tag 绑定或指定卡名喵~';
          }
          cardName = targetCard.cardName;
        }

        // 根据卡类型生成属性
        let attributes: Record<string, number> = {};
        const cardType = targetCard.cardType;

        if (cardType === 'COC7') {
          const cocResult = diceAdapter.generateCOC7();
          const jsonResult = diceAdapter.parseCOCAttributes(cocResult);
          if (jsonResult && typeof jsonResult === 'string') {
            try {
              attributes = JSON.parse(jsonResult) as Record<string, number>;
            } catch (e) {
              logger.warn('解析COC属性失败:', e);
            }
          }
        } else if (cardType === 'COC6') {
          const cocResult = diceAdapter.generateCOC6();
          const jsonResult = diceAdapter.parseCOCAttributes(cocResult);
          if (jsonResult && typeof jsonResult === 'string') {
            try {
              attributes = JSON.parse(jsonResult) as Record<string, number>;
            } catch (e) {
              logger.warn('解析COC属性失败:', e);
            }
          }
        } else {
          return `暂不支持 ${cardType} 类型的属性生成喵~`;
        }

        if (Object.keys(attributes).length === 0) {
          return '生成属性失败喵~';
        }

        // 清空并设置新属性
        await ctx.database.set('koidice_character', targetCard.id, {
          attributes: JSON.stringify(attributes),
          updatedAt: new Date()
        });

        const attrText = Object.entries(attributes)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');

        return `已重新生成人物卡 ${cardName} 的属性:\n${attrText}`;
      } catch (error) {
        logger.error('重新生成属性错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '重新生成属性时发生错误';
      }
    });
}
