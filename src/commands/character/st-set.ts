import type { Command, Context } from 'koishi'
import type { DiceAdapter } from '../../wasm'
import { CharacterService } from '../../services/character-service'
import { parseStCommand } from './parser'
import { logger } from '../../index'

export function registerStSetCommand(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.st [...args:text]', '人物卡管理')
    .usage('.st [人物卡名--]属性名 属性值 [属性名 属性值]...')
    .example('.st 力量 60 敏捷 70')
    .example('.st Alice--力量 60 体质 40')
    .action(async ({ session }, ...args) => {
      // 将数组参数合并为字符串
      const argsStr = args.join(' ')
      // 没有参数：显示所有人物卡列表
      if (!argsStr || argsStr.trim() === '') {
        try {
          const cards = await characterService.getAllCards(session)

          if (cards.length === 0) {
            return (
              '还没有任何人物卡\n' +
              '使用 .st 属性名 属性值 来创建人物卡\n' +
              '例如: .st 力量 60 敏捷 70'
            )
          }

          const activeCard = await characterService.getActiveCard(session)
          const cardList = cards
            .map((card) => {
              const active = card.id === activeCard?.id ? ' ★' : ''
              return `- ${card.cardName}${active}`
            })
            .join('\n')

          return `${session.username} 的人物卡列表:\n${cardList}\n\n★ 表示当前激活的人物卡`
        } catch (error) {
          logger.error('显示人物卡列表错误:', error)
          return error.message || '显示人物卡列表时发生错误'
        }
      }

      // 解析格式
      try {
        const { cardName, operations } = parseStCommand(argsStr, diceAdapter)

        logger.debug('解析结果:', { cardName, operations, argsStr })

        if (operations.length === 0) {
          return '未识别到有效的属性设置，请检查格式'
        }

        const targetCard = cardName || null
        const results: string[] = []

        // 处理每个操作
        for (const op of operations) {
          if (op.op === 'set') {
            // 直接设置
            await characterService.setAttributes(session, targetCard, {
              [op.attr]: op.value as number
            })
            results.push(`${op.attr}=${op.value}`)
          } else {
            // 增减操作
            const currentAttrs = await characterService.getAttributes(
              session,
              targetCard
            )
            const currentValue = currentAttrs?.[op.attr] || 0

            let delta: number
            if (typeof op.value === 'string' && /\d*d\d+/i.test(op.value)) {
              // 骰子表达式
              const rollResult = diceAdapter.roll(op.value)
              delta = rollResult.total
            } else {
              delta = Number(op.value)
            }

            const newValue =
              op.op === 'add' ? currentValue + delta : currentValue - delta

            await characterService.setAttributes(session, targetCard, {
              [op.attr]: Math.max(0, newValue)
            })

            results.push(
              `${op.attr}${op.op === 'add' ? '+' : '-'}${delta}=${Math.max(0, newValue)}`
            )
          }
        }

        const prefix = cardName ? `人物卡 ${cardName}` : session.username
        return `${prefix} ${results.join(' ')}`
      } catch (error) {
        logger.error('设置属性错误:', error)
        return error.message || '设置属性时发生错误'
      }
    })
}
