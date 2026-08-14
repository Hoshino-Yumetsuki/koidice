/**
 * .pc stat 查看角色掷骰统计命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc stat 命令
 */
export function registerPcStatCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.stat [cardName:text]', '查看角色掷骰统计')
    .usage('.pc.stat ([卡名])')
    .example('.pc.stat')
    .example('.pc.stat Alice')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        let targetName = '';

        if (cardName?.trim()) {
          targetName = cardName.trim();
          const card = await characterService.getCard(session, targetName);
          if (!card) {
            return `人物卡 ${targetName} 不存在喵~`;
          }
        } else {
          const boundCard = await characterService.getBoundCard(session);
          if (!boundCard) {
            return '当前没有绑定人物卡，请使用 .pc.tag 绑定或指定卡名喵~';
          }
          targetName = boundCard.cardName;
        }

        const stats = await characterService.getStats(session, targetName);

        if (!stats || stats.totalRolls === 0) {
          return `人物卡 ${targetName} 还没有掷骰记录喵~`;
        }

        const successRate =
          stats.totalRolls > 0
            ? (
                ((stats.criticalSuccess +
                  stats.extremeSuccess +
                  stats.hardSuccess +
                  stats.regularSuccess) /
                  stats.totalRolls) *
                100
              ).toFixed(1)
            : '0.0';

        return `人物卡 ${targetName} 的掷骰统计:
总掷骰次数: ${stats.totalRolls}
大成功: ${stats.criticalSuccess} (${((stats.criticalSuccess / stats.totalRolls) * 100).toFixed(1)}%)
极难成功: ${stats.extremeSuccess} (${((stats.extremeSuccess / stats.totalRolls) * 100).toFixed(1)}%)
困难成功: ${stats.hardSuccess} (${((stats.hardSuccess / stats.totalRolls) * 100).toFixed(1)}%)
普通成功: ${stats.regularSuccess} (${((stats.regularSuccess / stats.totalRolls) * 100).toFixed(1)}%)
失败: ${stats.failure} (${((stats.failure / stats.totalRolls) * 100).toFixed(1)}%)
大失败: ${stats.fumble} (${((stats.fumble / stats.totalRolls) * 100).toFixed(1)}%)
总成功率: ${successRate}%`;
      } catch (error) {
        logger.error('查看统计错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '查看统计时发生错误';
      }
    });
}
