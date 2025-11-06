/**
 * Dice WASM 模块类型定义
 */

export interface RollResult {
  total: number
  expression: string
  detail: string
  errorCode: number
  errorMsg: string
}

export interface COCCheckResult {
  rollValue: number
  skillValue: number
  successLevel: number // 0-大失败, 1-失败, 2-成功, 3-困难成功, 4-极难成功, 5-大成功
  description: string
  errorCode: number
  errorMsg: string
}

/**
 * 技能检定结果（高级版本，支持完整表达式解析）
 */
export interface SkillCheckResult {
  skillName: string
  originalSkillValue: number
  finalSkillValue: number
  difficulty: number
  rounds: number
  results: Array<{
    rollValue: number
    skillValue: number
    successLevel: number
    description: string
  }>
  errorCode: number
  errorMsg: string
}

/**
 * 暗骰结果
 */
export interface HiddenRollResult {
  success: boolean
  errorCode: number
  errorMsg: string
}

/**
 * 理智检定结果
 */
export interface SanityCheckResult {
  rollValue: number
  successLevel: number // 0-大失败, 1-失败, 2-成功, 3-困难成功, 4-极难成功, 5-大成功
  sanLoss: number
  lossDetail: string
  newSan: number
  errorCode: number
  errorMsg: string
}

/**
 * 先攻检定结果
 */
export interface InitiativeRollResult {
  success: boolean
  initiative: number
  detail: string
  message?: string
}

/**
 * 先攻回合结果
 */
export interface InitiativeTurnResult {
  success: boolean
  currentName: string
  currentInitiative: number
  currentRound: number
  message?: string
}

/**
 * 牌堆抽取结果
 */
export interface DeckDrawResult {
  success: boolean
  message?: string
  cards: string[]
}

/**
 * 规则查询结果
 */
export interface RuleQueryResult {
  success: boolean
  content: string
  error: string
}

export enum SuccessLevel {
  CriticalFailure = 0,
  Failure = 1,
  Success = 2,
  HardSuccess = 3,
  ExtremeSuccess = 4,
  CriticalSuccess = 5
}

/**
 * 统一命令处理结果（新架构）
 */
export interface CommandResult {
  success: boolean
  results?: any[]
  reason?: string
  rounds?: number
  isHidden?: boolean
  isSimple?: boolean
  errorMsg?: string
}

/**
 * Dice WASM 模块接口
 */
export interface DiceModule {
  // === 新架构：统一命令处理器 ===
  processRoll(
    rawCommand: string,
    userId: string,
    channelId: string,
    isHidden?: boolean,
    isSimple?: boolean,
    defaultDice?: number
  ): CommandResult
  processCheck(rawCommand: string, userId: string, rule?: number): any
  processCOCCheck(skillValue: number, bonusDice?: number): COCCheckResult

  // === 旧接口（保持兼容） ===
  rollDice(expression: string, defaultDice?: number): RollResult
  cocCheck(skillValue: number, bonusDice?: number): COCCheckResult
  skillCheck(expression: string, rule?: number): SkillCheckResult
  hiddenRoll(expression: string, defaultDice?: number): HiddenRollResult
  getMaxValue(expression: string, defaultDice?: number): number
  getMinValue(expression: string, defaultDice?: number): number

  // 人物作成功能
  generateCOC7Character(): string
  generateCOC6Character(): string
  generateCOC7CharacterDetailed(): string
  generateCOC6CharacterDetailed(): string
  generateCOC7Multiple(count: number): string
  generateCOC6Multiple(count: number): string
  generateDNDCharacter(count?: number): string

  // 人物卡解析功能
  parseCOCAttributes(input: string): string
  normalizeAttributeName(name: string): string

  // 理智检定功能
  sanityCheck(
    currentSan: number,
    successLoss: string,
    failureLoss: string
  ): SanityCheckResult

  // 疯狂症状功能
  getTempInsanity(index: number): string
  getLongInsanity(index: number): string
  getPhobia(index: number): string
  getMania(index: number): string

  // 先攻列表功能
  addInitiative(channelId: string, name: string, initiative: number): any
  rollInitiative(
    channelId: string,
    name: string,
    modifier?: number
  ): InitiativeRollResult
  removeInitiative(channelId: string, name: string): boolean
  clearInitiative(channelId: string): boolean
  nextInitiativeTurn(channelId: string): InitiativeTurnResult
  getInitiativeList(channelId: string): string
  getInitiativeCount(channelId: string): number
  serializeInitiative(channelId: string): string
  deserializeInitiative(channelId: string, jsonStr: string): boolean

  // 牌堆功能
  drawFromDeck(deckName: string, count?: number): DeckDrawResult
  listDecks(): string
  getDeckSize(deckName: string): number
  deckExists(deckName: string): boolean

  // 规则查询功能
  queryRule(query: string): RuleQueryResult
  queryRuleBySystem(system: string, keyword: string): RuleQueryResult
  listRuleKeys(): string[]
  listRulesBySystem(system: string): string[]

  // 角色卡功能
  createCharacter(characterName: string): boolean
  setCharacterAttr(
    characterName: string,
    attrName: string,
    attrValue: number
  ): boolean
  getCharacterAttr(characterName: string, attrName: string): number
  deleteCharacter(characterName: string): boolean

  // 工具函数
  getVersion(): string
  initialize(): boolean
}

/**
 * Emscripten 模块配置
 */
export interface EmscriptenModuleConfig {
  locateFile?: (path: string, prefix: string) => string
  [key: string]: any
}

/**
 * Emscripten 模块工厂类型
 */
export type EmscriptenModuleFactory = (
  config?: EmscriptenModuleConfig
) => Promise<DiceModule>
