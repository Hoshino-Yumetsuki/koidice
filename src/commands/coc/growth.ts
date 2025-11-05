import type { Command, Context } from 'koishi'
import type { Config } from '../../config'
import type { DiceAdapter } from '../../wasm'
import { logger } from '../../index'
import { CharacterService } from '../../services/character-service'

/**
 * 解析成长检定参数
 * 支持格式:
 * .en 技能名 - 从人物卡获取技能值
 * .en 技能名 技能值 - 指定技能值
 * .en 技能名 技能值 原因 - 带原因
 * .en 技能名 +1D3/1D10 原因 - Pulp规则特殊成长
 */
interface ParsedGrowthArgs {
  skillName: string
  skillValue?: number
  growthFormula?: string // Pulp规则的成长公式，如 +1D3/1D10
  reason?: string
}

function parseGrowthCommand(args: string[]): ParsedGrowthArgs | null {
  if (args.length === 0) {
    return null
  }

  const result: ParsedGrowthArgs = {
    skillName: args[0]
  }

  if (args.length === 1) {
    // 只有技能名
    return result
  }

  // 检查第二个参数
  const secondArg = args[1]

  // 检查是否是Pulp规则的成长公式（如 +1D3/1D10）
  if (secondArg.match(/^\+\d*[dD]\d+\/\d*[dD]\d+$/)) {
    result.growthFormula = secondArg
    if (args.length > 2) {
      result.reason = args.slice(2).join(' ')
    }
    return result
  }

  // 尝试解析为数字
  const skillValueNum = parseFloat(secondArg)
  if (!Number.isNaN(skillValueNum)) {
    result.skillValue = skillValueNum
    if (args.length > 2) {
      result.reason = args.slice(2).join(' ')
    }
    return result
  }

  // 第二个参数不是数字也不是成长公式，作为原因
  result.reason = args.slice(1).join(' ')
  return result
}

/**
 * 成长检定命令 .en
 * COC规则，用法：
 * .en [技能名称]([技能值]) - 已经.st时，可省略最后的参数,调用人物卡属性时，成长后的值会自动更新
 * .en 教育 60 教育增强 - 指定技能值和原因
 * .en 幸运 +1D3/1D10 幸运成长 - Pulp规则中的幸运成长
 */
export function registerGrowthCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.en [...args:text]', '成长检定')
    .usage('用法: .en [技能名称]([技能值]) [原因]')
    .example('.en 教育 - 从人物卡获取教育值进行成长检定')
    .example('.en 教育 60 - 对教育60进行成长检定')
    .example('.en 教育 60 教育增强 - 带原因的成长检定')
    .example('.en 幸运 +1D3/1D10 幸运成长 - Pulp规则的特殊成长')
    .action(async ({ session }, ...args) => {
      const parsed = parseGrowthCommand(args)
      if (!parsed) {
        return '请指定技能名称\n用法: .en [技能名称]([技能值]) [原因]'
      }

      try {
        // 确定最终的技能值
        let currentValue = parsed.skillValue
        let shouldUpdateCard = false

        // 如果没有指定技能值，从人物卡获取
        if (currentValue === undefined) {
          const attributes = await characterService.getAttributes(session, null)
          if (!attributes || !(parsed.skillName in attributes)) {
            return `未找到技能 ${parsed.skillName}，请指定技能值或先使用 .st.set ${parsed.skillName} <值> 设置`
          }
          currentValue = attributes[parsed.skillName]
          shouldUpdateCard = true
        }

        // 处理Pulp规则的特殊成长
        if (parsed.growthFormula) {
          // 解析公式，如 +1D3/1D10
          const match = parsed.growthFormula.match(
            /^\+(\d*[dD]\d+)\/(\d*[dD]\d+)$/
          )
          if (!match) {
            return '成长公式格式错误，应为 +XdY/XdY 格式'
          }

          const successGrowth = match[1]
          const _failureGrowth = match[2]

          // 掷成长骰
          const growthRoll = diceAdapter.roll(successGrowth, 100)
          if (growthRoll.errorCode !== 0) {
            return `成长掷骰失败: ${growthRoll.errorMsg}`
          }

          const newValue = currentValue + growthRoll.total

          // 更新人物卡
          if (shouldUpdateCard) {
            await characterService.setAttributes(session, null, {
              [parsed.skillName]: newValue
            })
          }

          const parts = [session.username]
          if (parsed.reason) {
            parts.push(parsed.reason)
          }
          parts.push(
            `${parsed.skillName} ${currentValue} + ${growthRoll.detail} = ${newValue}`
          )

          return parts.join(' ')
        }

        // 标准成长检定：掷1D100，大于当前值则成长1D10
        const checkRoll = diceAdapter.roll('1d100', 100)
        if (checkRoll.errorCode !== 0) {
          return `检定掷骰失败: ${checkRoll.errorMsg}`
        }

        let newValue = currentValue
        let growthAmount = 0
        let growthDetail = ''

        if (checkRoll.total > currentValue) {
          // 成长成功
          const growthRoll = diceAdapter.roll('1d10', 10)
          if (growthRoll.errorCode !== 0) {
            return `成长掷骰失败: ${growthRoll.errorMsg}`
          }

          growthAmount = growthRoll.total
          newValue = currentValue + growthAmount
          growthDetail = growthRoll.detail

          // 更新人物卡
          if (shouldUpdateCard) {
            await characterService.setAttributes(session, null, {
              [parsed.skillName]: newValue
            })
          }
        }

        // 构建输出消息
        const parts = [session.username]
        if (parsed.reason) {
          parts.push(parsed.reason)
        }

        if (growthAmount > 0) {
          parts.push(
            `${parsed.skillName} ${checkRoll.detail}/${currentValue} 成长成功 +${growthDetail} → ${newValue}`
          )
        } else {
          parts.push(
            `${parsed.skillName} ${checkRoll.detail}/${currentValue} 成长失败`
          )
        }

        return parts.join(' ')
      } catch (error) {
        logger.error('成长检定错误:', error)
        return '成长检定时发生错误'
      }
    })
}
