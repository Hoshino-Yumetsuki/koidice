import { type ParsedStCommand, normalizeAttributeName } from './types'
import type { DiceAdapter } from '../../wasm'

/**
 * 解析 .st 命令参数
 * 优先使用 WASM 实现（如果提供了 adapter），否则使用 TypeScript 实现
 * 只支持格式：
 * - 力量 60 敏捷 70
 * - Alice--力量 60 敏捷 70
 */
export function parseStCommand(
  input: string,
  adapter?: DiceAdapter
): ParsedStCommand {
  // 优先使用 WASM 实现
  if (adapter) {
    try {
      return adapter.parseStCommand(input) as ParsedStCommand
    } catch (error) {
      console.warn(
        'WASM parseStCommand failed, falling back to TypeScript:',
        error
      )
    }
  }

  // Fallback to TypeScript implementation
  let text = input.trim()
  let cardName: string | undefined

  // 解析人物卡名称
  const cardMatch = text.match(/^(.+?)--(.+)$/)
  if (cardMatch) {
    cardName = cardMatch[1].trim()
    text = cardMatch[2].trim()
  }

  const operations: ParsedStCommand['operations'] = []

  // 按空格分割
  const parts = text.split(/\s+/).filter((p) => p.trim())

  // 简单的"属性名 值"配对解析
  for (let i = 0; i < parts.length; i += 2) {
    if (i + 1 >= parts.length) break

    const attrName = parts[i]
    const valueStr = parts[i + 1]

    // 验证属性名：只接受纯中文或纯英文
    const isValidAttrName = /^[\u4e00-\u9fa5a-zA-Z]+$/.test(attrName)
    if (!isValidAttrName) continue

    // 解析数值
    const value = Number.parseInt(valueStr, 10)
    if (Number.isNaN(value)) continue

    operations.push({
      attr: normalizeAttributeName(attrName),
      op: 'set',
      value
    })
  }

  return { cardName, operations }
}

/**
 * 解析属性名列表（用于 show 和 del 命令）
 * 优先使用 WASM 实现（如果提供了 adapter），否则使用 TypeScript 实现
 * 支持格式：
 * - 力量 敏捷
 * - Alice--力量 敏捷
 * - all
 */
export function parseAttributeList(
  input: string,
  adapter?: DiceAdapter
): {
  cardName?: string
  attributes: string[]
} {
  // 优先使用 WASM 实现
  if (adapter) {
    try {
      return adapter.parseAttributeList(input)
    } catch (error) {
      console.warn(
        'WASM parseAttributeList failed, falling back to TypeScript:',
        error
      )
    }
  }

  // Fallback to TypeScript implementation
  let text = input.trim()
  let cardName: string | undefined

  // 解析人物卡名称
  const cardMatch = text.match(/^(.+?)--(.+)$/)
  if (cardMatch) {
    cardName = cardMatch[1].trim()
    text = cardMatch[2].trim()
  }

  // 分割属性名
  const attributes = text
    .split(/\s+/)
    .filter((p) => p.trim())
    .map((attr) => normalizeAttributeName(attr))

  return { cardName, attributes }
}
