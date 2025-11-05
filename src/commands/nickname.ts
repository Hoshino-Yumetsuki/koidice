import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'

/**
 * 昵称管理命令
 * 参考 DiceEvent.cpp 2935-2945行 (.nnn) 和 3252-3284行 (.nn)
 */

/**
 * 获取用户昵称
 * 优先级：群内称呼 > 全局称呼 > 群名片 > 用户名
 */
async function getUserNickname(session: any, ctx: Context): Promise<string> {
  const userId = session.userId || session.uid
  const guildId = session.guildId || session.gid

  try {
    // 优先获取群内昵称
    if (guildId && ctx.database) {
      const guildNick = await ctx.database.get('koidice_nickname', {
        userId,
        guildId
      })
      if (guildNick && guildNick.length > 0) {
        return guildNick[0].nickname
      }
    }

    // 获取全局昵称
    if (ctx.database) {
      const globalNick = await ctx.database.get('koidice_nickname', {
        userId,
        guildId: null
      })
      if (globalNick && globalNick.length > 0) {
        return globalNick[0].nickname
      }
    }
  } catch (error) {
    // 数据库查询失败，使用默认昵称
    logger.debug('获取昵称失败:', error)
  }

  // 使用平台提供的昵称
  return session.username || session.author?.nickname || '未知用户'
}

/**
 * 设置用户昵称
 */
async function setUserNickname(
  session: any,
  ctx: Context,
  nickname: string
): Promise<void> {
  const userId = session.userId || session.uid
  const guildId = session.guildId || session.gid

  // 私聊时设置全局昵称，群聊时设置群内昵称
  const targetGuildId = guildId || null

  await ctx.database?.upsert('koidice_nickname', [
    {
      userId,
      guildId: targetGuildId,
      nickname
    }
  ])
}

/**
 * 删除用户昵称
 */
async function deleteUserNickname(
  session: any,
  ctx: Context,
  clearAll: boolean = false
): Promise<boolean> {
  const userId = session.userId || session.uid
  const guildId = session.guildId || session.gid

  if (clearAll) {
    // 删除所有昵称
    const result = await ctx.database?.remove('koidice_nickname', { userId })
    return result && result.removed > 0
  } else {
    // 只删除当前群的昵称
    const result = await ctx.database?.remove('koidice_nickname', {
      userId,
      guildId: guildId || null
    })
    return result && result.removed > 0
  }
}

/**
 * 注册昵称相关命令
 */
export function registerNicknameCommands(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  // .nn 称呼管理主命令
  const nn = parent
    .subcommand('.nn <nickname:text>', '设置称呼')
    .usage('用法: .nn <昵称>')
    .example('.nn kp - 设置昵称为kp')
    .action(async ({ session }, nickname) => {
      try {
        const oldNick = await getUserNickname(session, ctx)

        if (!nickname) {
          return '请指定昵称'
        }

        // 过滤掉前导符号
        nickname = nickname.replace(/^[.!！。/\\]+/, '').trim()

        if (nickname.length > 50) {
          return '昵称长度不能超过50个字符'
        }

        // 设置昵称
        await setUserNickname(session, ctx, nickname)
        return `称呼已设置：${oldNick} → ${nickname}`
      } catch (error) {
        logger.error('设置昵称错误:', error)
        return '设置昵称时发生错误'
      }
    })

  // .nn.del - 删除当前窗口称呼
  nn.subcommand('.del', '删除称呼')
    .usage('删除当前窗口的称呼')
    .example('.nn.del - 删除当前群的称呼')
    .action(async ({ session }) => {
      try {
        const oldNick = await getUserNickname(session, ctx)
        const deleted = await deleteUserNickname(session, ctx, false)

        if (deleted) {
          return `已删除称呼：${oldNick}`
        } else {
          return '当前窗口没有设置称呼'
        }
      } catch (error) {
        logger.error('删除昵称错误:', error)
        return '删除昵称时发生错误'
      }
    })

  // .nnn 随机昵称主命令
  const nnn = parent
    .subcommand('.nnn', '随机昵称')
    .usage('从牌堆随机生成昵称并设置')
    .action(async ({ session }) => {
      return await generateRandomNickname(session, ctx, diceAdapter, '')
    })

  // .nnn.cn - 中文昵称
  nnn
    .subcommand('.cn', '中文昵称')
    .usage('生成中文昵称')
    .action(async ({ session }) => {
      return await generateRandomNickname(session, ctx, diceAdapter, 'cn')
    })

  // .nnn.jp - 日文昵称
  nnn
    .subcommand('.jp', '日文昵称')
    .usage('生成日文昵称')
    .action(async ({ session }) => {
      return await generateRandomNickname(session, ctx, diceAdapter, 'jp')
    })

  // .nnn.en - 英文昵称
  nnn
    .subcommand('.en', '英文昵称')
    .usage('生成英文昵称')
    .action(async ({ session }) => {
      return await generateRandomNickname(session, ctx, diceAdapter, 'en')
    })

  // .name 随机姓名主命令（不设置，只显示）
  const name = parent
    .subcommand('.name [count:number]', '随机姓名')
    .usage('生成随机姓名（不设置为昵称）')
    .example('.name - 生成1个随机姓名')
    .example('.name 10 - 生成10个随机姓名')
    .action(async ({ session }, count = 1) => {
      return await generateRandomNames(session, diceAdapter, '', count)
    })

  // .name.cn [数量] - 中文姓名
  name
    .subcommand('.cn [count:number]', '中文姓名')
    .usage('生成中文姓名')
    .action(async ({ session }, count = 1) => {
      return await generateRandomNames(session, diceAdapter, 'cn', count)
    })

  // .name.jp [数量] - 日文姓名
  name
    .subcommand('.jp [count:number]', '日文姓名')
    .usage('生成日文姓名')
    .action(async ({ session }, count = 1) => {
      return await generateRandomNames(session, diceAdapter, 'jp', count)
    })

  // .name.en [数量] - 英文姓名
  name
    .subcommand('.en [count:number]', '英文姓名')
    .usage('生成英文姓名')
    .action(async ({ session }, count = 1) => {
      return await generateRandomNames(session, diceAdapter, 'en', count)
    })
}

/**
 * 生成随机昵称并设置
 */
async function generateRandomNickname(
  session: any,
  ctx: Context,
  diceAdapter: DiceAdapter,
  type: string
): Promise<string> {
  try {
    const oldNick = await getUserNickname(session, ctx)

    // 根据类型选择牌堆
    let deckName = '随机姓名'
    if (type) {
      const typeMap: Record<string, string> = {
        cn: '随机姓名_cn',
        jp: '随机姓名_jp',
        en: '随机姓名_en'
      }
      deckName = typeMap[type.toLowerCase()] || '随机姓名'
    }

    // 检查牌堆是否存在
    if (!diceAdapter.deckExists(deckName)) {
      return `牌堆 ${deckName} 不存在`
    }

    // 从牌堆抽取随机昵称
    const result = diceAdapter.drawFromDeck(deckName, 1)
    if (!result.success || result.cards.length === 0) {
      return '随机昵称生成失败'
    }

    const newNick = result.cards[0].trim()

    // 设置昵称
    await setUserNickname(session, ctx, newNick)

    return `称呼已设置：${oldNick} → ${newNick}`
  } catch (error) {
    logger.error('随机昵称错误:', error)
    return '随机昵称生成时发生错误'
  }
}

/**
 * 生成随机姓名（不设置）
 */
async function generateRandomNames(
  session: any,
  diceAdapter: DiceAdapter,
  type: string,
  count: number
): Promise<string> {
  try {
    // 限制数量
    count = Math.min(Math.max(count, 1), 10)

    // 根据类型选择牌堆
    let deckName = '随机姓名'
    if (type) {
      const typeMap: Record<string, string> = {
        cn: '随机姓名_cn',
        jp: '随机姓名_jp',
        en: '随机姓名_en'
      }
      deckName = typeMap[type.toLowerCase()] || '随机姓名'
    }

    // 检查牌堆是否存在
    if (!diceAdapter.deckExists(deckName)) {
      return `牌堆 ${deckName} 不存在`
    }

    // 从牌堆抽取随机姓名
    const result = diceAdapter.drawFromDeck(deckName, count)
    if (!result.success || result.cards.length === 0) {
      return '随机姓名生成失败'
    }

    const names = result.cards.map((name) => name.trim())

    if (count === 1) {
      return `${session.username} 随机姓名：${names[0]}`
    } else {
      return `${session.username} 随机姓名：\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
    }
  } catch (error) {
    logger.error('随机姓名错误:', error)
    return '随机姓名生成时发生错误'
  }
}
