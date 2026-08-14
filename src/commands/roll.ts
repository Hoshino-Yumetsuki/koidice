import type { Command, Context } from 'koishi';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';
import { getObservers } from './observer';

/**
 * 掷骰命令 .r / .rh / .rs
 * 支持功能:
 * - 基础掷骰: .r 1d100
 * - 多轮掷骰: .r 3#1d6 (掷3次)
 * - 暗骰: .rh 1d100
 * - 简化输出: .rs 1d10+1d6+3 (只显示结果)
 */
export function registerRollCommand(
  parent: Command,
  ctx: Context,
  config: Config,
  diceAdapter: DiceAdapter
) {
  // 注册 .r 命令（普通掷骰）
  parent
    .subcommand('.r [...args:text]', '掷骰')
    .usage('用法: .r [掷骰表达式] [原因]')
    .example('.r 1d100 - 掷一个百面骰')
    .example('.r 3#1d6 伤害 - 掷3次d6')
    .example('.r 1d10+1d6+3 沙鹰伤害 - 复杂表达式')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, false, false, args);
    });

  // 注册 .rh 命令（暗骰）
  parent
    .subcommand('.rh [...args:text]', '暗骰')
    .usage('用法: .rh [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, true, false, args);
    });

  // 注册 .rs 命令（简化输出）
  parent
    .subcommand('.rs [...args:text]', '掷骰（简化输出）')
    .usage('用法: .rs [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, false, true, args);
    });

  // 注册 .rsh 命令（暗骰+简化输出）
  parent
    .subcommand('.rsh [...args:text]', '暗骰（简化输出）')
    .usage('用法: .rsh [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, true, true, args);
    });
}

/**
 * 处理掷骰命令
 */
async function handleRollCommand(
  session: any,
  ctx: Context,
  diceAdapter: DiceAdapter,
  config: Config,
  isHidden: boolean,
  isSimple: boolean,
  args: string[]
): Promise<string> {
  if (!session) {
    return '无法获取会话信息';
  }

  try {
    const rawCommand = args.join(' ');
    const userId = session.userId;
    const channelId = session.channelId || '';

    const result = diceAdapter.processRoll(
      rawCommand,
      userId,
      channelId,
      isHidden,
      isSimple,
      config.defaultDice
    );

    if (!result.success) {
      return result.errorMsg || '掷骰失败';
    }

    // 暗骰处理
    if (isHidden && channelId) {
      // 构建详细消息
      const detailParts = [session.username];
      if (result.reason) detailParts.push(result.reason);

      // 格式化结果
      if (result.results && result.results.length > 0) {
        if (isSimple) {
          const totals = result.results.map((r: any) => r.total);
          detailParts.push(
            totals.length === 1 ? String(totals[0] ?? '') : `{ ${totals.join(', ')} }`
          );
        } else {
          const details = result.results.map((r: any, i: number) =>
            (result.rounds ?? 1) > 1 ? `#${i + 1} ${r.detail}` : r.detail
          );
          detailParts.push(details.join(' '));
        }
      }

      const detailMessage = detailParts.join(' ');

      // 私发给掷骰者
      try {
        await session.bot.sendPrivateMessage(userId, detailMessage);
      } catch (error) {
        logger.warn(`私发暗骰结果失败:`, error);
      }

      // 私发给旁观者
      try {
        const observers = await getObservers(ctx, channelId, session.platform);
        for (const observerId of observers) {
          if (observerId !== userId) {
            try {
              await session.bot.sendPrivateMessage(observerId, detailMessage);
            } catch (error) {
              logger.warn(`私发暗骰结果给旁观者失败:`, error);
            }
          }
        }
      } catch (error) {
        logger.error('获取旁观者列表失败:', error);
      }

      // 群聊显示提示
      const publicParts = [session.username, '进行了暗骰'];
      if (result.reason) publicParts.push(result.reason);
      return publicParts.join(' ');
    }

    // 普通掷骰：格式化输出
    const parts = [session.username];
    if (result.reason) parts.push(result.reason);

    if (result.results && result.results.length > 0) {
      if (isSimple) {
        const totals = result.results.map((r: any) => r.total);
        parts.push(totals.length === 1 ? String(totals[0] ?? '') : `{ ${totals.join(', ')} }`);
      } else {
        const details = result.results.map((r: any, i: number) =>
          (result.rounds ?? 1) > 1 ? `#${i + 1} ${r.detail}` : r.detail
        );
        parts.push(details.join(' '));
      }
    }

    return parts.join(' ');
  } catch (error) {
    logger.error('掷骰错误:', error);
    return '掷骰时发生错误';
  }
}
