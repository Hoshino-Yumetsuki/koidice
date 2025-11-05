import type { Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'
import {
  saveCharacter,
  loadCharacter,
  deleteCharacter as deleteCharacterFile,
  listCharacters,
  getCharacterAttribute,
  setCharacterAttribute,
  getAllAttributes
} from '../utils/storage'

/**
 * 角色卡命令 .pc
 */
export function registerCharacterCommands(
  parent: Command,
  config: Config,
  _diceAdapter: DiceAdapter
) {
  parent.subcommand('.pc', '角色卡管理')

  parent
    .subcommand('.pc.new <name:text>', '创建角色卡')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }

      try {
        // 检查是否已存在
        const existing = loadCharacter(name)
        if (existing) {
          return `角色卡 ${name} 已存在`
        }

        // 创建空角色卡
        const success = saveCharacter(name, {})
        return success
          ? `${session.username} 已创建角色卡: ${name}`
          : '创建角色卡失败'
      } catch (error) {
        logger.error('创建角色卡错误:', error)
        return '创建角色卡时发生错误'
      }
    })

  parent
    .subcommand(
      '.pc.set <name:text> <attr:text> <value:number>',
      '设置角色属性'
    )
    .action(async ({ session }, name, attr, value) => {
      if (!name || !attr || value === undefined) {
        return '参数不完整 用法: .pc.set <角色名> <属性名> <属性值>'
      }

      try {
        const success = setCharacterAttribute(
          name,
          attr,
          value,
          config.maxAttributesPerCard
        )
        if (!success) {
          return `设置失败 可能是属性数量已达上限(${config.maxAttributesPerCard})`
        }
        return `${session.username} 已设置 ${name} 的 ${attr} = ${value}`
      } catch (error) {
        logger.error('设置属性错误:', error)
        return '设置属性时发生错误'
      }
    })

  parent
    .subcommand('.pc.get <name:text> <attr:text>', '查询角色属性')
    .action(async ({ session }, name, attr) => {
      if (!name || !attr) {
        return '参数不完整 用法: .pc.get <角色名> <属性名>'
      }

      try {
        const value = getCharacterAttribute(name, attr)
        return value >= 0
          ? `${session.username} 查询 ${name} 的 ${attr} = ${value}`
          : '未找到该属性'
      } catch (error) {
        logger.error('查询属性错误:', error)
        return '查询属性时发生错误'
      }
    })

  parent
    .subcommand('.pc.del <name:text>', '删除角色卡')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }

      try {
        const success = deleteCharacterFile(name)
        return success
          ? `${session.username} 已删除角色卡: ${name}`
          : '角色卡不存在'
      } catch (error) {
        logger.error('删除角色卡错误:', error)
        return '删除角色卡时发生错误'
      }
    })

  parent
    .subcommand('.pc.list', '列出所有角色卡')
    .action(async ({ session }) => {
      try {
        const characters = listCharacters()
        if (characters.length === 0) {
          return '还没有任何角色卡'
        }
        return `${session.username} 的角色卡列表 (${characters.length}个):\n${characters.map((name, i) => `${i + 1}. ${name}`).join('\n')}`
      } catch (error) {
        logger.error('列出角色卡错误:', error)
        return '列出角色卡时发生错误'
      }
    })

  parent
    .subcommand('.pc.show [name:text]', '查看角色卡详情')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }

      try {
        const character = loadCharacter(name)
        if (!character) {
          return `角色卡 ${name} 不存在`
        }

        const attrs = character.attributes
        const attrCount = Object.keys(attrs).length

        if (attrCount === 0) {
          return `角色卡: ${name}\n还没有任何属性`
        }

        const attrLines = Object.entries(attrs)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `  ${key}: ${value}`)
          .join('\n')

        const createdDate = new Date(character.createdAt).toLocaleString(
          'zh-CN'
        )
        const updatedDate = new Date(character.updatedAt).toLocaleString(
          'zh-CN'
        )

        return (
          `${session.username} 查看角色卡: ${name}\n` +
          `属性数量: ${attrCount}/${config.maxAttributesPerCard}\n` +
          `创建时间: ${createdDate}\n` +
          `更新时间: ${updatedDate}\n` +
          `属性列表:\n${attrLines}`
        )
      } catch (error) {
        logger.error('显示角色卡错误:', error)
        return '显示角色卡时发生错误'
      }
    })
}

/**
 * 属性名称同义词映射
 */
const ATTRIBUTE_ALIASES: Record<string, string> = {
  // COC7 属性
  str: '力量',
  力量: '力量',
  strength: '力量',
  con: '体质',
  体质: '体质',
  constitution: '体质',
  siz: '体型',
  体型: '体型',
  size: '体型',
  dex: '敏捷',
  敏捷: '敏捷',
  dexterity: '敏捷',
  app: '外貌',
  外貌: '外貌',
  appearance: '外貌',
  int: '智力',
  智力: '智力',
  intelligence: '智力',
  pow: '意志',
  意志: '意志',
  power: '意志',
  edu: '教育',
  教育: '教育',
  education: '教育',
  luck: '幸运',
  幸运: '幸运',
  luk: '幸运',
  san: '理智',
  理智: '理智',
  sanity: '理智',
  hp: '生命',
  生命: '生命',
  生命值: '生命',
  mp: '魔法',
  魔法: '魔法',
  魔法值: '魔法',
  db: '伤害加值',
  伤害加值: '伤害加值',
  伤害奖励: '伤害加值',
  mov: '移动力',
  移动力: '移动力',
  move: '移动力'
}

/**
 * 规范化属性名
 */
function normalizeAttributeName(name: string): string {
  const lower = name.toLowerCase().trim()
  return ATTRIBUTE_ALIASES[lower] || name
}

/**
 * 解析 .st 命令参数
 * 支持格式：
 * - 人物卡名-- (可选)
 * - 属性名 属性值 (设置)
 * - 属性名:属性值 (设置)
 * - 属性名+值 (增加)
 * - 属性名-值 (减少)
 * - 力量30敏捷40 (连续设置，无空格)
 */
function parseStCommand(input: string): {
  cardName?: string
  operations: Array<{
    attr: string
    op: 'set' | 'add' | 'sub'
    value: string | number
  }>
} {
  let text = input.trim()
  let cardName: string | undefined

  // 解析人物卡名称
  const cardMatch = text.match(/^(.+?)--(.+)$/)
  if (cardMatch) {
    cardName = cardMatch[1].trim()
    text = cardMatch[2].trim()
  }

  const operations: Array<{
    attr: string
    op: 'set' | 'add' | 'sub'
    value: string | number
  }> = []

  // 先尝试使用空格分割的格式（最常见）
  // 分割多个属性（支持空格和|分隔）
  {
    // 先按 | 分隔
    const groups = text
      .split('|')
      .map((g) => g.trim())
      .filter((g) => g)

    for (const group of groups) {
      // 每个组内按空格分隔
      const parts = group.split(/\s+/).filter((p) => p.trim())

      let i = 0
      while (i < parts.length) {
        const part = parts[i]

        // 尝试从 COC 输出格式中提取（如：力量STR=3D6*5=60/30/12 → 力量 60）
        const cocMatch = part.match(/^([\u4e00-\u9fa5]+)[A-Z]*=.*?=(\d+)/)
        if (cocMatch) {
          const attrName = cocMatch[1]
          const value = Number.parseInt(cocMatch[2], 10)
          if (!Number.isNaN(value)) {
            operations.push({
              attr: normalizeAttributeName(attrName),
              op: 'set',
              value
            })
          }
          i++
          continue
        }

        // 跳过包含等号或复杂表达式的部分（如果不是 COC 格式）
        if (part.includes('=') || part.includes('/') || part.includes('*')) {
          i++
          continue
        }

        // 验证属性名：只接受纯中文或纯英文（不包含数字和特殊字符）
        const isValidAttrName = /^[\u4e00-\u9fa5a-zA-Z]+$/.test(part)
        if (!isValidAttrName) {
          i++
          continue
        }

        // 检查是否包含操作符（无空格格式）
        const addMatch = part.match(/^([^+\-:]+)\+(.+)$/)
        const subMatch = part.match(/^([^+\-:]+)-(.+)$/)
        const colonMatch = part.match(/^([^+\-:]+)[:：](.+)$/)

        if (addMatch) {
          operations.push({
            attr: normalizeAttributeName(addMatch[1]),
            op: 'add',
            value: addMatch[2]
          })
          i++
        } else if (subMatch) {
          operations.push({
            attr: normalizeAttributeName(subMatch[1]),
            op: 'sub',
            value: subMatch[2]
          })
          i++
        } else if (colonMatch) {
          const value = Number.parseInt(colonMatch[2], 10)
          if (!Number.isNaN(value)) {
            operations.push({
              attr: normalizeAttributeName(colonMatch[1]),
              op: 'set',
              value
            })
          }
          i++
        } else if (i + 1 < parts.length) {
          // 尝试匹配 "属性名 值" 格式
          const nextPart = parts[i + 1]
          const value = Number.parseInt(nextPart, 10)

          if (!Number.isNaN(value)) {
            operations.push({
              attr: normalizeAttributeName(part),
              op: 'set',
              value
            })
            i += 2 // 跳过属性名和值
          } else {
            i++ // 无法解析，跳过
          }
        } else {
          i++ // 没有下一个元素，跳过
        }
      }
    }
  }

  return { cardName, operations }
}

/**
 * 属性设置命令 .st (COC) - 符合原始 Dice 项目规范
 */
export function registerAttributeCommands(
  parent: Command,
  config: Config,
  diceAdapter: DiceAdapter
) {
  // 统一的 .st 命令
  parent
    .subcommand('.st [args:text]', '人物卡管理')
    .usage('.st [人物卡名--]属性名 属性值 [属性名 属性值]...')
    .example('.st 力量30 敏捷40')
    .example('.st Kokona--力量30')
    .example('.st 力量+2d6 敏捷-10')
    .example('.st show')
    .action(async ({ session }, args) => {
      // 没有参数：查看当前人物卡
      if (!args || args.trim() === '') {
        try {
          const characterName = `user_${session.userId}`
          const attrs = getAllAttributes(characterName)

          if (!attrs || Object.keys(attrs).length === 0) {
            return (
              '还没有设置任何属性\n' +
              '使用 .st 属性名 属性值 来设置属性\n' +
              '例如: .st 力量30 敏捷40'
            )
          }

          const attrLines = Object.entries(attrs)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')

          return `${session.username} 的属性:\n${attrLines}`
        } catch (error) {
          logger.error('显示人物卡错误:', error)
          return '显示人物卡时发生错误'
        }
      }

      // 有参数：处理各种子命令
      const lowerArgs = args.toLowerCase().trim()

      // 用法四：展示人物卡
      if (lowerArgs.startsWith('show')) {
        const showArgs = args.substring(4).trim()
        if (!showArgs) {
          // 显示当前人物卡
          const characterName = `user_${session.userId}`
          const attrs = getAllAttributes(characterName)
          if (!attrs || Object.keys(attrs).length === 0) {
            return '还没有设置任何属性'
          }
          const attrLines = Object.entries(attrs)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')
          return `${session.username} 的属性:\n${attrLines}`
        }

        // 解析 show 后的参数
        const { cardName, operations } = parseStCommand(showArgs)
        const targetCard = cardName || `user_${session.userId}`

        if (showArgs.toLowerCase().includes('all')) {
          const attrs = getAllAttributes(targetCard)
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
        if (operations.length > 0) {
          const results: string[] = []
          for (const op of operations) {
            const value = getCharacterAttribute(targetCard, op.attr)
            if (value >= 0) {
              results.push(`${op.attr}: ${value}`)
            }
          }
          return results.length > 0 ? results.join('\n') : '未找到指定的属性'
        }
      }

      // 用法五：切换人物卡
      if (lowerArgs.startsWith('switch')) {
        return '暂不支持切换人物卡功能，请使用 [人物卡名--] 语法指定人物卡'
      }

      // 用法六：删除属性
      if (lowerArgs.startsWith('del')) {
        const delArgs = args.substring(3).trim()
        const { cardName } = parseStCommand(delArgs)
        const targetCard = cardName || `user_${session.userId}`

        if (delArgs.toLowerCase().includes('all')) {
          const success = deleteCharacterFile(targetCard)
          return success ? `已删除人物卡 ${cardName || '当前'}` : '人物卡不存在'
        }

        // 删除指定属性
        // TODO: 实现单个属性删除
        return '暂不支持删除单个属性，使用 .st clr 删除整个人物卡'
      }

      // 用法七：删除人物卡
      if (lowerArgs.startsWith('clr')) {
        const clrArgs = args.substring(3).trim()
        const targetCard = clrArgs || `user_${session.userId}`
        const success = deleteCharacterFile(targetCard)
        return success ? `已删除人物卡 ${clrArgs || '当前'}` : '人物卡不存在'
      }

      // 默认：设置/修改属性
      try {
        const { cardName, operations } = parseStCommand(args)
        const targetCard = cardName || `user_${session.userId}`

        logger.debug(
          `解析 .st 命令: args="${args}", cardName="${cardName}", operations=${JSON.stringify(operations)}`
        )

        if (operations.length === 0) {
          return `未识别到有效的属性设置，请检查格式\n输入内容: ${args}`
        }

        const results: string[] = []

        for (const op of operations) {
          if (op.op === 'set') {
            const success = setCharacterAttribute(
              targetCard,
              op.attr,
              op.value as number,
              config.maxAttributesPerCard
            )
            if (success) {
              results.push(`${op.attr}=${op.value}`)
            }
          } else if (op.op === 'add' || op.op === 'sub') {
            // 处理增减操作
            const currentValue = getCharacterAttribute(targetCard, op.attr) || 0
            let delta = 0

            // 如果是骰子表达式
            if (typeof op.value === 'string' && /d/i.test(op.value)) {
              const rollResult = diceAdapter.roll(op.value, 100)
              if (rollResult.errorCode === 0) {
                delta = rollResult.total
              }
            } else {
              delta = Number(op.value)
            }

            const newValue =
              op.op === 'add' ? currentValue + delta : currentValue - delta
            const success = setCharacterAttribute(
              targetCard,
              op.attr,
              Math.max(0, newValue),
              config.maxAttributesPerCard
            )
            if (success) {
              results.push(
                `${op.attr}${op.op === 'add' ? '+' : '-'}${delta}=${Math.max(0, newValue)}`
              )
            }
          }
        }

        if (results.length === 0) {
          return '设置失败'
        }

        const prefix = cardName ? `人物卡 ${cardName}` : `${session.username}`
        return `${prefix} ${results.join(' ')}`
      } catch (error) {
        logger.error('设置属性错误:', error)
        return '设置属性时发生错误'
      }
    })
}
