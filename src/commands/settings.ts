import type { Command, Context, Session } from 'koishi';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';

/**
 * 用户设置（扩展字段）
 */
interface UserSettingsExt {
  defaultDice?: number;
  cocRule?: number;
  nickname?: string;
}

/**
 * 加载用户设置
 */
async function loadSettings(ctx: Context, session: Session): Promise<UserSettingsExt> {
  try {
    const { userId, platform } = session;
    const records = await ctx.database.get('koidice_user_settings', {
      userId,
      platform
    });

    const record = records[0];
    if (record) {
      return {
        defaultDice: record.defaultDice,
        cocRule: undefined, // COC规则暂时不在数据库中
        nickname: undefined // 昵称暂时不在数据库中
      };
    }
  } catch (error) {
    logger.error('加载设置失败:', error);
  }
  return {};
}

/**
 * 保存用户设置
 */
async function saveSettings(
  ctx: Context,
  session: Session,
  settings: UserSettingsExt
): Promise<void> {
  try {
    const { userId, platform } = session;
    const existing = await ctx.database.get('koidice_user_settings', {
      userId,
      platform
    });

    const now = new Date();

    if (existing.length > 0) {
      // 更新现有记录
      await ctx.database.set(
        'koidice_user_settings',
        { userId, platform },
        {
          defaultDice: settings.defaultDice ?? 100,
          showDetail: true,
          updatedAt: now
        }
      );
    } else {
      // 创建新记录
      await ctx.database.create('koidice_user_settings', {
        userId,
        platform,
        defaultDice: settings.defaultDice ?? 100,
        showDetail: true,
        createdAt: now,
        updatedAt: now
      });
    }
  } catch (error) {
    logger.error('保存设置失败:', error);
  }
}

/**
 * 设置命令 .set / .setcoc / .nn
 */
export function registerSettingsCommands(
  parent: Command,
  ctx: Context,
  _config: Config,
  _diceAdapter: DiceAdapter
) {
  // 设置默认骰
  parent.subcommand('.set [dice:number]', '设置默认骰面数').action(async ({ session }, dice) => {
    if (!session) {
      return '无法获取会话信息';
    }

    try {
      const settings = await loadSettings(ctx, session);

      if (dice === undefined) {
        // 重置为默认值
        delete settings.defaultDice;
        await saveSettings(ctx, session, settings);
        return '已重置默认骰为 D100';
      }

      if (dice < 2 || dice > 1000) {
        return '骰子面数必须在 2-1000 之间';
      }

      settings.defaultDice = dice;
      await saveSettings(ctx, session, settings);
      return `已设置默认骰为 D${dice}`;
    } catch (error) {
      logger.error('设置默认骰错误:', error);
      return '设置失败';
    }
  });

  // 设置COC房规
  parent
    .subcommand('.setcoc [rule:number]', '设置COC检定房规')
    .action(async ({ session }, rule) => {
      if (!session) {
        return '无法获取会话信息';
      }

      try {
        const settings = await loadSettings(ctx, session);

        if (rule === undefined) {
          // 显示当前房规
          const currentRule = settings.cocRule ?? 0;
          const ruleDesc = [
            '0: 规则书 - 出1大成功，不满50出96-100大失败，满50出100大失败',
            '1: 出1大成功，出100大失败',
            '2: 出1-5且<=成功率大成功，出100或出96-99且>成功率大失败',
            '3: 出1-5大成功，出96-100大失败',
            '4: 不满50出1-5且<=成功率大成功，满50出1-2且<=成功率大成功；不满50出96-100大失败，满50出99-100大失败',
            '5: 出1-5且<=(成功率/10)大成功，出96-100且>(成功率/10)大失败'
          ];
          return `当前COC房规: ${currentRule}\n${ruleDesc[currentRule] || '未知房规'}\n\n使用 .setcoc <0-5> 设置房规`;
        }

        if (rule < 0 || rule > 5) {
          return 'COC房规必须在 0-5 之间\n0=规则书 1=出1大成功出100大失败 2=困难极难大成功 3=1-5大成功96-100大失败 4=困难极难大成功(满50) 5=困难极难大失败';
        }

        settings.cocRule = rule;
        await saveSettings(ctx, session, settings);
        return `已设置COC房规为 ${rule}`;
      } catch (error) {
        logger.error('设置COC房规错误:', error);
        return '设置失败';
      }
    });

  // 设置昵称
  parent.subcommand('.nn [nickname:text]', '设置昵称').action(async ({ session }, nickname) => {
    if (!session) {
      return '无法获取会话信息';
    }

    try {
      const settings = await loadSettings(ctx, session);

      if (!nickname) {
        // 显示当前昵称
        if (settings.nickname) {
          return `当前昵称: ${settings.nickname}`;
        } else {
          return `当前昵称: ${session.username || '未设置'}`;
        }
      }

      if (nickname === 'del' || nickname === 'clr') {
        // 删除昵称
        delete settings.nickname;
        await saveSettings(ctx, session, settings);
        return '已删除昵称设置';
      }

      // 移除前导符号
      nickname = nickname.replace(/^[.!！。]/, '');

      if (nickname.length > 20) {
        return '昵称长度不能超过20个字符';
      }

      settings.nickname = nickname;
      await saveSettings(ctx, session, settings);
      return `已设置昵称为: ${nickname}`;
    } catch (error) {
      logger.error('设置昵称错误:', error);
      return '设置失败';
    }
  });
}

/**
 * 获取用户默认骰
 */
export async function getUserDefaultDice(
  ctx: Context,
  userId: string,
  platform: string
): Promise<number> {
  try {
    const records = await ctx.database.get('koidice_user_settings', {
      userId,
      platform
    });
    return records[0]?.defaultDice ?? 100;
  } catch (error) {
    logger.error('获取用户默认骰失败:', error);
  }
  return 100;
}

/**
 * 获取用户COC房规
 */
export async function getUserCOCRule(
  _ctx: Context,
  _userId: string,
  _platform: string
): Promise<number> {
  // COC房规暂时不在数据库中，返回默认值
  return 0;
}

/**
 * 获取用户昵称
 */
export async function getUserNickname(
  _ctx: Context,
  _userId: string,
  _platform: string,
  defaultName: string
): Promise<string> {
  // 昵称暂时不在数据库中，返回默认值
  return defaultName;
}
