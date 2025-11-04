import { type Context, Logger } from 'koishi'
import type { Config } from './config'
import { initializeDiceAdapter, registerCommands } from './commands'
import { clearAllObservers } from './commands/observer'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 读取版本号
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
)
export const version = packageJson.version
import { getDataPath } from './utils/path'
import { createLogger, setLoggerLevel } from './utils/logger'

export let logger: Logger

export async function apply(ctx: Context, config: Config) {
  logger = createLogger(ctx, 'koidice')
  setupLogger(config)

  // 确保数据目录存在
  try {
    const dataPath = getDataPath()
    logger.info(`数据目录: ${dataPath}`)
  } catch (error) {
    logger.error('创建数据目录失败:', error)
  }

  // 初始化WASM模块
  try {
    await initializeDiceAdapter()
  } catch (error) {
    logger.error('Dice WASM模块加载失败:', error)
    throw error
  }

  // 注册所有命令
  registerCommands(ctx, config)

  // 清理资源
  ctx.on('dispose', () => {
    logger.info('开始卸载 Dice 插件...')

    try {
      // 清理旁观者列表
      clearAllObservers()
      logger.debug('已清理旁观者数据')

      logger.info('Dice 插件卸载完成')
    } catch (error) {
      logger.error('插件卸载时发生错误:', error)
    }
  })
}

function setupLogger(config: Config) {
  if (config.isLog) {
    setLoggerLevel(Logger.DEBUG)
  }
}

export * from './config'
export { name } from './config'
