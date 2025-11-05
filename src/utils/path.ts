import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/**
 * 获取 Koishi 数据目录路径
 * @returns 数据目录路径
 */
export function getDataPath(): string {
  // Koishi 的数据目录通常在工作目录的 data 文件夹下
  const dataDir = resolve(process.cwd(), 'data', 'koidice')

  // 确保目录存在
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  return dataDir
}

/**
 * 获取配置文件路径
 * @param filename 文件名
 * @returns 完整文件路径
 */
export function getConfigPath(filename: string): string {
  return resolve(getDataPath(), filename)
}

/**
 * 获取角色卡数据路径
 * @returns 角色卡数据目录
 */
export function getCharacterDataPath(): string {
  const charDir = resolve(getDataPath(), 'characters')

  if (!existsSync(charDir)) {
    mkdirSync(charDir, { recursive: true })
  }

  return charDir
}

/**
 * 获取牌堆数据路径
 * @returns 牌堆数据目录
 */
export function getDeckDataPath(): string {
  const deckDir = resolve(getDataPath(), 'decks')

  if (!existsSync(deckDir)) {
    mkdirSync(deckDir, { recursive: true })
  }

  return deckDir
}

/**
 * 获取规则数据路径
 * @returns 规则数据目录
 */
export function getRulesDataPath(): string {
  const rulesDir = resolve(getDataPath(), 'rules')

  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true })
  }

  return rulesDir
}
