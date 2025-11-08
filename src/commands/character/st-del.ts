import type { Command, Context } from 'koishi'
import type { DiceAdapter } from '../../wasm'
import { CharacterService } from '../../services/character-service'
import { parseAttributeList } from './parser'
import { logger } from '../../index'

export function registerStDelCommand(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.st.del [args:text]', '删除人物卡属性')
    .usage('.st.del [人物卡名--]属性名 [属性名...]')
    .example('.st.del 力量 敏捷')
    .example('.st.del Alice--力量 敏捷')
    .example('.st.del Alice--all')
    .action(async ({ session }, args) => {
      try {
        if (!args || args.trim() === '') {
          return '请指定要删除的属性名，或使用 all 删除整个人物卡'
        }

        // 特殊处理：如果只有一个参数且不包含 --，当作人物卡名称+all
        const trimmedArgs = args.trim()
        if (!trimmedArgs.includes('--') && !trimmedArgs.includes(' ')) {
          const cardName = trimmedArgs
          const card = await characterService.getCard(session, cardName)
          if (!card) {
            return `人物卡 ${cardName} 不存在`
          }
          const success = await characterService.deleteCard(session, cardName)
          return success ? `已删除人物卡 ${cardName}` : '删除失败'
        }

        const { cardName, attributes } = parseAttributeList(args, diceAdapter)
        const targetCard = cardName || null

        // 检查是否是 all（删除整个人物卡）
        if (attributes.length === 1 && attributes[0].toLowerCase() === 'all') {
          const card = await characterService.getCard(
            session,
            cardName || 'default'
          )
          if (!card) {
            return `人物卡 ${cardName || '当前'} 不存在`
          }

          const success = await characterService.deleteCard(
            session,
            card.cardName
          )
          return success ? `已删除人物卡 ${card.cardName}` : '删除失败'
        }

        // 删除指定属性
        if (attributes.length > 0) {
          const currentAttrs = await characterService.getAttributes(
            session,
            targetCard
          )

          if (!currentAttrs || Object.keys(currentAttrs).length === 0) {
            return `人物卡 ${cardName || '当前'} 还没有任何属性`
          }

          // 创建新的属性对象，排除要删除的属性
          const newAttrs = { ...currentAttrs }
          const deleted: string[] = []
          const notFound: string[] = []

          for (const attr of attributes) {
            if (attr in newAttrs) {
              delete newAttrs[attr]
              deleted.push(attr)
            } else {
              notFound.push(attr)
            }
          }

          if (deleted.length === 0) {
            return `未找到指定的属性: ${notFound.join(', ')}`
          }

          // 如果删除后没有属性了，删除整个人物卡
          if (Object.keys(newAttrs).length === 0) {
            const card = await characterService.getCard(
              session,
              cardName || 'default'
            )
            if (card) {
              await characterService.deleteCard(session, card.cardName)
              return `已删除 ${deleted.join(', ')}，人物卡 ${card.cardName} 已被删除（无剩余属性）`
            }
          }

          // 更新属性
          // 需要先获取卡片，然后直接更新数据库
          const card = targetCard
            ? await characterService.getCard(session, targetCard)
            : await characterService.getActiveCard(session)

          if (card) {
            await ctx.database.set('koidice_character', card.id, {
              attributes: JSON.stringify(newAttrs),
              updatedAt: new Date()
            })
          }

          let result = `已删除 ${deleted.join(', ')}`
          if (notFound.length > 0) {
            result += `\n未找到: ${notFound.join(', ')}`
          }
          return result
        }

        return '请指定要删除的属性名'
      } catch (error) {
        logger.error('删除属性错误:', error)
        return error.message || '删除属性时发生错误'
      }
    })
}
