/**
 * .pc build 根据模板生成属性命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc build 命令
 */
export function registerPcBuildCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.build [args:text]', '为人物卡生成属性')
    .usage('.pc.build ([生成参数]:)(卡名)')
    .example('.pc.build')
    .example('.pc.build Alice')
    .example('.pc.build 80:Alice')
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

        // 更新属性
        await characterService.setAttributes(session, cardName, attributes);

        const attrText = Object.entries(attributes)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');

        return `已为人物卡 ${cardName} 生成属性:\n${attrText}`;
      } catch (error) {
        logger.error('生成属性错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '生成属性时发生错误';
      }
    });
}
