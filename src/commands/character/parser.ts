import type { ParsedStCommand } from './types'
import type { DiceAdapter } from '../../wasm'

/**
 * 解析 .st 命令参数（使用 C++ WASM 实现）
 * 只支持格式：
 * - 力量 60 敏捷 70
 * - Alice--力量 60 敏捷 70
 */
export function parseStCommand(
  input: string,
  adapter: DiceAdapter
): ParsedStCommand {
  return adapter.parseStCommand(input) as ParsedStCommand
}

/**
 * 解析属性名列表（用于 show 和 del 命令）（使用 C++ WASM 实现）
 * 支持格式：
 * - 力量 敏捷
 * - Alice--力量 敏捷
 * - all
 */
export function parseAttributeList(
  input: string,
  adapter: DiceAdapter
): {
  cardName?: string
  attributes: string[]
} {
  return adapter.parseAttributeList(input)
}
