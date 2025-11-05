import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import { DiceAdapter } from '../wasm'
import type { COCCheckResult, RollResult } from '../wasm'
import { logger } from '../index'
import { CharacterService } from '../services/character-service'

/**
 * COC检定命令 .rc
 */
export function registerCOCCheckCommand(
  parent: Command,
  _ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  parent
    .subcommand('.rc <skill:number>', 'COC技能检定')
    .alias('.check')
    .option('bonus', '-b <bonus:number> 奖励骰数')
    .option('penalty', '-p <penalty:number> 惩罚骰数')
    .option('reason', '-r <reason:text> 检定原因')
    .action(async ({ session, options }, skill) => {
      if (!skill || skill < 0 || skill > 100) {
        return '技能值必须在0-100之间'
      }

      try {
        let bonusDice = 0
        if (options.bonus) bonusDice = options.bonus
        if (options.penalty) bonusDice = -options.penalty

        const result: COCCheckResult = diceAdapter.cocCheck(skill, bonusDice)

        if (result.errorCode !== 0) {
          return `检定失败: ${result.errorMsg}`
        }

        const parts = [session.username]
        if (options.reason) {
          parts.push(options.reason)
        }
        parts.push(`${result.rollValue}/${result.skillValue}`)
        parts.push(DiceAdapter.formatSuccessLevel(result.successLevel))

        return parts.join(' ')
      } catch (error) {
        logger.error('COC检定错误:', error)
        return '检定时发生错误'
      }
    })
}

/**
 * 成长检定命令 .en
 */
export function registerGrowthCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.en <skill:text>', '成长检定')
    .action(async ({ session }, skill) => {
      if (!skill) {
        return '请指定技能名称'
      }

      try {
        // 获取当前技能值
        const attributes = await characterService.getAttributes(session, null)
        if (!attributes || !(String(skill) in attributes)) {
          return `未找到技能 ${skill}，请先使用 .st.set ${skill} <值> 设置`
        }

        const currentValue = attributes[String(skill)]

        // 成长检定: 1d100 > 当前技能值
        const result: RollResult = diceAdapter.roll('1d100', 100)

        if (result.errorCode !== 0) {
          return `检定失败: ${result.errorMsg}`
        }

        const rollValue = result.total

        if (rollValue > currentValue) {
          // 成功，进行成长
          const growthResult: RollResult = diceAdapter.roll('1d10', 10)
          const growth = growthResult.total
          const newValue = Math.min(currentValue + growth, 99)

          await characterService.setAttributes(session, null, {
            [String(skill)]: newValue
          })

          return (
            `${session.username} ${skill} 成长检定\n` +
            `${rollValue}/${currentValue} 成功\n` +
            `${skill} 增长 ${growth} 点: ${currentValue} → ${newValue}`
          )
        } else {
          return (
            `${session.username} ${skill} 成长检定\n` +
            `${rollValue}/${currentValue} 失败\n` +
            `${skill} 未能成长`
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
 */
export function registerSanityCheckCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)
  parent
    .subcommand('.sc <success:text> <failure:text>', '理智检定')
    .option('san', '-s <san:number> 当前理智值')
    .action(async ({ session, options }, loss) => {
      if (!loss) {
        return '请指定损失表达式 格式: .sc 成功损失/失败损失 [-s 当前SAN值]'
      }

      try {
        // 解析损失表达式 "1/1d6" 或 "0/1d10"
        const parts = loss.split('/')
        if (parts.length !== 2) {
          return '损失表达式格式错误 格式: 成功损失/失败损失 (如: 0/1d6)'
        }

        const successLoss = parts[0].trim()
        const failureLoss = parts[1].trim()

        // 获取当前SAN值
        let currentSan = options.san
        if (currentSan === undefined) {
          // 尝试从角色卡获取
          const attributes = await characterService.getAttributes(session, null)
          if (!attributes || !('理智' in attributes)) {
            return '未设定SAN值，请使用 -s 参数指定或先 .st.set 理智 <值> '
          }
          currentSan = attributes.理智
        }

        if (currentSan < 0 || currentSan > 99) {
          return 'SAN值必须在0-99之间'
        }

        // 执行理智检定
        const result = diceAdapter.sanityCheck(
          currentSan,
          successLoss,
          failureLoss
        )

        if (result.errorMsg) {
          return `理智检定失败: ${result.errorMsg}`
        }

        // 更新角色卡SAN值
        await characterService.setAttributes(session, null, {
          理智: result.newSan
        })

        const successText = result.success ? '成功' : '失败'
        return (
          `${session.username} 的理智检定:\n` +
          `${result.rollValue}/${currentSan} ${successText}\n` +
          `理智减少 ${result.sanLoss} 点\n` +
          `当前理智: ${result.newSan}`
        )
      } catch (error) {
        logger.error('理智检定错误:', error)
        return '理智检定时发生错误'
      }
    })
}
