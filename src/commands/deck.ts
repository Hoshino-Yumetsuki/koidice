import type { Command } from 'koishi';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';

/**
 * 牌堆命令 .draw / .deck
 */
export function registerDeckCommands(parent: Command, _config: Config, diceAdapter: DiceAdapter) {
  // 抽卡命令
  parent
    .subcommand('.draw <deckName:text> [count:number]', '从牌堆抽卡')
    .alias('.deck')
    .action(async ({ session }, deckName, count = 1) => {
      if (!session) {
        return '无法获取会话信息';
      }

      if (!deckName) {
        return '请指定牌堆名称';
      }

      if (count < 1 || count > 10) {
        return '抽取数量必须在1-10之间';
      }

      try {
        const result = diceAdapter.drawFromDeck(deckName, count);

        if (!result.success) {
          return result.message || '抽卡失败';
        }

        if (result.cards.length === 0) {
          return `牌堆 ${deckName} 已空或不存在`;
        }

        return `${session.username} 从牌堆 ${deckName} 抽取了: ${result.cards.join(', ')}`;
      } catch (error) {
        logger.error('抽卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return `抽卡失败: ${message}`;
      }
    });

  // 列出牌堆
  parent.subcommand('.draw.list', '列出所有牌堆').action(async () => {
    try {
      return diceAdapter.listDecks();
    } catch (error) {
      logger.error('列出牌堆错误:', error);
      return '获取牌堆列表失败';
    }
  });
}
