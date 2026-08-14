/**
 * .pc new 创建新人物卡命令
 */
import type { Command, Context } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import type { ExtensionService } from '../../services/extension-service';
import { generateDefaultAttributes } from '../../services/extension/template-parser';
import { logger } from '../../index';

/**
 * 注册 .pc new 命令
 */
export function registerPcNewCommand(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService
) {
  const characterService = new CharacterService(ctx, diceAdapter);

  parent
    .subcommand('.pc.new [args:text]', '创建新人物卡')
    .usage('.pc.new ([模板]:([生成参数]:))([卡名])')
    .example('.pc.new')
    .example('.pc.new Alice')
    .example('.pc.new COC7:Alice')
    .example('.pc.new COC7:80:Alice')
    .example('.pc.new Maid:女仆小红')
    .action(async ({ session }, args) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        // 检查人物卡数量限制
        const allCards = await characterService.getAllCards(session);
        if (allCards.length >= 16) {
          return '人物卡数量已达上限（16张），请先删除一些人物卡喵~';
        }

        let cardType = 'COC7';
        let cardName = '';

        if (args?.trim()) {
          const parts = args.trim().split(':');

          if (parts.length === 1) {
            // 只有卡名
            cardName = parts[0]?.trim() ?? '';
          } else if (parts.length === 2) {
            // 模板:卡名 或 卡名:参数
            const first = parts[0]?.trim() ?? '';
            const firstUpper = first.toUpperCase();
            // 检查是否是内置模板或插件模板
            if (firstUpper === 'COC6' || firstUpper === 'COC7' || firstUpper === 'DND5E') {
              cardType = firstUpper;
              cardName = parts[1]?.trim() ?? '';
            } else if (extensionService?.getTemplate(first)) {
              cardType = first;
              cardName = parts[1]?.trim() ?? '';
            } else {
              cardName = parts[0]?.trim() ?? '';
            }
          } else if (parts.length === 3) {
            // 模板:参数:卡名
            cardType = parts[0]?.trim() || 'COC7';
            cardName = parts[2]?.trim() ?? '';
          }
        }

        // 如果没有指定卡名，生成随机姓名
        if (!cardName) {
          const nameResult = diceAdapter.drawFromDeck('调查员姓名', 1);
          if (nameResult.success && nameResult.cards.length > 0) {
            cardName = nameResult.cards[0] ?? `角色_${Date.now().toString(36)}`;
          } else {
            cardName = `角色_${Date.now().toString(36)}`;
          }
        }

        // 生成属性
        let attributes: Record<string, number> = {};
        const cardTypeUpper = cardType.toUpperCase();

        if (cardTypeUpper === 'COC7') {
          const cocResult = diceAdapter.generateCOC7();

          // 解析COC输出
          const jsonResult = diceAdapter.parseCOCAttributes(cocResult);
          if (jsonResult && typeof jsonResult === 'string') {
            try {
              attributes = JSON.parse(jsonResult) as Record<string, number>;
            } catch (e) {
              logger.warn('解析COC属性失败:', e);
            }
          }
        } else if (cardTypeUpper === 'COC6') {
          const cocResult = diceAdapter.generateCOC6();
          const jsonResult = diceAdapter.parseCOCAttributes(cocResult);
          if (jsonResult && typeof jsonResult === 'string') {
            try {
              attributes = JSON.parse(jsonResult) as Record<string, number>;
            } catch (e) {
              logger.warn('解析COC属性失败:', e);
            }
          }
        } else if (extensionService) {
          // 尝试使用插件模板
          const template = extensionService.getTemplate(cardType);
          if (template) {
            attributes = generateDefaultAttributes(template);
            logger.info(`使用插件模板 ${cardType} 生成属性:`, attributes);
          }
        }

        // 创建人物卡
        await characterService.createCard(session, cardName, cardType, attributes);

        const attrText =
          Object.keys(attributes).length > 0
            ? `\n已生成属性: ${Object.entries(attributes)
                .map(([k, v]) => `${k}=${v}`)
                .join(' ')}`
            : '';

        return `已创建${cardType}人物卡: ${cardName}${attrText}`;
      } catch (error) {
        logger.error('创建人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '创建人物卡时发生错误';
      }
    });
}
