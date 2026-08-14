import type { Command } from 'koishi';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';

export function registerDNDGeneratorCommand(
  parent: Command,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  parent.subcommand('.dnd [count:number]', 'DND人物作成').action(async ({ session }, count = 1) => {
    if (!session) {
      return '无法获取会话信息';
    }

    // 限制生成数量
    const maxCount = 10;
    if (count < 1 || count > maxCount) {
      return `生成数量必须在1-${maxCount}之间`;
    }

    try {
      const result = diceAdapter.generateDND(count);
      return `${session.username} 的DND人物:\n${result}`;
    } catch (error) {
      logger.error('DND人物作成错误:', error);
      return 'DND人物作成时发生错误';
    }
  });
}
