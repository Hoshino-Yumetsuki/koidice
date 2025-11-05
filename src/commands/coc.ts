import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import type { RollResult } from '../wasm'
import { logger } from '../index'
import { CharacterService } from '../services/character-service'

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
            return `未找到技能 ${parsed.skillName}，请先使用 .st.set ${parsed.skillName} <值> 设置，或直接指定技能值`
          }
          currentValue = attributes[parsed.skillName]
          shouldUpdateCard = true
        }

        // 验证技能值范围
        if (currentValue < 0 || currentValue > 1000) {
          return '技能值必须在0-1000之间'
        }

        // 成长检定: 1d100 > 当前技能值
        const checkResult: RollResult = diceAdapter.roll('1d100', 100)

        if (checkResult.errorCode !== 0) {
          return `检定失败: ${checkResult.errorMsg}`
        }

        const rollValue = checkResult.total

        // 构建输出消息的基础部分
        const messageParts = [session.username, parsed.skillName]
        if (parsed.reason) {
          messageParts.push(parsed.reason)
        }
        messageParts.push('成长检定')

        if (rollValue > currentValue) {
          // 成功，进行成长
          let growth: number
          let growthDetail: string

          if (parsed.growthFormula) {
            // Pulp规则的特殊成长（如 +1D3/1D10）
            // 解析公式 +1D3/1D10 为两个骰子表达式
            const formulaMatch = parsed.growthFormula.match(
              /^\+(\d*[dD]\d+)\/(\d*[dD]\d+)$/
            )
            if (!formulaMatch) {
              return `成长公式格式错误: ${parsed.growthFormula}`
            }

            const dice1 = formulaMatch[1]
            const dice2 = formulaMatch[2]

            const result1: RollResult = diceAdapter.roll(dice1, 100)
            const result2: RollResult = diceAdapter.roll(dice2, 100)

            if (result1.errorCode !== 0 || result2.errorCode !== 0) {
              return '成长骰子投掷失败'
            }

            // 取两个结果中的较大值
            growth = Math.max(result1.total, result2.total)
            growthDetail = `${dice1}=${result1.total} / ${dice2}=${result2.total}`
          } else {
            // 标准成长: 1d10
            const growthResult: RollResult = diceAdapter.roll('1d10', 10)
            if (growthResult.errorCode !== 0) {
              return '成长骰子投掷失败'
            }
            growth = growthResult.total
            growthDetail = `1d10=${growth}`
          }

          const newValue = Math.min(currentValue + growth, 99)

          // 如果从人物卡获取的值，更新人物卡
          if (shouldUpdateCard) {
            await characterService.setAttributes(session, null, {
              [parsed.skillName]: newValue
            })
          }

          return (
            `${messageParts.join(' ')}\n` +
            `${rollValue}/${currentValue} 成功\n` +
            `${parsed.skillName} 增长 ${growth} 点 (${growthDetail}): ${currentValue} → ${newValue}`
          )
        } else {
          return (
            `${messageParts.join(' ')}\n` +
            `${rollValue}/${currentValue} 失败\n` +
            `${parsed.skillName} 未能成长`
          )
        }
      } catch (error) {
        logger.error('成长检定错误:', error)
        return '成长检定时发生错误'
      }
    })
}

/**
 * COC人物作成命令 .coc
 * 支持格式:
 * .coc - COC7版单次生成
 * .coc N - COC7版N次生成
 * .coc6 - COC6版单次生成
 * .coc6 N - COC6版N次生成
 * .coc7 - COC7版单次生成
 * .coc7 N - COC7版N次生成
 * .cocd - COC7版详细生成（含背景）
 * .coc6d - COC6版详细生成（含背景）
 * .coc7d - COC7版详细生成（含背景）
 */
export function registerCOCGeneratorCommand(
  parent: Command,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  // 基础 .coc 命令
  parent
    .subcommand('.coc [param:text]', 'COC人物作成')
    .action(async ({ session }, param) => {
      try {
        // 解析参数
        let version = 7
        let count = 1
        let detailed = false

        if (param) {
          const paramLower = param.toLowerCase().trim()

          // 检查是否是 .coc6 或 .coc7 格式
          if (paramLower === '6' || paramLower.startsWith('6 ')) {
            version = 6
            const parts = paramLower.split(/\s+/)
            if (parts.length > 1) {
              const num = parseInt(parts[1], 10)
              if (!Number.isNaN(num) && num > 0 && num <= 10) {
                count = num
              }
            }
          } else if (paramLower === '7' || paramLower.startsWith('7 ')) {
            version = 7
            const parts = paramLower.split(/\s+/)
            if (parts.length > 1) {
              const num = parseInt(parts[1], 10)
              if (!Number.isNaN(num) && num > 0 && num <= 10) {
                count = num
              }
            }
          } else if (paramLower === 'd' || paramLower === '7d') {
            // .cocd 或 .coc7d
            version = 7
            detailed = true
          } else if (paramLower === '6d') {
            // .coc6d
            version = 6
            detailed = true
          } else {
            // 尝试解析为数字
            const num = parseInt(paramLower, 10)
            if (!Number.isNaN(num) && num > 0 && num <= 10) {
              count = num
            }
          }
        }

        // 限制生成数量
        if (count > 10) {
          return '生成数量不能超过10次喵~'
        }

        let result: string

        // 根据参数调用对应的生成函数
        if (detailed) {
          if (version === 6) {
            result = diceAdapter.generateCOC6Detailed()
          } else {
            result = diceAdapter.generateCOC7Detailed()
          }
        } else if (count > 1) {
          if (version === 6) {
            result = diceAdapter.generateCOC6Multiple(count)
          } else {
            result = diceAdapter.generateCOC7Multiple(count)
          }
        } else {
          if (version === 6) {
            result = diceAdapter.generateCOC6()
          } else {
            result = diceAdapter.generateCOC7()
          }
        }

        return `${session.username} 的COC${version}版人物:\n${result}`
      } catch (error) {
        logger.error('人物作成错误:', error)
        return '人物作成时发生错误'
      }
    })

  // .coc6 别名
  parent
    .subcommand('.coc6 [count:text]', 'COC6版人物作成')
    .action(async ({ session }, count) => {
      try {
        let num = 1
        let detailed = false

        if (count) {
          const countLower = count.toLowerCase().trim()
          if (countLower === 'd') {
            detailed = true
          } else {
            const parsed = parseInt(countLower, 10)
            if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 10) {
              num = parsed
            }
          }
        }

        if (num > 10) {
          return '生成数量不能超过10次喵~'
        }

        let result: string
        if (detailed) {
          result = diceAdapter.generateCOC6Detailed()
        } else if (num > 1) {
          result = diceAdapter.generateCOC6Multiple(num)
        } else {
          result = diceAdapter.generateCOC6()
        }

        return `${session.username} 的COC6版人物:\n${result}`
      } catch (error) {
        logger.error('人物作成错误:', error)
        return '人物作成时发生错误'
      }
    })

  // .coc7 别名
  parent
    .subcommand('.coc7 [count:text]', 'COC7版人物作成')
    .action(async ({ session }, count) => {
      try {
        let num = 1
        let detailed = false

        if (count) {
          const countLower = count.toLowerCase().trim()
          if (countLower === 'd') {
            detailed = true
          } else {
            const parsed = parseInt(countLower, 10)
            if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 10) {
              num = parsed
            }
          }
        }

        if (num > 10) {
          return '生成数量不能超过10次喵~'
        }

        let result: string
        if (detailed) {
          result = diceAdapter.generateCOC7Detailed()
        } else if (num > 1) {
          result = diceAdapter.generateCOC7Multiple(num)
        } else {
          result = diceAdapter.generateCOC7()
        }

        return `${session.username} 的COC7版人物:\n${result}`
      } catch (error) {
        logger.error('人物作成错误:', error)
        return '人物作成时发生错误'
      }
    })

  // .cocd 别名（详细版）
  parent
    .subcommand('.cocd', 'COC7版详细人物作成（含背景）')
    .action(async ({ session }) => {
      try {
        const result = diceAdapter.generateCOC7Detailed()

        // 生成背景信息
        const background = generateCOC7Background(diceAdapter)

        return `${session.username} 的COC7版人物（详细）:\n${result}\n${background}`
      } catch (error) {
        logger.error('人物作成错误:', error)
        return '人物作成时发生错误'
      }
    })

  // .coc6d 别名（详细版）
  parent
    .subcommand('.coc6d', 'COC6版详细人物作成（含背景）')
    .action(async ({ session }) => {
      try {
        const result = diceAdapter.generateCOC6Detailed()

        // 生成背景信息
        const background = generateCOC6Background(diceAdapter)

        return `${session.username} 的COC6版人物（详细）:\n${result}\n${background}`
      } catch (error) {
        logger.error('人物作成错误:', error)
        return '人物作成时发生错误'
      }
    })

  // .coc7d 别名（详细版）
  parent
    .subcommand('.coc7d', 'COC7版详细人物作成（含背景）')
    .action(async ({ session }) => {
      try {
        const result = diceAdapter.generateCOC7Detailed()

        // 生成背景信息
        const background = generateCOC7Background(diceAdapter)

        return `${session.username} 的COC7版人物（详细）:\n${result}\n${background}`
      } catch (error) {
        logger.error('人物作成错误:', error)
        return '人物作成时发生错误'
      }
    })
}

/**
 * 生成COC7版背景信息
 */
function generateCOC7Background(diceAdapter: DiceAdapter): string {
  try {
    const parts: string[] = []

    // 性别
    const gender = diceAdapter.drawFromDeck('性别', 1)
    if (gender.success && gender.cards.length > 0) {
      parts.push(`性别=${gender.cards[0]}`)
    }

    // 年龄 (7D6+8)
    const ageRoll = diceAdapter.roll('7d6+8', 6)
    if (ageRoll.errorCode === 0) {
      parts.push(`年龄=${ageRoll.total}`)
    }

    // 职业
    const occupation = diceAdapter.drawFromDeck('调查员职业', 1)
    if (occupation.success && occupation.cards.length > 0) {
      parts.push(`职业=${occupation.cards[0]}`)
    }

    // 个人描述
    const description = diceAdapter.drawFromDeck('个人描述', 1)
    if (description.success && description.cards.length > 0) {
      parts.push(`个人描述=${description.cards[0]}`)
    }

    // 重要之人
    const importantPerson = diceAdapter.drawFromDeck('重要之人', 1)
    if (importantPerson.success && importantPerson.cards.length > 0) {
      parts.push(`重要之人=${importantPerson.cards[0]}`)
    }

    // 思想信念
    const belief = diceAdapter.drawFromDeck('思想信念', 1)
    if (belief.success && belief.cards.length > 0) {
      parts.push(`思想信念=${belief.cards[0]}`)
    }

    // 意义非凡之地
    const place = diceAdapter.drawFromDeck('意义非凡之地', 1)
    if (place.success && place.cards.length > 0) {
      parts.push(`意义非凡之地=${place.cards[0]}`)
    }

    // 宝贵之物
    const treasure = diceAdapter.drawFromDeck('宝贵之物', 1)
    if (treasure.success && treasure.cards.length > 0) {
      parts.push(`宝贵之物=${treasure.cards[0]}`)
    }

    // 特质
    const trait = diceAdapter.drawFromDeck('调查员特点', 1)
    if (trait.success && trait.cards.length > 0) {
      parts.push(`特质=${trait.cards[0]}`)
    }

    return parts.length > 0 ? `\n${parts.join(' ')}` : ''
  } catch (error) {
    logger.error('生成背景信息错误:', error)
    return ''
  }
}

/**
 * 生成COC6版背景信息
 */
function generateCOC6Background(diceAdapter: DiceAdapter): string {
  try {
    const parts: string[] = []

    // 性别
    const gender = diceAdapter.drawFromDeck('性别', 1)
    if (gender.success && gender.cards.length > 0) {
      parts.push(`性别=${gender.cards[0]}`)
    }

    // 年龄 (7D6+8)
    const ageRoll = diceAdapter.roll('7d6+8', 6)
    if (ageRoll.errorCode === 0) {
      parts.push(`年龄=${ageRoll.total}`)
    }

    // 职业
    const occupation = diceAdapter.drawFromDeck('调查员职业', 1)
    if (occupation.success && occupation.cards.length > 0) {
      parts.push(`职业=${occupation.cards[0]}`)
    }

    return parts.length > 0 ? `\n${parts.join(' ')}` : ''
  } catch (error) {
    logger.error('生成背景信息错误:', error)
    return ''
  }
}

/**
 * 理智检定命令 .sc
 * 参考 DiceEvent.cpp 3843-3948行
 * 用法：.sc [成功损失]/[失败损失] ([当前san值]) ([原因])
 * 示例：
 * .sc 0/1d6 - 从人物卡获取SAN值
 * .sc 0/1d6 70 - 指定当前SAN值为70
 * .sc 1d10/1d100 直面外神 - 带原因
 */
export function registerSanityCheckCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.sc [...args:text]', '理智检定')
    .usage('用法: .sc [成功损失]/[失败损失] ([当前san值]) ([原因])')
    .example('.sc 0/1d6 - 从人物卡获取SAN值')
    .example('.sc 0/1d6 70 - 指定当前SAN值为70')
    .example('.sc 1d10/1d100 直面外神 - 带原因')
    .action(async ({ session }, ...args) => {
      if (args.length === 0) {
        return '请指定损失表达式\n用法: .sc [成功损失]/[失败损失] ([当前san值]) ([原因])'
      }

      try {
        // 第一个参数是损失表达式
        const sanCost = args[0]

        // 验证损失表达式格式
        if (!sanCost.includes('/')) {
          return '损失表达式格式错误\n格式: 成功损失/失败损失 (如: 0/1d6)'
        }

        const lossParts = sanCost.split('/')
        if (lossParts.length !== 2) {
          return '损失表达式格式错误\n格式: 成功损失/失败损失 (如: 0/1d6)'
        }

        const successLoss = lossParts[0].trim()
        const failureLoss = lossParts[1].trim()

        // 验证损失表达式字符（参考 DiceEvent.cpp 3871-3883行）
        const validChars = /^[0-9dD+-]+$/
        if (!validChars.test(successLoss) || !validChars.test(failureLoss)) {
          return '损失表达式包含无效字符\n只能包含数字、d、+、-'
        }

        // 解析当前SAN值和原因
        let currentSan: number | undefined
        let reason = ''

        if (args.length > 1) {
          // 尝试解析第二个参数为数字
          const sanValue = parseInt(args[1], 10)
          if (!Number.isNaN(sanValue)) {
            currentSan = sanValue
            // 剩余参数作为原因
            if (args.length > 2) {
              reason = args.slice(2).join(' ')
            }
          } else {
            // 第二个参数不是数字，所有剩余参数作为原因
            reason = args.slice(1).join(' ')
          }
        }

        // 如果没有指定SAN值，从人物卡获取（参考 DiceEvent.cpp 3859-3867行）
        let shouldUpdateCard = false
        if (currentSan === undefined) {
          const attributes = await characterService.getAttributes(session, null)
          if (!attributes || !('理智' in attributes)) {
            return '未设定SAN值，请指定SAN值或先使用 .st.set 理智 <值> 设置'
          }
          currentSan = attributes.理智
          shouldUpdateCard = true
        }

        // 验证SAN值（参考 DiceEvent.cpp 3886-3888行）
        if (currentSan <= 0) {
          return 'SAN值无效，必须大于0'
        }

        // 执行理智检定（参考 DiceEvent.cpp 3891-3929行）
        // 1. 掷骰1D100
        const rollResult = diceAdapter.roll('1d100', 100)
        if (rollResult.errorCode !== 0) {
          return `掷骰失败: ${rollResult.errorMsg}`
        }
        const rollValue = rollResult.total

        // 2. 判定成功等级（使用skillCheck来获取成功等级）
        const checkExpression = `${rollValue}/${currentSan}`
        const checkResult = diceAdapter.skillCheck(checkExpression, 1)
        if (checkResult.errorCode !== 0) {
          return `检定失败: ${checkResult.errorMsg}`
        }

        // 3. 根据成功等级计算损失
        let sanLoss = 0
        let lossDetail = ''
        const successLevel = checkResult.results[0].successLevel

        if (successLevel === 0) {
          // 大失败 - 取失败损失的最大值（参考 DiceEvent.cpp 3913-3920行）
          const maxResult = diceAdapter.getMaxValue(failureLoss, 100)
          if (maxResult === -1) {
            return '损失表达式无效'
          }
          sanLoss = maxResult
          lossDetail = `Max{${failureLoss}}=${sanLoss}`
        } else if (successLevel === 1) {
          // 失败 - 掷失败损失骰（参考 DiceEvent.cpp 3905-3912行）
          const lossResult = diceAdapter.roll(failureLoss, 100)
          if (lossResult.errorCode !== 0) {
            return '损失表达式无效'
          }
          sanLoss = lossResult.total
          lossDetail = lossResult.detail
        } else {
          // 成功 - 掷成功损失骰（参考 DiceEvent.cpp 3922-3928行）
          const lossResult = diceAdapter.roll(successLoss, 100)
          if (lossResult.errorCode !== 0) {
            return '损失表达式无效'
          }
          sanLoss = lossResult.total
          lossDetail = lossResult.detail
        }

        // 4. 计算新的SAN值（参考 DiceEvent.cpp 3936行）
        const newSan = Math.max(0, currentSan - sanLoss)

        // 5. 更新人物卡（参考 DiceEvent.cpp 3940-3945行）
        if (shouldUpdateCard && sanLoss > 0) {
          await characterService.setAttributes(session, null, {
            理智: newSan
          })
        }

        // 6. 构建输出消息
        const successLevelText = [
          '大失败',
          '失败',
          '成功',
          '困难成功',
          '极难成功',
          '大成功'
        ][successLevel]
        const messageParts = [session.username]
        if (reason) {
          messageParts.push(reason)
        }
        messageParts.push(
          `1D100=${rollValue}/${currentSan} ${successLevelText}`
        )
        messageParts.push(`理智损失: ${lossDetail}`)
        messageParts.push(`当前理智: ${currentSan} → ${newSan}`)

        return messageParts.join('\n')
      } catch (error) {
        logger.error('理智检定错误:', error)
        return '理智检定时发生错误'
      }
    })
}
