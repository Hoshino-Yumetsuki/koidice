import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'
import { CharacterService } from '../services/character-service'

/**
 * WOD骰池命令 .w / .ww
 * 用法：
 * .w [骰子个数]a[加骰参数] - 只显示结果
 * .ww [骰子个数]a[加骰参数] - 显示详细
 * .ww 敏捷+剑 - 从人物卡调用属性
 *
 * 固定10面骰，每有一个骰子点数达到加骰参数，则加骰一次
 * 最后计算点数达到8的骰子数
 */
export function registerWODCommands(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  // .ww 骰池（显示详细）
  parent
    .subcommand('.ww [...args:text]', 'WOD骰池（显示详细）')
    .usage('用法: .ww <骰子数>a<加骰线> 或 .ww <表达式>')
    .example('.ww 10a8 - 投10个骰子，8点及以上加骰')
    .example('.ww 敏捷+剑 - 从人物卡调用属性')
    .action(async ({ session }, ...args) => {
      if (args.length === 0) {
        return '用法: .ww <骰子数>a<加骰线> 或 .ww <表达式>\n例如: .ww 10a8 或 .ww 敏捷+剑'
      }

      try {
        const expression = args.join('')
        const result = await parseAndRollWOD(
          expression,
          session,
          characterService,
          diceAdapter,
          true
        )
        return `${session.username} ${result}`
      } catch (error) {
        logger.error('WOD骰池错误:', error)
        return `骰池失败: ${error.message}`
      }
    })

  // .w 骰池（只显示结果）
  parent
    .subcommand('.w [...args:text]', 'WOD骰池（只显示结果）')
    .usage('用法: .w <骰子数>a<加骰线> 或 .w <表达式>')
    .example('.w 10a8 - 投10个骰子，8点及以上加骰')
    .example('.w 敏捷+剑 - 从人物卡调用属性')
    .action(async ({ session }, ...args) => {
      if (args.length === 0) {
        return '用法: .w <骰子数>a<加骰线> 或 .w <表达式>\n例如: .w 10a8 或 .w 敏捷+剑'
      }

      try {
        const expression = args.join('')
        const result = await parseAndRollWOD(
          expression,
          session,
          characterService,
          diceAdapter,
          false
        )
        return `${session.username} ${result}`
      } catch (error) {
        logger.error('WOD骰池错误:', error)
        return `骰池失败: ${error.message}`
      }
    })
}

/**
 * 解析并投掷WOD骰池
 */
async function parseAndRollWOD(
  expression: string,
  session: any,
  characterService: CharacterService,
  diceAdapter: DiceAdapter,
  showDetail: boolean
): Promise<string> {
  let diceCount = 0
  let againLine = 8 // 默认加骰线为8

  // 尝试解析标准格式: 10a8
  const standardMatch = expression.match(/^(\d+)a(\d+)$/i)
  if (standardMatch) {
    diceCount = parseInt(standardMatch[1], 10)
    againLine = parseInt(standardMatch[2], 10)
  } else {
    // 尝试从人物卡解析表达式，如 "敏捷+剑"
    const attributes = await characterService.getAttributes(session, null)
    if (!attributes) {
      throw new Error('表达式格式错误，应为: <骰子数>a<加骰线>，例如: 10a8')
    }

    // 解析表达式中的属性名
    // 支持 +, -, *, / 运算符
    let evalExpression = expression

    // 替换表达式中的属性名为对应的值
    for (const [attrName, attrValue] of Object.entries(attributes)) {
      if (typeof attrValue === 'number') {
        // 使用正则替换，确保完整匹配属性名
        const regex = new RegExp(
          attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g'
        )
        evalExpression = evalExpression.replace(regex, attrValue.toString())
      }
    }

    // 检查是否还有未替换的中文字符（说明属性不存在）
    if (/[\u4e00-\u9fa5]/.test(evalExpression)) {
      throw new Error(`表达式中包含未知属性，请先使用 .st.set 设置属性`)
    }

    // 计算表达式
    try {
      // 使用 WASM 的 roll 函数来计算表达式
      const calcResult = diceAdapter.roll(evalExpression, 10)
      if (calcResult.errorCode !== 0) {
        throw new Error(`表达式计算失败: ${calcResult.errorMsg}`)
      }
      diceCount = calcResult.total
    } catch (error) {
      throw new Error(`表达式计算失败: ${error.message}`)
    }
  }

  if (diceCount < 1 || diceCount > 100) {
    throw new Error('骰子数量必须在1-100之间')
  }

  if (againLine < 2 || againLine > 10) {
    throw new Error('加骰线必须在2-10之间')
  }

  // 投掷骰子
  const results: number[] = []
  let totalDice = diceCount
  let successCount = 0

  for (let i = 0; i < totalDice; i++) {
    const roll = diceAdapter.roll('1d10', 10)
    if (roll.errorCode !== 0) {
      throw new Error(roll.errorMsg)
    }

    const value = roll.total
    results.push(value)

    // 计算成功数（8-10为成功）
    if (value >= 8) {
      successCount++
    }

    // 加骰
    if (value >= againLine && totalDice < 100) {
      totalDice++
    }
  }

  // 格式化输出
  if (showDetail) {
    const detailStr = results
      .map((v) => {
        if (v >= againLine) return `[${v}!]` // 加骰
        if (v >= 8) return `[${v}]` // 成功
        if (v === 1) return `(${v})` // 失败
        return `${v}`
      })
      .join(' ')

    return `WOD骰池 ${diceCount}a${againLine}:\n${detailStr}\n成功数: ${successCount}`
  } else {
    return `WOD骰池 ${diceCount}a${againLine}: 成功数 ${successCount}`
  }
}
