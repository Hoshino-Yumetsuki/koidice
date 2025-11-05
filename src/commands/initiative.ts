import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'

/**
 * 加载先攻列表
 */
async function loadInitiative(
  ctx: Context,
  channelId: string,
  platform: string,
  diceAdapter: DiceAdapter
): Promise<void> {
  try {
    const records = await ctx.database.get('koidice_initiative', {
      channelId,
      platform
    })

    if (records.length > 0) {
      const content = records[0].data
      diceAdapter.deserializeInitiative(channelId, content)
    }
  } catch (error) {
    logger.error('加载先攻列表失败:', error)
  }
}

/**
 * 保存先攻列表
 */
async function saveInitiative(
  ctx: Context,
  channelId: string,
  platform: string,
  diceAdapter: DiceAdapter
): Promise<void> {
  try {
    const content = diceAdapter.serializeInitiative(channelId)
    const existing = await ctx.database.get('koidice_initiative', {
      channelId,
      platform
    })

    const now = new Date()

    if (existing.length > 0) {
      // 更新现有记录
      await ctx.database.set(
        'koidice_initiative',
        { channelId, platform },
        {
          data: content,
          updatedAt: now
        }
      )
    } else {
      // 创建新记录
      await ctx.database.create('koidice_initiative', {
        channelId,
        platform,
        data: content,
        updatedAt: now
      })
    }
  } catch (error) {
    logger.error('保存先攻列表失败:', error)
  }
}

/**
 * 删除先攻列表
 */
async function deleteInitiative(
  ctx: Context,
  channelId: string,
  platform: string
): Promise<void> {
  try {
    await ctx.database.remove('koidice_initiative', {
      channelId,
      platform
    })
  } catch (error) {
    logger.error('删除先攻列表失败:', error)
  }
}

/**
 * 先攻列表命令 .init / .ri
 * 参考文档：
 * .ri - 先攻掷骰，默认1D20
 * .ri [加值] [角色名] - 带加值的先攻
 * .ri [表达式] [角色名] - 自定义表达式
 * .init - 查看先攻列表
 * .init.clr - 清空先攻列表
 */
export function registerInitiativeCommands(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  // .init 主命令 - 查看先攻列表
  const init = parent
    .subcommand('.init', '先攻列表')
    .usage('查看当前先攻列表')
    .action(async ({ session }) => {
      try {
        const channelId = session.channelId || session.userId
        const platform = session.platform

        // 加载列表
        await loadInitiative(ctx, channelId, platform, diceAdapter)

        const count = diceAdapter.getInitiativeCount(channelId)

        if (count === 0) {
          return '当前没有先攻列表'
        }

        return diceAdapter.getInitiativeList(channelId)
      } catch (error) {
        logger.error('显示先攻列表错误:', error)
        return '显示先攻列表时发生错误'
      }
    })

  // .init.clr - 清空先攻列表
  init.subcommand('.clr', '清空先攻列表').action(async ({ session }) => {
    try {
      const channelId = session.channelId || session.userId
      const platform = session.platform

      if (diceAdapter.clearInitiative(channelId)) {
        // 删除数据库记录
        await deleteInitiative(ctx, channelId, platform)
        return '已清空先攻列表'
      } else {
        return '没有要清空的先攻列表'
      }
    } catch (error) {
      logger.error('清空先攻列表错误:', error)
      return '清空先攻列表时发生错误'
    }
  })

  // .init.del - 移除先攻条目
  init
    .subcommand('.del <name:text>', '移除先攻条目')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定要移除的名称'
      }

      try {
        const channelId = session.channelId || session.userId
        const platform = session.platform

        // 加载列表
        await loadInitiative(ctx, channelId, platform, diceAdapter)

        if (diceAdapter.getInitiativeCount(channelId) === 0) {
          return '当前没有先攻列表'
        }

        if (!diceAdapter.removeInitiative(channelId, name)) {
          return `未找到 ${name}`
        }

        const count = diceAdapter.getInitiativeCount(channelId)
        if (count === 0) {
          // 删除数据库记录
          await deleteInitiative(ctx, channelId, platform)
          return `已移除 ${name}，先攻列表已清空`
        }

        // 保存
        await saveInitiative(ctx, channelId, platform, diceAdapter)

        const list = diceAdapter.getInitiativeList(channelId)
        return `已移除 ${name}\n\n${list}`
      } catch (error) {
        logger.error('移除先攻条目错误:', error)
        return '移除先攻条目时发生错误'
      }
    })

  // .init.next - 下一个回合
  init.subcommand('.next', '下一个回合').action(async ({ session }) => {
    try {
      const channelId = session.channelId || session.userId
      const platform = session.platform

      // 加载列表
      await loadInitiative(ctx, channelId, platform, diceAdapter)

      if (diceAdapter.getInitiativeCount(channelId) === 0) {
        return '当前没有先攻列表'
      }

      const result = diceAdapter.nextInitiativeTurn(channelId)

      if (!result.success) {
        return result.message || '切换回合失败'
      }

      // 保存
      await saveInitiative(ctx, channelId, platform, diceAdapter)

      const list = diceAdapter.getInitiativeList(channelId)
      return `轮到 ${result.currentName} 行动！\n\n${list}`
    } catch (error) {
      logger.error('下一回合错误:', error)
      return '切换回合时发生错误'
    }
  })

  // .ri - 先攻掷骰
  parent
    .subcommand('.ri [...args:text]', '先攻掷骰')
    .usage('用法: .ri ([加值/表达式]) ([角色名])')
    .example('.ri - 默认掷1D20')
    .example('.ri -1 某pc - 带加值的先攻')
    .example('.ri +5 boss - 带加值的先攻')
    .example('.ri 2DK - 自定义表达式')
    .example('.ri 80 怪物甲 - 直接指定先攻值')
    .action(async ({ session }, ...args) => {
      try {
        const channelId = session.channelId || session.userId
        const platform = session.platform
        let name = session.username || `用户${session.userId}`
        let expression = '1d20' // 默认表达式

        // 解析参数
        if (args.length > 0) {
          const firstArg = args[0]

          // 检查第一个参数是否是数字、加减号开头或骰子表达式
          if (/^[+-]?\d+$/.test(firstArg)) {
            // 纯数字或带符号的数字（如 +5, -1, 80）
            if (firstArg.startsWith('+') || firstArg.startsWith('-')) {
              // 加值形式
              expression = `1d20${firstArg}`
            } else {
              // 直接指定先攻值
              expression = firstArg
            }
            // 第二个参数是角色名
            if (args.length > 1) {
              name = args.slice(1).join(' ')
            }
          } else if (/^[0-9dDkK+\-*/()\s]+$/.test(firstArg)) {
            // 骰子表达式（如 2DK, 1d20+5）
            expression = firstArg
            // 第二个参数是角色名
            if (args.length > 1) {
              name = args.slice(1).join(' ')
            }
          } else {
            // 第一个参数不是数字也不是表达式，全部作为角色名
            name = args.join(' ')
          }
        }

        // 加载现有列表
        await loadInitiative(ctx, channelId, platform, diceAdapter)

        // 掷骰或解析数值
        let initValue: number
        let detail: string

        if (/^\d+$/.test(expression)) {
          // 纯数字，直接使用
          initValue = parseInt(expression, 10)
          detail = `${initValue}`
        } else {
          // 掷骰表达式
          const rollResult = diceAdapter.roll(expression, 20)
          if (rollResult.errorCode !== 0) {
            return `掷骰失败: ${rollResult.errorMsg}`
          }
          initValue = rollResult.total
          detail = rollResult.detail
        }

        // 添加到先攻列表
        if (!diceAdapter.addInitiative(channelId, name, initValue)) {
          return '添加先攻失败'
        }

        // 保存
        await saveInitiative(ctx, channelId, platform, diceAdapter)

        const list = diceAdapter.getInitiativeList(channelId)
        return `${name} 的先攻: ${detail}\n\n${list}`
      } catch (error) {
        logger.error('先攻掷骰错误:', error)
        return '先攻掷骰时发生错误'
      }
    })
}
