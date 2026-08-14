/**
 * 人物卡命令相关类型定义
 */

/**
 * 属性操作类型
 */
export type AttributeOperation = {
  attr: string;
  op: 'set' | 'add' | 'sub';
  value: string | number;
};

/**
 * 解析后的命令参数
 */
export interface ParsedStCommand {
  cardName?: string;
  operations: AttributeOperation[];
}

/**
 * 属性名称同义词映射
 */
export const ATTRIBUTE_ALIASES: Record<string, string> = {
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
};

/**
 * 规范化属性名
 */
export function normalizeAttributeName(name: string): string {
  const lower = name.toLowerCase().trim();
  return ATTRIBUTE_ALIASES[lower] || name;
}
