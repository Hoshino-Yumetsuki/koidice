import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

export function registerStClrCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.st.clr [cardName:text]', '删除人物卡')
    .usage('.st.clr [人物卡名]')
    .example('.st.clr')
    .example('.st.clr Alice')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息';
      }
      try {
        // 没有参数：删除当前激活的人物卡
        if (!cardName) {
          const activeCard = await characterService.getActiveCard(session);
          if (!activeCard) {
            return '当前没有激活的人物卡';
          }
          const success = await characterService.deleteCard(session, activeCard.cardName);
          return success ? `已删除人物卡 ${activeCard.cardName}` : '删除失败';
        }

        // 删除指定人物卡
        const success = await characterService.deleteCard(session, cardName);
        return success ? `已删除人物卡 ${cardName}` : '人物卡不存在';
      } catch (error) {
        logger.error('删除人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '删除人物卡时发生错误';
      }
    });
}
