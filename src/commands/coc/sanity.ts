import type { Command, Context } from 'koishi'
import type { Config } from '../../config'
import type { DiceAdapter } from '../../wasm'
import { logger } from '../../index'
import { CharacterService } from '../../services/character-service'

/**
 * 理智检定命令 .sc
 * 核心逻辑在 wasm/src/features/insanity.cpp 的 sanityCheck 函数中实现
 * TypeScript 层负责参数解析、人物卡交互和消息格式化
 *
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

        // 执行理智检定
        const result = diceAdapter.sanityCheck(
          currentSan,
          successLoss,
          failureLoss
        )

        if (result.errorCode !== 0) {
          return `理智检定失败: ${result.errorMsg}`
        }

        // 更新人物卡
        if (shouldUpdateCard && result.sanLoss > 0) {
          await characterService.setAttributes(session, null, {
            理智: result.newSan
          })
        }

        // 构建输出消息
        const successLevelText = [
          '大失败',
          '失败',
          '成功',
          '困难成功',
          '极难成功',
          '大成功'
        ][result.successLevel]

        const messageParts = [session.username]
        if (reason) {
          messageParts.push(reason)
        }
        messageParts.push(
          `1D100=${result.rollValue}/${currentSan} ${successLevelText}`
        )
        messageParts.push(`理智损失: ${result.lossDetail}`)
        messageParts.push(`当前理智: ${currentSan} → ${result.newSan}`)

        return messageParts.join('\n')
      } catch (error) {
        logger.error('理智检定错误:', error)
        return '理智检定时发生错误'
      }
    })
}
