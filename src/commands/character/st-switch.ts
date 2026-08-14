/**
 * .st switch 切换人物卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .st switch 命令
 */
export function registerStSwitchCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.st.switch [cardName:text]', '切换人物卡')
    .usage('.st.switch [人物卡名]')
    .example('.st.switch Alice')
    .example('.st.switch')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息';
      }
      try {
        // 没有参数：切换到 default 人物卡
        const targetName = cardName || 'default';

        // 检查人物卡是否存在
        const card = await characterService.getCard(session, targetName);

        if (!card) {
          // 如果不存在，创建一个空的 default 卡
          if (targetName === 'default') {
            await characterService.createCard(session, 'default', 'COC7', {});
            return `已创建并切换到 default 人物卡`;
          }
          return `人物卡 ${targetName} 不存在，请先创建`;
        }

        await characterService.switchCard(session, targetName);
        return `已切换到人物卡 ${targetName}`;
      } catch (error) {
        logger.error('切换人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '切换人物卡时发生错误';
      }
    });
}
