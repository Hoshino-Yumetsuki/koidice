/**
 * .st show 展示属性命令
 */
import type { Command, Context } from 'koishi'
import type { DiceAdapter } from '../../wasm'
import { CharacterService } from '../../services/character-service'
import { parseAttributeList } from './parser'
import { logger } from '../../index'

/**
 * 注册 .st show 命令
 */
export function registerStShowCommand(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.st.show [args:text]', '查看人物卡属性')
    .usage('.st.show [人物卡名--][属性名...]')
    .example('.st.show')
    .example('.st.show all')
    .example('.st.show 力量 敏捷')
    .example('.st.show Alice--all')
    .example('.st.show Alice--力量 敏捷')
    .action(async ({ session }, args) => {
      try {
        // 没有参数：显示当前卡所有属性
        if (!args || args.trim() === '') {
          const attrs = await characterService.getAttributes(session, null)

          if (!attrs || Object.keys(attrs).length === 0) {
            return '还没有设置任何属性'
          }

          const attrLines = Object.entries(attrs)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')

          return `${session.username} 的属性:\n${attrLines}`
        }

        // 特殊处理：如果只有一个参数且不包含 --，当作人物卡名称
        const trimmedArgs = args.trim()
        if (!trimmedArgs.includes('--') && !trimmedArgs.includes(' ')) {
          const cardName = trimmedArgs
          const attrs = await characterService.getAttributes(session, cardName)

          if (!attrs || Object.keys(attrs).length === 0) {
            return `人物卡 ${cardName} 还没有任何属性`
          }

          const attrLines = Object.entries(attrs)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')

          return `人物卡 ${cardName} 的属性:\n${attrLines}`
        }

        // 解析参数
        const { cardName, attributes } = parseAttributeList(args, diceAdapter)

        // 检查是否是 all
        if (attributes.length === 1 && attributes[0].toLowerCase() === 'all') {
          const attrs = await characterService.getAttributes(
            session,
            cardName || null
          )

          if (!attrs || Object.keys(attrs).length === 0) {
            return `人物卡 ${cardName || '当前'} 还没有任何属性`
          }

          const attrLines = Object.entries(attrs)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')

          return `人物卡 ${cardName || '当前'} 的属性:\n${attrLines}`
        }

        // 显示指定属性
        if (attributes.length > 0) {
          const allAttrs = await characterService.getAttributes(
            session,
            cardName || null
          )

          if (!allAttrs || Object.keys(allAttrs).length === 0) {
            return `人物卡 ${cardName || '当前'} 还没有任何属性`
          }

          const results: string[] = []
          for (const attr of attributes) {
            if (attr in allAttrs) {
              results.push(`${attr}: ${allAttrs[attr]}`)
            } else {
              results.push(`${attr}: 未设置`)
            }
          }

          return results.length > 0
            ? `人物卡 ${cardName || '当前'}:\n${results.join('\n')}`
            : '未找到指定的属性'
        }

        return '请指定要查看的属性，或使用 all 查看所有属性'
      } catch (error) {
        logger.error('显示属性错误:', error)
        return error.message || '显示属性时发生错误'
      }
    })
}
