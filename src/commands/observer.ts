import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'

/**
 * 获取频道的旁观者列表
 */
async function getObservers(
  ctx: Context,
  channelId: string,
  platform: string
): Promise<string[]> {
  try {
    const records = await ctx.database.get('koidice_observer', {
      channelId,
      platform
    })
    return records.map((r) => r.userId)
  } catch (error) {
    logger.error('获取旁观者列表失败:', error)
    return []
  }
}

/**
 * 检查旁观模式是否开启
 */
async function isObserverModeEnabled(
  ctx: Context,
  channelId: string,
  platform: string
): Promise<boolean> {
  try {
    const records = await ctx.database.get('koidice_observer', {
      channelId,
      platform,
      userId: '__mode__' // 特殊标记，用于存储模式状态
    })
    return records.length > 0 && records[0].isEnabled
  } catch (error) {
    logger.error('检查旁观模式失败:', error)
    return false
  }
}

/**
 * 设置旁观模式
 */
async function setObserverMode(
  ctx: Context,
  channelId: string,
  platform: string,
  enabled: boolean
): Promise<void> {
  try {
    const existing = await ctx.database.get('koidice_observer', {
      channelId,
      platform,
      userId: '__mode__'
    })

    if (existing.length > 0) {
      await ctx.database.set(
        'koidice_observer',
        { channelId, platform, userId: '__mode__' },
        { isEnabled: enabled }
      )
    } else {
      await ctx.database.create('koidice_observer', {
        channelId,
        platform,
        userId: '__mode__',
        isEnabled: enabled,
        createdAt: new Date()
      })
    }
  } catch (error) {
    logger.error('设置旁观模式失败:', error)
  }
}

/**
 * 添加旁观者
 */
async function addObserver(
  ctx: Context,
  channelId: string,
  platform: string,
  userId: string
): Promise<boolean> {
  try {
    const existing = await ctx.database.get('koidice_observer', {
      channelId,
      platform,
      userId
    })

    if (existing.length === 0) {
      await ctx.database.create('koidice_observer', {
        channelId,
        platform,
        userId,
        isEnabled: false,
        createdAt: new Date()
      })
    }
    return true
  } catch (error) {
    logger.error('添加旁观者失败:', error)
    return false
  }
}

/**
 * 移除旁观者
 */
async function removeObserver(
  ctx: Context,
  channelId: string,
  platform: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await ctx.database.remove('koidice_observer', {
      channelId,
      platform,
      userId
    })
    return result.matched > 0
  } catch (error) {
    logger.error('移除旁观者失败:', error)
    return false
  }
}

/**
 * 清空频道的所有旁观者
 */
async function clearObservers(
  ctx: Context,
  channelId: string,
  platform: string
): Promise<void> {
  try {
    await ctx.database.remove('koidice_observer', {
      channelId,
      platform
    })
  } catch (error) {
    logger.error('清空旁观者失败:', error)
  }
}

/**
 * 旁观模式命令 .ob
 */
export function registerObserverCommands(
  parent: Command,
  ctx: Context,
  _config: Config,
  _diceAdapter: DiceAdapter
) {
  parent
    .subcommand('.ob [action:text]', '旁观模式')
    .action(async ({ session }, action) => {
      const channelId = session.channelId
      const userId = session.userId

      if (!channelId) {
        return '旁观模式仅在群聊中可用'
      }

      try {
        if (!action) {
          return (
            '用法:\n' +
            '.ob join - 加入旁观\n' +
            '.ob exit - 退出旁观\n' +
            '.ob list - 查看旁观者\n' +
            '.ob clr - 清除所有旁观者\n' +
            '.ob on/off - 开启/关闭旁观模式'
          )
        }

        const lowerAction = action.toLowerCase()

        switch (lowerAction) {
          case 'join': {
            const modeEnabled = await isObserverModeEnabled(
              ctx,
              channelId,
              session.platform
            )
            if (!modeEnabled) {
              return '本桌旁观模式未开启'
            }

            await addObserver(ctx, channelId, session.platform, userId)
            return `${session.username} 已加入旁观`
          }

          case 'exit': {
            const removed = await removeObserver(
              ctx,
              channelId,
              session.platform,
              userId
            )
            if (!removed) {
              return '你不在旁观列表中'
            }
            return `${session.username} 已退出旁观`
          }

          case 'list': {
            const channelObservers = await getObservers(
              ctx,
              channelId,
              session.platform
            )
            if (channelObservers.length === 0) {
              return '当前没有旁观者'
            }
            return `旁观者列表:\n${channelObservers
              .map((id, i) => `${i + 1}. ${id}`)
              .join('\n')}`
          }

          case 'clr':
          case 'clear': {
            await clearObservers(ctx, channelId, session.platform)
            return '已清除所有旁观者'
          }

          case 'on': {
            await setObserverMode(ctx, channelId, session.platform, true)
            return '已开启旁观模式'
          }

          case 'off': {
            await setObserverMode(ctx, channelId, session.platform, false)
            await clearObservers(ctx, channelId, session.platform)
            return '已关闭旁观模式'
          }

          default:
            return '未知操作 使用 .ob 查看帮助'
        }
      } catch (error) {
        logger.error('旁观模式错误:', error)
        return '操作失败'
      }
    })
}

/**
 * 检查用户是否为旁观者
 */
export async function isObserver(
  ctx: Context,
  channelId: string,
  platform: string,
  userId: string
): Promise<boolean> {
  try {
    const records = await ctx.database.get('koidice_observer', {
      channelId,
      platform,
      userId
    })
    return records.length > 0
  } catch (error) {
    logger.error('检查旁观者失败:', error)
    return false
  }
}

/**
 * 清理所有旁观者数据 (插件卸载时调用)
 */
export function clearAllObservers(): void {
  // 数据库持久化，不需要清理
  logger.debug('旁观者数据已持久化到数据库')
}
