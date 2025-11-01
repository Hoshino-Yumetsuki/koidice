import type {
  DiceModule,
  RollResult,
  COCCheckResult,
  SanityCheckResult,
  InitiativeRollResult,
  InitiativeTurnResult,
  DeckDrawResult,
  RuleQueryResult
} from './types'
import { SuccessLevel } from './types'
import { loadDiceWasm } from './loader'

/**
 * Dice WASM 适配器
 * 提供更友好的TypeScript接口
 */
export class DiceAdapter {
  private module: DiceModule | null = null

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    if (this.module) {
      return
    }
    this.module = await loadDiceWasm()
  }

  /**
   * 确保模块已加载
   */
  private ensureModule(): DiceModule {
    if (!this.module) {
      throw new Error(
        'Dice WASM module not initialized. Call initialize() first.'
      )
    }
    return this.module
  }

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
   * 获取版本信息
   */
  getVersion(): string {
    const module = this.ensureModule()
    return module.getVersion()
  }

  // ============ 人物作成功能 ============

  /**
   * COC7版人物作成
   */
  generateCOC7(): string {
    const module = this.ensureModule()
    return module.generateCOC7Character()
  }

  /**
   * COC6版人物作成
   */
  generateCOC6(): string {
    const module = this.ensureModule()
    return module.generateCOC6Character()
  }

  /**
   * DND人物作成
   * @param count 生成数量
   */
  generateDND(count = 1): string {
    const module = this.ensureModule()
    return module.generateDNDCharacter(count)
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
