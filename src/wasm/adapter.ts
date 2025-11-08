import { logger, version } from '../index'
import type {
  DiceModule,
  RollResult,
  COCCheckResult,
  SkillCheckResult,
  SanityCheckResult,
  InitiativeRollResult,
  InitiativeTurnResult,
  DeckDrawResult,
  RuleQueryResult
} from './types'
import { SuccessLevel } from './types'
import createDiceModule from '../../lib/dice.js'

// 模块级别的缓存变量
let wasmModule: DiceModule | null = null
let modulePromise: Promise<DiceModule> | null = null
let isPreloading = false

/**
 * Start preloading the WASM module in the background
 * This is called automatically when the module is imported
 */
function startPreload(): void {
  if (isPreloading || wasmModule || modulePromise) {
    return
  }
  isPreloading = true
  initDiceModule().catch(() => {
    // Silently fail, will retry on actual use
    isPreloading = false
  })
}

/**
 * 初始化 Dice WASM 模块
 */
export async function initDiceModule(): Promise<DiceModule> {
  if (wasmModule) {
    return wasmModule
  }

  if (modulePromise) {
    return modulePromise
  }

  modulePromise = (async () => {
    try {
      // Configure stdout/stderr redirection before module initialization
      const module = (await createDiceModule({
        print: (text: string) => {
          if (text) logger.debug(`[WASM] ${text}`)
        },
        printErr: (text: string) => {
          if (text) logger.error(`[WASM] ${text}`)
        }
      })) as DiceModule
      wasmModule = module
      isPreloading = false
      return module
    } catch (error) {
      modulePromise = null
      isPreloading = false
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to initialize Dice WASM module: ${message}`)
    }
  })()

  return modulePromise
}

/**
 * Check if WASM module is ready (synchronously)
 */
export function isModuleReady(): boolean {
  return wasmModule !== null
}

// Start preloading immediately when this module is imported
startPreload()

/**
 * Dice WASM 适配器
 * 提供更友好的TypeScript接口
 */
export class DiceAdapter {
  private module: DiceModule | null = null
  private _initialized = false

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return
    }

    this.module = await initDiceModule()
    this._initialized = true
  }

  /**
   * Auto-initialize on first use if WASM is ready
   */
  private ensureModule(): DiceModule {
    if (this._initialized && this.module) {
      return this.module
    }

    // Try auto-initialization if module is already loaded
    if (wasmModule && !this._initialized) {
      this.module = wasmModule
      this._initialized = true
      return this.module
    }

    throw new Error(
      'Dice WASM module not initialized. WASM module is still loading. Please wait a moment or call await adapter.initialize() first.'
    )
  }

  // ============ 新架构：统一命令处理器 ============

  /**
   * 处理掷骰命令（新架构，C++完成所有解析）
   * @param rawCommand 原始命令字符串（不含.r前缀）
   * @param userId 用户ID
   * @param channelId 频道ID
   * @param isHidden 是否暗骰
   * @param isSimple 是否简化输出
   * @param defaultDice 默认骰子面数
   */
  processRoll(
    rawCommand: string,
    userId: string,
    channelId: string,
    isHidden = false,
    isSimple = false,
    defaultDice = 100
  ) {
    const module = this.ensureModule()
    return module.processRoll(
      rawCommand,
      userId,
      channelId,
      isHidden,
      isSimple,
      defaultDice
    )
  }

  /**
   * 处理检定命令（新架构，C++完成所有解析）
   * @param rawCommand 原始命令字符串
   * @param userId 用户ID
   * @param rule COC房规
   */
  processCheck(rawCommand: string, userId: string, rule = 0) {
    const module = this.ensureModule()
    return module.processCheck(rawCommand, userId, rule)
  }

  /**
   * 处理COC检定（新架构）
   */
  processCOCCheck(skillValue: number, bonusDice = 0) {
    const module = this.ensureModule()
    return module.processCOCCheck(skillValue, bonusDice)
  }

  // ============ 旧接口（保持兼容） ============

  /**
   * 执行掷骰
   * @param expression 掷骰表达式，如 "1d100", "3d6+5"
   * @param defaultDice 默认骰子面数
   * @returns 掷骰结果
   */
  roll(expression: string, defaultDice = 100): RollResult {
    const module = this.ensureModule()
    return module.rollDice(expression, defaultDice)
  }

  /**
   * COC7版规则检定
   * @param skillValue 技能值
   * @param bonusDice 奖励骰数量（正数为奖励，负数为惩罚）
   * @returns 检定结果
   */
  cocCheck(skillValue: number, bonusDice = 0): COCCheckResult {
    const module = this.ensureModule()
    return module.cocCheck(skillValue, bonusDice)
  }

  /**
   * 技能检定（高级版本，支持完整表达式解析）
   * @param expression 检定表达式，如 "困难理智 50" 或 "3#p理智 50"
   * @param rule 房规（0-7，默认1）
   * @returns 检定结果
   */
  skillCheck(expression: string, rule = 1): SkillCheckResult {
    const module = this.ensureModule()
    return module.skillCheck(expression, rule)
  }

  /**
   * 暗骰投掷
   * @param expression 掷骰表达式
   * @param defaultDice 默认骰子面数
   * @returns 是否成功
   */
  hiddenRoll(expression: string, defaultDice = 100): boolean {
    const module = this.ensureModule()
    const result = module.hiddenRoll(expression, defaultDice)
    return result.success
  }

  /**
   * 获取掷骰表达式的最大值
   * @param expression 掷骰表达式
   * @param defaultDice 默认骰子面数
   */
  getMaxValue(expression: string, defaultDice = 100): number {
    const module = this.ensureModule()
    return module.getMaxValue(expression, defaultDice)
  }

  /**
   * 获取掷骰表达式的最小值
   * @param expression 掷骰表达式
   * @param defaultDice 默认骰子面数
   */
  getMinValue(expression: string, defaultDice = 100): number {
    const module = this.ensureModule()
    return module.getMinValue(expression, defaultDice)
  }

  // ============ 牌堆功能 ============

  /**
   * 从牌堆抽卡
   * @param deckName 牌堆名称
   * @param count 抽取数量
   */
  drawFromDeck(deckName: string, count: number = 1): DeckDrawResult {
    const module = this.ensureModule()
    return module.drawFromDeck(deckName, count)
  }

  /**
   * 洗牌并抽取（支持权重，最大随机性）
   * @param deckName 牌堆名称
   * @param count 抽取数量，-1表示全部
   */
  shuffleDeck(deckName: string, count: number = -1): DeckDrawResult {
    const module = this.ensureModule()
    return module.shuffleDeck(deckName, count)
  }

  /**
   * 列出所有牌堆
   */
  listDecks(): string {
    const module = this.ensureModule()
    return module.listDecks()
  }

  /**
   * 获取牌堆大小
   */
  getDeckSize(deckName: string): number {
    const module = this.ensureModule()
    return module.getDeckSize(deckName)
  }

  /**
   * 检查牌堆是否存在
   */
  deckExists(deckName: string): boolean {
    const module = this.ensureModule()
    return module.deckExists(deckName)
  }

  // ============ 规则查询功能 ============

  /**
   * 查询规则（支持 "system:keyword" 格式）
   */
  queryRule(query: string): RuleQueryResult {
    const module = this.ensureModule()
    return module.queryRule(query)
  }

  /**
   * 按系统查询规则
   */
  queryRuleBySystem(system: string, keyword: string): RuleQueryResult {
    const module = this.ensureModule()
    return module.queryRuleBySystem(system, keyword)
  }

  /**
   * 列出所有规则关键词
   */
  listRuleKeys(): string[] {
    const module = this.ensureModule()
    return module.listRuleKeys()
  }

  /**
   * 列出指定系统的规则
   */
  listRulesBySystem(system: string): string[] {
    const module = this.ensureModule()
    return module.listRulesBySystem(system)
  }

  /**
   * 创建角色卡
   */
  createCharacter(name: string): boolean {
    const module = this.ensureModule()
    return module.createCharacter(name)
  }

  /**
   * 设置角色属性
   */
  setCharacterAttr(
    characterName: string,
    attrName: string,
    value: number
  ): boolean {
    const module = this.ensureModule()
    return module.setCharacterAttr(characterName, attrName, value)
  }

  /**
   * 获取角色属性
   */
  getCharacterAttr(characterName: string, attrName: string): number {
    const module = this.ensureModule()
    return module.getCharacterAttr(characterName, attrName)
  }

  /**
   * 删除角色卡
   */
  deleteCharacter(name: string): boolean {
    const module = this.ensureModule()
    return module.deleteCharacter(name)
  }

  /**
   * 获取版本信息（从 package.json 读取）
   */
  getVersion(): string {
    // 直接返回从 index.ts 导入的版本号，不需要调用 WASM
    return version
  }

  // ============ 人物作成功能 ============

  /**
   * COC7版人物作成（简略版）
   */
  generateCOC7(): string {
    const module = this.ensureModule()
    return module.generateCOC7Character()
  }

  /**
   * COC6版人物作成（简略版）
   */
  generateCOC6(): string {
    const module = this.ensureModule()
    return module.generateCOC6Character()
  }

  /**
   * COC7版人物作成（详细版，包含背景）
   */
  generateCOC7Detailed(): string {
    const module = this.ensureModule()
    return module.generateCOC7CharacterDetailed()
  }

  /**
   * COC6版人物作成（详细版，包含背景）
   */
  generateCOC6Detailed(): string {
    const module = this.ensureModule()
    return module.generateCOC6CharacterDetailed()
  }

  /**
   * COC7版人物作成（多次生成）
   * @param count 生成数量
   */
  generateCOC7Multiple(count: number): string {
    const module = this.ensureModule()
    return module.generateCOC7Multiple(count)
  }

  /**
   * COC6版人物作成（多次生成）
   * @param count 生成数量
   */
  generateCOC6Multiple(count: number): string {
    const module = this.ensureModule()
    return module.generateCOC6Multiple(count)
  }

  /**
   * DND人物作成
   * @param count 生成数量
   */
  generateDND(count = 1): string {
    const module = this.ensureModule()
    return module.generateDNDCharacter(count)
  }

  // ============ 人物卡解析功能 ============

  /**
   * 解析 COC 输出格式的属性
   * @param input COC 输出字符串
   * @returns JSON 格式的属性对象
   */
  parseCOCAttributes(input: string): string {
    const module = this.ensureModule()
    return module.parseCOCAttributes(input)
  }

  /**
   * 规范化属性名
   * @param name 属性名
   * @returns 规范化后的属性名
   */
  normalizeAttributeName(name: string): string {
    const module = this.ensureModule()
    return module.normalizeAttributeName(name)
  }

  /**
   * 解析 .st 命令参数
   * @param input 输入字符串
   * @returns 解析后的命令对象 { cardName?: string, operations: Array<{attr, op, value}> }
   */
  parseStCommand(input: string): {
    cardName?: string
    operations: Array<{ attr: string; op: string; value: number }>
  } {
    const module = this.ensureModule()
    return module.parseStCommand(input)
  }

  /**
   * 解析属性名列表
   * @param input 输入字符串
   * @returns 解析后的对象 { cardName?: string, attributes: Array<string> }
   */
  parseAttributeList(input: string): {
    cardName?: string
    attributes: string[]
  } {
    const module = this.ensureModule()
    return module.parseAttributeList(input)
  }

  // ============ 理智检定功能 ============

  /**
   * 理智检定 (Sanity Check)
   * @param currentSan 当前理智值
   * @param successLoss 成功时损失表达式 (如 "0" 或 "1")
   * @param failureLoss 失败时损失表达式 (如 "1d6" 或 "1d10")
   */
  sanityCheck(
    currentSan: number,
    successLoss: string,
    failureLoss: string
  ): SanityCheckResult {
    const module = this.ensureModule()
    return module.sanityCheck(currentSan, successLoss, failureLoss)
  }

  // ============ 疯狂症状功能 ============

  /**
   * 获取临时疯狂症状
   * @param index 症状索引 (1-10)
   */
  getTempInsanity(index: number): string {
    const module = this.ensureModule()
    return module.getTempInsanity(index)
  }

  /**
   * 获取永久疯狂症状
   * @param index 症状索引 (1-10)
   */
  getLongInsanity(index: number): string {
    const module = this.ensureModule()
    return module.getLongInsanity(index)
  }

  /**
   * 获取恐惧症
   * @param index 恐惧症索引 (1-93)
   */
  getPhobia(index: number): string {
    const module = this.ensureModule()
    return module.getPhobia(index)
  }

  /**
   * 获取躁狂症
   * @param index 躁狂症索引 (1-96)
   */
  getMania(index: number): string {
    const module = this.ensureModule()
    return module.getMania(index)
  }

  // ============ 先攻列表功能 ============

  /**
   * 添加先攻条目
   */
  addInitiative(channelId: string, name: string, initiative: number): boolean {
    const module = this.ensureModule()
    const result = module.addInitiative(channelId, name, initiative)
    return result.success || false
  }

  /**
   * 先攻检定
   */
  rollInitiative(
    channelId: string,
    name: string,
    modifier: number = 0
  ): InitiativeRollResult {
    const module = this.ensureModule()
    return module.rollInitiative(channelId, name, modifier)
  }

  /**
   * 移除先攻条目
   */
  removeInitiative(channelId: string, name: string): boolean {
    const module = this.ensureModule()
    return module.removeInitiative(channelId, name)
  }

  /**
   * 清空先攻列表
   */
  clearInitiative(channelId: string): boolean {
    const module = this.ensureModule()
    return module.clearInitiative(channelId)
  }

  /**
   * 下一个回合
   */
  nextInitiativeTurn(channelId: string): InitiativeTurnResult {
    const module = this.ensureModule()
    return module.nextInitiativeTurn(channelId)
  }

  /**
   * 获取先攻列表显示
   */
  getInitiativeList(channelId: string): string {
    const module = this.ensureModule()
    return module.getInitiativeList(channelId)
  }

  /**
   * 获取先攻列表条目数
   */
  getInitiativeCount(channelId: string): number {
    const module = this.ensureModule()
    return module.getInitiativeCount(channelId)
  }

  /**
   * 序列化先攻列表
   */
  serializeInitiative(channelId: string): string {
    const module = this.ensureModule()
    return module.serializeInitiative(channelId)
  }

  /**
   * 反序列化先攻列表
   */
  deserializeInitiative(channelId: string, jsonStr: string): boolean {
    const module = this.ensureModule()
    return module.deserializeInitiative(channelId, jsonStr)
  }

  // ============ 扩展系统 ============

  /**
   * 加载 Lua 扩展
   * @param name 扩展名称
   * @param code Lua 代码（包装后的）
   * @param originalCode 原始 Lua 代码（用于 loadLua）
   * @returns 是否加载成功
   */
  loadLuaExtension(name: string, code: string, originalCode: string): boolean {
    const module = this.ensureModule()
    return module.loadLuaExtension(name, code, originalCode)
  }

  /**
   * 加载 JavaScript 扩展
   * @param name 扩展名称
   * @param code JavaScript 代码
   * @returns 是否加载成功
   */
  loadJSExtension(name: string, code: string): boolean {
    const module = this.ensureModule()
    return module.loadJSExtension(name, code)
  }

  /**
   * 调用扩展
   * @param name 扩展名称
   * @param context 上下文对象
   * @returns 扩展执行结果
   */
  callExtension(name: string, context: any): string {
    const module = this.ensureModule()
    return module.callExtension(name, context)
  }

  /**
   * 卸载扩展
   * @param name 扩展名称
   * @returns 是否卸载成功
   */
  unloadExtension(name: string): boolean {
    const module = this.ensureModule()
    return module.unloadExtension(name)
  }

  /**
   * 列出所有已加载的扩展
   * @returns 扩展名称列表（JSON 格式）
   */
  listExtensions(): string {
    const module = this.ensureModule()
    return module.listExtensions()
  }

  /**
   * 检查扩展是否存在
   * @param name 扩展名称
   * @returns 扩展是否存在
   */
  hasExtension(name: string): boolean {
    const module = this.ensureModule()
    return module.hasExtension(name)
  }

  /**
   * 格式化成功等级为文本
   */
  static formatSuccessLevel(level: SuccessLevel): string {
    const levelNames = {
      [SuccessLevel.CriticalFailure]: '大失败',
      [SuccessLevel.Failure]: '失败',
      [SuccessLevel.Success]: '成功',
      [SuccessLevel.HardSuccess]: '困难成功',
      [SuccessLevel.ExtremeSuccess]: '极难成功',
      [SuccessLevel.CriticalSuccess]: '大成功'
    }
    return levelNames[level] || '未知'
  }

  /**
   * 格式化掷骰结果为消息文本
   */
  static formatRollResult(result: RollResult, reason?: string): string {
    if (result.errorCode !== 0) {
      return `掷骰失败: ${result.errorMsg}`
    }

    const parts: string[] = []
    if (reason) {
      parts.push(reason)
    }
    parts.push(result.detail)

    return parts.join(' ')
  }

  /**
   * 格式化COC检定结果为消息文本
   */
  static formatCOCCheckResult(
    result: COCCheckResult,
    skillName?: string
  ): string {
    if (result.errorCode !== 0) {
      return `检定失败: ${result.errorMsg}`
    }

    const parts: string[] = []
    if (skillName) {
      parts.push(`${skillName}检定`)
    }
    parts.push(`${result.rollValue}/${result.skillValue}`)
    parts.push(DiceAdapter.formatSuccessLevel(result.successLevel))

    return parts.join(' ')
  }
}

// 导出单例实例
let adapterInstance: DiceAdapter | null = null

/**
 * 获取全局适配器实例
 */
export async function getDiceAdapter(): Promise<DiceAdapter> {
  if (!adapterInstance) {
    adapterInstance = new DiceAdapter()
    await adapterInstance.initialize()
  }
  return adapterInstance
}

/**
 * Create a new Dice adapter instance
 * @returns {Promise<DiceAdapter>} Initialized adapter
 */
export async function createDiceAdapter(): Promise<DiceAdapter> {
  const adapter = new DiceAdapter()
  await adapter.initialize()
  return adapter
}

/**
 * Wait for WASM module to be ready
 * @returns {Promise<void>}
 */
export async function waitForReady(): Promise<void> {
  await initDiceModule()
}
