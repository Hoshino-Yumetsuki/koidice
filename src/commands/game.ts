import type { Command, Context } from 'koishi';
import type { Config } from '../config';
import { logger } from '../index';
import { GameSessionService } from '../services/game-session-service';

/**
 * 游戏会话命令 .game
 */
export function registerGameCommands(parent: Command, ctx: Context, _config: Config) {
  const gameService = new GameSessionService(ctx);

  const cmd = parent.subcommand('.game', '游戏会话管理').usage('管理 TRPG 游戏会话');

  // .game new - 创建游戏
  cmd.subcommand('.new [name:text]', '创建新游戏').action(async ({ session }, name) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      // 检查是否已有游戏
      const existing = await gameService.getSession(session);
      if (existing) {
        return `当前窗口已有游戏「${existing.name}」，请先使用 .game over 结束`;
      }

      // 解析规则（如果名称以规则开头）
      let gameName = name;
      let rule: string | undefined;
      if (name) {
        const match = name.match(/^(COC7?|DND5?E?|Maid)-(.+)$/);
        if (match) {
          const [, matchedRule, matchedName] = match;
          if (matchedRule && matchedName) {
            rule = matchedRule;
            gameName = matchedName;
          }
        }
      }

      const game = await gameService.createSession(session, gameName);

      // 设置规则
      if (rule) {
        await gameService.setConfig(game.id, 'rule', rule);
      }

      // 自动添加创建者为 GM
      await gameService.addGM(game.id, session.userId);

      return `已创建游戏「${game.name}」${rule ? `，规则：${rule}` : ''}\n你已成为 GM`;
    } catch (error) {
      logger.error('创建游戏失败:', error);
      return `创建游戏失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game state - 查看状态
  cmd.subcommand('.state', '查看游戏状态').action(async ({ session }) => {
    if (!session) {
      return '无法获取会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      const gmList = JSON.parse(game.gmList || '[]');
      const playerList = JSON.parse(game.playerList || '[]');
      const observerList = JSON.parse(game.observerList || '[]');
      const areas = JSON.parse(game.areas || '[]');
      const config = JSON.parse(game.config || '{}');

      const lines = [
        `游戏「${game.name}」`,
        `GM (${gmList.length}): ${gmList.join(', ') || '无'}`,
        `玩家 (${playerList.length}): ${playerList.join(', ') || '无'}`,
        `旁观 (${observerList.length}): ${observerList.join(', ') || '无'}`,
        `区域 (${areas.length}): ${areas.length} 个窗口`
      ];

      if (config.rule) {
        lines.push(`规则: ${config.rule}`);
      }
      if (config.rr_rc) {
        lines.push(`检定房规: ${config.rr_rc}`);
      }

      return lines.join('\n');
    } catch (error) {
      logger.error('查看游戏状态失败:', error);
      return `查看状态失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game master - 登记为 GM
  cmd.subcommand('.master', '登记为 GM').action(async ({ session }) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      const gmList = JSON.parse(game.gmList || '[]');

      // 如果已经是 GM
      if (gmList.includes(session.userId)) {
        return '你已经是 GM 了';
      }

      // 如果已有 GM，需要群管理权限
      if (gmList.length > 0) {
        // TODO: 检查群管理权限
        // 暂时允许
      }

      await gameService.addGM(game.id, session.userId);
      return '你已成为 GM';
    } catch (error) {
      logger.error('登记 GM 失败:', error);
      return `登记失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game join - 加入游戏
  cmd.subcommand('.join', '加入游戏').action(async ({ session }) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      const success = await gameService.addPlayer(game.id, session.userId);
      if (success) {
        return '你已加入游戏';
      } else {
        return '你已经在游戏中了';
      }
    } catch (error) {
      logger.error('加入游戏失败:', error);
      return `加入失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game exit - 退出游戏
  cmd.subcommand('.exit', '退出游戏').action(async ({ session }) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      const removedPlayer = await gameService.removePlayer(game.id, session.userId);
      const removedGM = await gameService.removeGM(game.id, session.userId);

      if (removedPlayer || removedGM) {
        return '你已退出游戏';
      } else {
        return '你不在游戏中';
      }
    } catch (error) {
      logger.error('退出游戏失败:', error);
      return `退出失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game kick - 踢出玩家 (仅 GM)
  cmd.subcommand('.kick <userId:text>', '踢出玩家 (仅 GM)').action(async ({ session }, userId) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      if (!gameService.isGM(game, session.userId)) {
        return '只有 GM 可以踢出玩家';
      }

      if (!userId) {
        return '请指定要踢出的玩家 ID';
      }

      const removedPlayer = await gameService.removePlayer(game.id, userId);
      const removedOb = await gameService.removeObserver(game.id, userId);

      if (removedPlayer || removedOb) {
        return `已将 ${userId} 踢出游戏`;
      } else {
        return `${userId} 不在游戏中`;
      }
    } catch (error) {
      logger.error('踢出玩家失败:', error);
      return `踢出失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game call - 呼叫全体玩家 (仅 GM)
  cmd.subcommand('.call', '呼叫全体玩家 (仅 GM)').action(async ({ session }) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      if (!gameService.isGM(game, session.userId)) {
        return '只有 GM 可以呼叫玩家';
      }

      const playerList = JSON.parse(game.playerList || '[]');
      if (playerList.length === 0) {
        return '当前游戏没有玩家';
      }

      // 生成 @ 消息
      const mentions = playerList.map((uid: string) => `<at id="${uid}"/>`).join(' ');
      return `${mentions}\nGM 呼叫全体玩家`;
    } catch (error) {
      logger.error('呼叫玩家失败:', error);
      return `呼叫失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game set - 设置游戏配置 (仅 GM)
  cmd
    .subcommand('.set <key:text> [value:text]', '设置游戏配置 (仅 GM)')
    .action(async ({ session }, key, value) => {
      if (!session?.userId) {
        return '无法获取用户会话信息';
      }
      try {
        const game = await gameService.getSession(session);
        if (!game) {
          return '当前窗口没有进行中的游戏';
        }

        if (!gameService.isGM(game, session.userId)) {
          return '只有 GM 可以设置游戏配置';
        }

        if (!key) {
          return '请指定配置项';
        }

        if (value === undefined) {
          // 查看配置
          const val = await gameService.getConfig(game.id, key);
          return `${key} = ${val !== undefined ? val : '(未设置)'}`;
        } else {
          // 设置配置
          await gameService.setConfig(game.id, key, value);
          return `已设置 ${key} = ${value}`;
        }
      } catch (error) {
        logger.error('设置游戏配置失败:', error);
        return `设置失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

  // .game open - 将当前窗口加入游戏区域 (仅 GM)
  cmd
    .subcommand('.open <gameName:text>', '将当前窗口加入指定游戏 (仅 GM)')
    .action(async ({ session }, gameName) => {
      if (!session?.userId) {
        return '无法获取用户会话信息';
      }
      try {
        if (!gameName) {
          return '请指定游戏名称';
        }

        const game = await gameService.getSessionByName(gameName, session.platform);
        if (!game) {
          return `游戏「${gameName}」不存在`;
        }

        if (
          !gameService.isGM(game, session.userId) &&
          !gameService.isPlayer(game, session.userId)
        ) {
          return '只有 GM 或玩家可以打开游戏窗口';
        }

        const guildId = session.guildId || session.channelId || session.userId;
        await gameService.addArea(game.id, guildId);
        return `当前窗口已加入游戏「${game.name}」`;
      } catch (error) {
        logger.error('打开游戏窗口失败:', error);
        return `打开失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

  // .game close - 关闭当前窗口的游戏
  cmd.subcommand('.close', '关闭当前窗口的游戏').action(async ({ session }) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      if (!gameService.isGM(game, session.userId)) {
        return '只有 GM 可以关闭游戏窗口';
      }

      const guildId = session.guildId || session.channelId || session.userId;
      await gameService.removeArea(game.id, guildId);
      return `已将当前窗口从游戏「${game.name}」移除`;
    } catch (error) {
      logger.error('关闭游戏窗口失败:', error);
      return `关闭失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game over - 销毁游戏 (仅 GM)
  cmd.subcommand('.over', '销毁游戏 (仅 GM)').action(async ({ session }) => {
    if (!session?.userId) {
      return '无法获取用户会话信息';
    }
    try {
      const game = await gameService.getSession(session);
      if (!game) {
        return '当前窗口没有进行中的游戏';
      }

      if (!gameService.isGM(game, session.userId)) {
        return '只有 GM 可以销毁游戏';
      }

      const gameName = game.name;
      await gameService.destroySession(game.id);
      return `游戏「${gameName}」已结束`;
    } catch (error) {
      logger.error('销毁游戏失败:', error);
      return `销毁失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // .game rou - 轮盘骰 (仅 GM)
  cmd
    .subcommand('.rou [action:text] [param:text]', '轮盘骰设置 (仅 GM)')
    .usage(
      '轮盘骰命令\n' +
        '.game rou 100 - 设置百面轮盘骰\n' +
        '.game rou 20*5 - 设置20面轮盘骰，每个点数重复5次\n' +
        '.game rou hist - 查看当轮记录\n' +
        '.game rou reset - 还原轮盘骰\n' +
        '.game rou clr - 清空轮盘骰'
    )
    .action(async ({ session }, action, _param) => {
      if (!session?.userId) {
        return '无法获取用户会话信息';
      }
      try {
        const game = await gameService.getSession(session);
        if (!game) {
          return '当前窗口没有进行中的游戏';
        }

        if (!action) {
          return '请指定操作：数字、hist、reset 或 clr';
        }

        // 查看历史
        if (action === 'hist') {
          const roulette = JSON.parse(game.roulette || '{}');
          if (Object.keys(roulette).length === 0) {
            return '当前没有轮盘骰';
          }

          const lines = ['轮盘骰历史:'];
          for (const [face, data] of Object.entries(roulette)) {
            const { pool, copy } = data as any;
            const total = pool.length;
            lines.push(`D${face}: 剩余 ${total}/${parseInt(face, 10) * (copy || 1)} 个`);
          }
          return lines.join('\n');
        }

        // 以下操作需要 GM 权限
        if (!gameService.isGM(game, session.userId)) {
          return '只有 GM 可以设置轮盘骰';
        }

        // 重置
        if (action === 'reset') {
          // TODO: 实现重置逻辑
          return '轮盘骰已重置';
        }

        // 清空
        if (action === 'clr' || action === 'clear') {
          await gameService.clearRoulette(game.id);
          return '轮盘骰已清空';
        }

        // 设置轮盘骰
        const match = action.match(/^(\d+)(?:\*(\d+))?$/);
        if (match) {
          const [, faceText, copyText] = match;
          if (!faceText) {
            return '无效的参数，请使用数字、hist、reset 或 clr';
          }
          const face = parseInt(faceText, 10);
          const copy = copyText ? parseInt(copyText, 10) : 1;

          if (face > 100 || face < 2) {
            return '骰子面数必须在 2-100 之间';
          }

          if (face * copy > 100) {
            return '总数不能超过 100';
          }

          // 创建轮盘骰池
          const pool: number[] = [];
          for (let i = 1; i <= face; i++) {
            for (let j = 0; j < copy; j++) {
              pool.push(i);
            }
          }

          await gameService.setRoulette(game.id, face, {
            face,
            copy,
            pool,
            sizRes: pool.length
          });

          return `已设置 D${face}${copy > 1 ? `*${copy}` : ''} 轮盘骰`;
        }

        return '无效的参数，请使用数字、hist、reset 或 clr';
      } catch (error) {
        logger.error('轮盘骰操作失败:', error);
        return `操作失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

  return cmd;
}
