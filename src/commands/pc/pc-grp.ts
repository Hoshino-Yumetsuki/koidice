/**
 * .pc grp 列出各群绑定卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc grp 命令
 */
export function registerPcGrpCommand(parent: Command, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.grp', '列出各群绑定的人物卡')
    .usage('.pc.grp')
    .example('.pc.grp')
    .action(async ({ session }) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        const bindings = await characterService.getAllBindings(session);

        if (bindings.length === 0) {
          return '还没有绑定任何人物卡到群组喵~';
        }

        const bindingList = bindings
          .map((binding) => {
            const location = binding.guildId === '' ? '全局默认' : `群组 ${binding.guildId}`;
            return `- ${location}: ${binding.cardName}`;
          })
          .join('\n');

        return `${session.username} 的群组绑定:\n${bindingList}`;
      } catch (error) {
        logger.error('列出群组绑定错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '列出群组绑定时发生错误';
      }
    });
}
