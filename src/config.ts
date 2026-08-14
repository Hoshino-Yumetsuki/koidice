import { Schema } from 'koishi';

export interface Config {
  // 基础设置
  defaultDice: number;
  enableCOC: boolean;
  enableDND: boolean;
  enableCustomDeck: boolean;

  // 掷骰设置
  maxDiceCount: number;
  maxDiceFace: number;
  showDetail: boolean;

  // 角色卡设置
  enableCharacterCard: boolean;
  maxAttributesPerCard: number;

  // 日志设置
  isLog: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  // 基础设置
  Schema.object({
    defaultDice: Schema.number().default(100).description('默认骰子面数').min(2).max(1000),

    enableCOC: Schema.boolean().default(true).description('启用COC规则支持'),

    enableDND: Schema.boolean().default(true).description('启用DND规则支持'),

    enableCustomDeck: Schema.boolean().default(true).description('启用自定义牌堆功能')
  }).description('基础设置'),

  // 掷骰设置
  Schema.object({
    maxDiceCount: Schema.number().default(100).description('单次掷骰最大骰子数量').min(1).max(1000),

    maxDiceFace: Schema.number().default(1000).description('骰子最大面数').min(2).max(10000),

    showDetail: Schema.boolean().default(true).description('显示掷骰详细结果')
  }).description('掷骰设置'),

  // 角色卡设置
  Schema.object({
    enableCharacterCard: Schema.boolean().default(true).description('启用角色卡功能'),

    maxAttributesPerCard: Schema.number()
      .default(50)
      .description('每个角色卡最大属性数量')
      .min(1)
      .max(200)
  }).description('角色卡设置'),

  // 日志设置
  Schema.object({
    isLog: Schema.boolean().default(false).description('是否输出debug日志')
  }).description('日志设置')
]);

export const name = 'koidice';

export default Config;
