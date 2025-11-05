import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import type { SkillCheckResult } from '../wasm'
import { logger } from '../index'
import { CharacterService } from '../services/character-service'

/**
 * 通用检定命令 .rc/.ra
 * 支持格式:
 * .rc 技能名 成功率 - 基础检定
 * .rc 困难技能名 成功率 - 困难检定（成功率/2）
 * .rc 极难技能名 成功率 - 极难检定（成功率/5）
 * .rc 自动成功技能名 - 自动成功模式
 * .rc 技能名*5 - 技能值乘法修正
 * .rc 技能名-10 - 技能值加减修正
 * .rc3#技能名 成功率 - 3轮检定
 * .rc3#p技能名 成功率 - 3轮带惩罚骰
 * .rc3#b技能名 成功率 - 3轮带奖励骰
 */
export function registerCheckCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.rc [expression:text]', '技能检定')
    .alias('.ra')
    .alias('.check')
    .action(async ({ session }, expression) => {
      if (!expression) {
        return '请指定检定表达式\n格式: .rc [轮数#][难度]技能名 [成功率]\n示例: .rc 困难理智 50'
      }

      try {
        // 尝试从表达式中提取技能名，检查是否需要从人物卡获取技能值
        let finalExpression = expression
        const spaceIndex = expression.lastIndexOf(' ')

        // 如果表达式中没有数字，尝试从人物卡获取
        if (
          spaceIndex === -1 ||
          Number.isNaN(Number(expression.substring(spaceIndex + 1)))
        ) {
          // 提取技能名（去除难度前缀和轮数前缀）
          let skillName = expression
          skillName = skillName.replace(/^\d+#[pb]?/, '') // 移除轮数前缀
          skillName = skillName.replace(/^(困难|极难|自动成功)/, '') // 移除难度前缀
          skillName = skillName.trim()

          // 从人物卡获取技能值
          const attributes = await characterService.getAttributes(session, null)
          if (attributes && skillName in attributes) {
            const skillValue = attributes[skillName]
            finalExpression = `${expression} ${skillValue}`
          } else {
            return `未找到技能 ${skillName}，请指定成功率或先使用 .st.set ${skillName} <值> 设置`
          }
        }

        // 直接调用 WASM 的 skillCheck 方法
        // 所有解析和检定逻辑都在 wasm/src/dice_roll.cpp 中实现
        const result: SkillCheckResult = diceAdapter.skillCheck(finalExpression)

        if (result.errorCode !== 0) {
          return `检定失败: ${result.errorMsg}`
        }

        // 格式化输出
        const parts = [session.username, result.skillName]

        if (result.rounds === 1) {
          const r = result.results[0]
          parts.push(`${r.rollValue}/${result.finalSkillValue}`)
          if (result.difficulty === 2) {
            parts.push('(困难)')
          } else if (result.difficulty === 5) {
            parts.push('(极难)')
          }
          parts.push(r.description)
        } else {
          const roundResults = result.results.map((r, i) => {
            let str = `#${i + 1} ${r.rollValue}/${result.finalSkillValue}`
            if (result.difficulty === 2) {
              str += '(困难)'
            } else if (result.difficulty === 5) {
              str += '(极难)'
            }
            str += ` ${r.description}`
            return str
          })
          parts.push(roundResults.join(' '))
        }

        return parts.join(' ')
      } catch (error) {
        logger.error('技能检定错误:', error)
        return '检定时发生错误'
      }
    })
}
