import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import type { RollResult } from '../wasm'
import { logger } from '../index'
import { CharacterService } from '../services/character-service'

/**
 * 掷骰命令 .r / .rh / .rs
 * 参考 DiceEvent.cpp 4391-4500行的实现
 * 支持功能:
 * - 基础掷骰: .r 1d100
 * - 多轮掷骰: .r 3#1d6 (掷3次)
 * - 暗骰: .rh 1d100
 * - 简化输出: .rs 1d10+1d6+3 (只显示结果)
 * - 从人物卡读取: .r 沙漠之鹰 (需要先保存表达式)
 */
export function registerRollCommand(
  parent: Command,
  ctx: Context,
  config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)
  // 注册 .r 命令（普通掷骰）
  parent
    .subcommand('.r [...args:text]', '掷骰')
    .usage('用法: .r [掷骰表达式] [原因]')
    .example('.r 1d100 - 掷一个百面骰')
    .example('.r 3#1d6 伤害 - 掷3次d6')
    .example('.r 1d10+1d6+3 沙鹰伤害 - 复杂表达式')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(
        session,
        characterService,
        diceAdapter,
        config,
        false,
        false,
        args
      )
    })

  // 注册 .rh 命令（暗骰）
  parent
    .subcommand('.rh [...args:text]', '暗骰')
    .usage('用法: .rh [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(
        session,
        characterService,
        diceAdapter,
        config,
        true,
        false,
        args
      )
    })

  // 注册 .rs 命令（简化输出）
  parent
    .subcommand('.rs [...args:text]', '掷骰（简化输出）')
    .usage('用法: .rs [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(
        session,
        characterService,
        diceAdapter,
        config,
        false,
        true,
        args
      )
    })

  // 注册 .rsh 命令（暗骰+简化输出）
  parent
    .subcommand('.rsh [...args:text]', '暗骰（简化输出）')
    .usage('用法: .rsh [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(
        session,
        characterService,
        diceAdapter,
        config,
        true,
        true,
        args
      )
    })
}

/**
 * 处理掷骰命令
 * 参考 DiceEvent.cpp 4391-4500行
 */
async function handleRollCommand(
  session: any,
  characterService: CharacterService,
  diceAdapter: DiceAdapter,
  config: Config,
  isHidden: boolean,
  isSimple: boolean,
  args: string[]
): Promise<string> {
  try {
    const fullText = args.join(' ')
    let expression = ''
    let reason = ''

    // 解析表达式和原因
    // 参考 DiceEvent.cpp 4407-4425行
    if (fullText) {
      // 尝试从人物卡读取表达式
      const attributes = await characterService.getAttributes(session, null)

      // 如果整个文本是人物卡中的表达式名
      if (attributes && fullText in attributes) {
        const value = attributes[fullText]
        if (typeof value === 'string') {
          expression = value
        }
      } else {
        // 否则解析表达式
        // 提取掷骰表达式（包含数字、d、+、-、*、/、#等）
        const match = fullText.match(/^([\d#dpbkDPBK+\-*/()\s]+)(.*)$/)
        if (match) {
          expression = match[1].trim()
          reason = match[2].trim()

          // 如果表达式只是纯数字，清空它
          if (/^\d+$/.test(expression)) {
            reason = fullText
            expression = ''
          }
        } else {
          reason = fullText
        }
      }
    }

    // 如果没有表达式，使用默认骰子
    if (!expression) {
      expression = `1d${config.defaultDice}`
    }

    // 解析多轮掷骰 - 参考 DiceEvent.cpp 4430-4457行
    let rounds = 1
    let turnExpression = ''
    if (expression.includes('#')) {
      const parts = expression.split('#')
      turnExpression = parts[0] || '1'
      expression = parts[1]

      // 计算轮数
      const turnResult = diceAdapter.roll(turnExpression, config.defaultDice)
      if (turnResult.errorCode !== 0) {
        return `掷骰失败: ${turnResult.errorMsg}`
      }

      rounds = turnResult.total
      if (rounds > 10) {
        return '掷骰次数不能超过10次'
      }
      if (rounds <= 0) {
        return '掷骰次数必须大于0'
      }
    }

    // 暗骰处理
    if (isHidden) {
      diceAdapter.hiddenRoll(expression, config.defaultDice)
      const parts = [session.username, '进行了暗骰']
      if (reason) parts.push(reason)
      return parts.join(' ')
    }

    // 执行掷骰 - 参考 DiceEvent.cpp 4461-4500行
    const results: string[] = []

    for (let i = 0; i < rounds; i++) {
      const result: RollResult = diceAdapter.roll(
        expression,
        config.defaultDice
      )

      if (result.errorCode !== 0) {
        return `掷骰失败: ${result.errorMsg}`
      }

      if (isSimple) {
        // 简化输出：只显示结果
        results.push(result.total.toString())
      } else {
        // 详细输出
        results.push(result.detail)
      }
    }

    // 构建输出消息
    const parts = [session.username]
    if (reason) {
      parts.push(reason)
    }

    if (rounds === 1) {
      parts.push(results[0])
    } else {
      // 多轮掷骰
      if (isSimple) {
        parts.push(`{ ${results.join(', ')} }`)
      } else {
        parts.push(results.map((r, i) => `#${i + 1} ${r}`).join(' '))
      }
    }

    return parts.join(' ')
  } catch (error) {
    logger.error('掷骰错误:', error)
    return '掷骰时发生错误'
  }
}
