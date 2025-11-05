import type { Context, Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, extname, basename } from 'node:path'
import { getDataPath, getRulesDataPath } from '../utils/path'
import yaml from 'js-yaml'

/**
 * 规则条目
 */
interface RuleEntry {
  name: string
  content: string
}

/**
 * 远程规则数据
 */
interface RemoteRuleData {
  version: string
  rules: Record<string, Record<string, RuleEntry>>
  lastUpdate: number
}

/**
 * 规则缓存
 */
let remoteRulesCache: RemoteRuleData | null = null

/**
 * 本地规则缓存
 */
const localRulesCache: Record<string, Record<string, RuleEntry>> = {}

/**
 * 获取规则缓存文件路径
 */
function getRulesCachePath(): string {
  return resolve(getDataPath(), 'rules_cache.json')
}

/**
 * 加载本地缓存
 */
function loadLocalCache(): RemoteRuleData | null {
  try {
    const cachePath = getRulesCachePath()
    if (existsSync(cachePath)) {
      const content = readFileSync(cachePath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    logger.error('加载规则缓存失败:', error)
  }
  return null
}

/**
 * 保存本地缓存
 */
function saveLocalCache(data: RemoteRuleData): void {
  try {
    const cachePath = getRulesCachePath()
    writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    logger.error('保存规则缓存失败:', error)
  }
}

/**
 * 加载本地规则文件
 * 支持 JSON 和 YAML 格式
 */
function loadLocalRules(): void {
  try {
    const rulesDir = getRulesDataPath()

    if (!existsSync(rulesDir)) {
      logger.debug('规则目录不存在，跳过加载本地规则')
      return
    }

    const files = readdirSync(rulesDir)
    let loadedCount = 0

    for (const file of files) {
      const ext = extname(file).toLowerCase()
      const ruleName = basename(file, ext)
      const filePath = resolve(rulesDir, file)

      try {
        if (ext === '.json') {
          // 加载 JSON 格式规则
          const content = readFileSync(filePath, 'utf-8')
          const rules = JSON.parse(content)

          if (typeof rules === 'object' && rules !== null) {
            localRulesCache[ruleName] = {}

            // 支持两种格式：
            // 1. { "规则名": "规则内容" }
            // 2. { "规则名": { "name": "显示名", "content": "内容" } }
            for (const [key, value] of Object.entries(rules)) {
              if (typeof value === 'string') {
                localRulesCache[ruleName][key] = {
                  name: key,
                  content: value
                }
              } else if (typeof value === 'object' && value !== null) {
                const rule = value as any
                localRulesCache[ruleName][key] = {
                  name: rule.name || key,
                  content: rule.content || String(value)
                }
              }
            }
            loadedCount++
            logger.debug(
              `加载本地规则文件: ${file} (${Object.keys(localRulesCache[ruleName]).length} 条规则)`
            )
          }
        } else if (ext === '.yaml' || ext === '.yml') {
          // 加载 YAML 格式规则
          const content = readFileSync(filePath, 'utf-8')

          try {
            // 使用 js-yaml 解析 YAML
            const data = yaml.load(content) as any

            if (typeof data === 'object' && data !== null) {
              // 支持原始 Dice 项目格式：{ rule: "规则名", manual: { ... } }
              if (data.rule && data.manual) {
                const actualRuleName = data.rule
                localRulesCache[actualRuleName] = {}

                for (const [key, value] of Object.entries(data.manual)) {
                  if (typeof value === 'string') {
                    localRulesCache[actualRuleName][key] = {
                      name: key,
                      content: value
                    }
                  }
                }
                loadedCount++
                logger.debug(
                  `加载本地规则文件: ${file} -> ${actualRuleName} (${Object.keys(localRulesCache[actualRuleName]).length} 条规则)`
                )
              }
              // 兼容简化格式：直接键值对
              else {
                localRulesCache[ruleName] = {}

                for (const [key, value] of Object.entries(data)) {
                  if (typeof value === 'string') {
                    localRulesCache[ruleName][key] = {
                      name: key,
                      content: value
                    }
                  } else if (typeof value === 'object' && value !== null) {
                    const rule = value as any
                    localRulesCache[ruleName][key] = {
                      name: rule.name || key,
                      content: rule.content || String(value)
                    }
                  }
                }
                loadedCount++
                logger.debug(
                  `加载本地规则文件: ${file} (${Object.keys(localRulesCache[ruleName]).length} 条规则)`
                )
              }
            }
          } catch (yamlError) {
            logger.error(`解析 YAML 文件 ${file} 失败:`, yamlError)
          }
        }
      } catch (error) {
        logger.error(`加载规则文件 ${file} 失败:`, error)
      }
    }

    if (loadedCount > 0) {
      logger.info(`成功加载 ${loadedCount} 个本地规则文件`)
    }
  } catch (error) {
    logger.error('加载本地规则失败:', error)
  }
}

/**
 * 从本地规则查找
 */
function findLocalRule(system: string, keyword: string): RuleEntry | null {
  if (Object.keys(localRulesCache).length === 0) {
    return null
  }

  const lowerKeyword = keyword.toLowerCase()
  const lowerSystem = system.toLowerCase()

  // 查找指定系统的规则
  if (lowerSystem && localRulesCache[lowerSystem]) {
    const systemRules = localRulesCache[lowerSystem]

    // 精确匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase() === lowerKeyword ||
        entry.name.toLowerCase() === lowerKeyword
      ) {
        return entry
      }
    }

    // 模糊匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase().includes(lowerKeyword) ||
        entry.name.toLowerCase().includes(lowerKeyword)
      ) {
        return entry
      }
    }
  }

  // 搜索所有系统
  for (const systemRules of Object.values(localRulesCache)) {
    // 精确匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase() === lowerKeyword ||
        entry.name.toLowerCase() === lowerKeyword
      ) {
        return entry
      }
    }
  }

  // 模糊匹配
  for (const systemRules of Object.values(localRulesCache)) {
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase().includes(lowerKeyword) ||
        entry.name.toLowerCase().includes(lowerKeyword)
      ) {
        return entry
      }
    }
  }

  return null
}

/**
 * 从远程服务器查询单个规则（与原始 Dice 项目 API 一致）
 */
async function fetchRemoteRule(
  ctx: Context,
  ruleName: string,
  itemName: string
): Promise<string | null> {
  try {
    const ruleUrl = 'http://api.kokona.tech:5555/rules'

    // 构建表单数据，与原始 Dice 项目一致
    const formData = new URLSearchParams()
    formData.append('Name', itemName)
    formData.append('QQ', '0') // Koishi 环境下使用 0
    formData.append('v', '20190114')
    if (ruleName) {
      formData.append('Type', `Rules-${ruleName}`)
    }

    logger.debug(`查询远程规则: ${ruleName}:${itemName}`)
    const response = await ctx.http.post(ruleUrl, formData.toString(), {
      timeout: 10000,
      headers: {
        'User-Agent': 'Koishi-Plugin-Koidice',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (response && typeof response === 'string' && response.trim()) {
      logger.debug('远程规则查询成功')
      return response
    }
  } catch (error) {
    logger.debug('查询远程规则失败:', error)
  }
  return null
}

/**
 * 从远程服务器拉取完整规则库（用于批量更新）
 */
async function fetchRemoteRules(ctx: Context): Promise<RemoteRuleData | null> {
  try {
    // 使用 Dice! 官方 Kokona API
    const ruleUrl = 'http://api.kokona.tech:5555/rules'

    logger.info('正在从 Kokona 规则库拉取规则...')
    const response = await ctx.http.post(ruleUrl, '', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Koishi-Plugin-Koidice',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (response) {
      const data: RemoteRuleData = {
        version: response.version || '1.0.0',
        rules: response.rules || {},
        lastUpdate: Date.now()
      }

      // 保存到缓存
      saveLocalCache(data)
      remoteRulesCache = data

      logger.info('规则拉取成功')
      return data
    }
  } catch (error) {
    logger.error('拉取远程规则失败:', error)
  }
  return null
}

/**
 * 获取规则数据（优先使用缓存）
 */
function getRulesData(): RemoteRuleData | null {
  if (!remoteRulesCache) {
    remoteRulesCache = loadLocalCache()
  }
  return remoteRulesCache
}

/**
 * 从远程数据查找规则
 */
function findRemoteRule(system: string, keyword: string): RuleEntry | null {
  const data = getRulesData()
  if (!data || !data.rules) {
    return null
  }

  const lowerKeyword = keyword.toLowerCase()
  const lowerSystem = system.toLowerCase()

  // 查找指定系统的规则
  if (lowerSystem && data.rules[lowerSystem]) {
    const systemRules = data.rules[lowerSystem]

    // 精确匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase() === lowerKeyword ||
        entry.name.toLowerCase() === lowerKeyword
      ) {
        return entry
      }
    }

    // 模糊匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase().includes(lowerKeyword) ||
        entry.name.toLowerCase().includes(lowerKeyword)
      ) {
        return entry
      }
    }
  }

  // 搜索所有系统
  for (const systemRules of Object.values(data.rules)) {
    // 精确匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase() === lowerKeyword ||
        entry.name.toLowerCase() === lowerKeyword
      ) {
        return entry
      }
    }
  }

  // 模糊匹配
  for (const systemRules of Object.values(data.rules)) {
    for (const [key, entry] of Object.entries(systemRules)) {
      if (
        key.toLowerCase().includes(lowerKeyword) ||
        entry.name.toLowerCase().includes(lowerKeyword)
      ) {
        return entry
      }
    }
  }

  return null
}

/**
 * 规则速查命令 .rule / .rules
 */
export function registerRuleCommands(
  parent: Command,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const ctx = parent.ctx
  parent
    .subcommand('.rule [query:text]', '规则速查')
    .alias('.rules')
    .action(async (_session, query) => {
      try {
        if (!query) {
          return (
            '用法:\n' +
            '.rule <词条> - 查询规则\n' +
            '.rule list - 列出所有规则\n' +
            '.rule update - 更新远程规则\n' +
            '.rule coc:<词条> - 查询COC规则\n' +
            '.rule dnd:<词条> - 查询DND规则\n' +
            '例如: .rule 大成功'
          )
        }

        // 更新远程规则
        if (query.toLowerCase() === 'update') {
          const result = await fetchRemoteRules(ctx)
          if (result) {
            return `规则库已更新\n版本: ${result.version}\n更新时间: ${new Date(result.lastUpdate).toLocaleString('zh-CN')}`
          } else {
            return '更新失败，请检查网络连接'
          }
        }

        // 列出规则
        if (query.toLowerCase() === 'list') {
          let result = `=== Dice! 内置规则 ===\n`

          try {
            const allKeys = diceAdapter.listRuleKeys()
            result += `共 ${allKeys.length} 条规则\n`
            result += `使用 .rule <关键词> 查询\n`
          } catch (error) {
            logger.error('列出规则错误:', error)
          }

          // 显示本地规则信息
          if (Object.keys(localRulesCache).length > 0) {
            result += `\n=== 本地规则文件 ===\n`
            for (const [system, rules] of Object.entries(localRulesCache)) {
              result += `${system}: ${Object.keys(rules).length} 条\n`
            }
          }

          // 显示远程规则信息
          const remoteData = getRulesData()
          if (remoteData) {
            result += `\n=== 远程规则库 ===\n`
            result += `版本: ${remoteData.version}\n`
            result += `系统: ${Object.keys(remoteData.rules).join(', ')}\n`
            result += `更新时间: ${new Date(remoteData.lastUpdate).toLocaleString('zh-CN')}`
          } else {
            result += `\n使用 .rule update 拉取远程规则库`
          }

          return result
        }

        // 解析系统和关键词
        let system = ''
        let keyword = query

        if (query.includes(':')) {
          const parts = query.split(':', 2)
          system = parts[0].trim()
          keyword = parts[1].trim()
        }

        // 1. 先查询 WASM 内置规则
        try {
          const wasmResult = system
            ? diceAdapter.queryRuleBySystem(system, keyword)
            : diceAdapter.queryRule(keyword)

          if (wasmResult.success && wasmResult.content) {
            return `【${keyword}】\n${wasmResult.content}`
          }
        } catch (error) {
          logger.debug('WASM规则查询失败:', error)
        }

        // 2. 查询本地规则文件
        const localRule = findLocalRule(system, keyword)
        if (localRule) {
          return `【${localRule.name}】\n${localRule.content}`
        }

        // 3. 查询本地缓存的远程规则
        const cachedRule = findRemoteRule(system, keyword)
        if (cachedRule) {
          return `【${cachedRule.name}】\n${cachedRule.content}`
        }

        // 4. 实时查询远程规则（与原始 Dice 项目一致）
        try {
          const remoteResult = await fetchRemoteRule(ctx, system, keyword)
          if (remoteResult) {
            return `【${keyword}】\n${remoteResult}`
          }
        } catch (error) {
          logger.debug('远程规则实时查询失败:', error)
        }

        return `未找到规则: ${keyword}\n使用 .rule list 查看所有规则\n或使用 .rule update 更新远程规则库`
      } catch (error) {
        logger.error('规则速查错误:', error)
        return '查询失败'
      }
    })

  // 启动时加载缓存和本地规则
  remoteRulesCache = loadLocalCache()
  loadLocalRules()

  // 如果缓存过期（超过7天），后台更新
  if (remoteRulesCache) {
    const daysSinceUpdate =
      (Date.now() - remoteRulesCache.lastUpdate) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate > 7) {
      logger.info('规则缓存已过期，后台更新中...')
      fetchRemoteRules(ctx).catch((err) => {
        logger.error('后台更新规则失败:', err)
      })
    }
  }
}
