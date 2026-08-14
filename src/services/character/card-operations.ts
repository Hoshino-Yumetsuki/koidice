import type { Context, Session } from 'koishi';
import type { CharacterCard } from '../../database';
import type { DiceAdapter } from '../../wasm/adapter';

/**
 * 获取用户标识
 */
export function getUserKey(session: Session): {
  userId: string;
  platform: string;
} {
  const userId = session.userId;
  if (!userId) throw new Error('无法获取用户信息');

  return {
    userId,
    platform: session.platform
  };
}

/**
 * 获取用户当前激活的人物卡
 */
export async function getActiveCard(ctx: Context, session: Session): Promise<CharacterCard | null> {
  const { userId, platform } = getUserKey(session);
  const cards = await ctx.database.get('koidice_character', {
    userId,
    platform,
    isActive: true
  });
  return cards[0] || null;
}

/**
 * 获取用户的所有人物卡
 */
export async function getAllCards(ctx: Context, session: Session): Promise<CharacterCard[]> {
  const { userId, platform } = getUserKey(session);
  return await ctx.database.get('koidice_character', {
    userId,
    platform
  });
}

/**
 * 获取指定名称的人物卡
 */
export async function getCard(
  ctx: Context,
  session: Session,
  cardName: string
): Promise<CharacterCard | null> {
  const { userId, platform } = getUserKey(session);
  const cards = await ctx.database.get('koidice_character', {
    userId,
    platform,
    cardName
  });
  return cards[0] || null;
}

/**
 * 创建新人物卡
 */
export async function createCard(
  ctx: Context,
  session: Session,
  cardName: string,
  cardType: string = 'COC7',
  attributes: Record<string, number> = {}
): Promise<CharacterCard> {
  const { userId, platform } = getUserKey(session);

  // 检查是否已存在
  const existing = await getCard(ctx, session, cardName);
  if (existing) {
    throw new Error(`人物卡 "${cardName}" 已存在`);
  }

  // 如果是第一张卡，设为激活
  const allCards = await getAllCards(ctx, session);
  const isActive = allCards.length === 0;

  const card = await ctx.database.create('koidice_character', {
    userId,
    platform,
    cardName,
    cardType,
    attributes: JSON.stringify(attributes),
    isActive,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return card;
}

/**
 * 设置人物卡属性
 */
export async function setAttributes(
  ctx: Context,
  session: Session,
  cardName: string | null,
  attributes: Record<string, number>
): Promise<void> {
  const { userId, platform } = getUserKey(session);

  // 如果未指定卡名，使用当前激活的卡
  let targetCard: CharacterCard | null;
  if (cardName) {
    targetCard = await getCard(ctx, session, cardName);
  } else {
    targetCard = await getActiveCard(ctx, session);
  }

  if (!targetCard) {
    throw new Error('未找到人物卡');
  }

  // 合并属性
  const currentAttrs =
    typeof targetCard.attributes === 'string'
      ? JSON.parse(targetCard.attributes)
      : targetCard.attributes;
  const newAttrs = { ...currentAttrs, ...attributes };

  await ctx.database.set(
    'koidice_character',
    { userId, platform, cardName: targetCard.cardName },
    { attributes: JSON.stringify(newAttrs), updatedAt: new Date() }
  );
}

/**
 * 获取人物卡属性
 */
export async function getAttributes(
  ctx: Context,
  session: Session,
  cardName: string | null
): Promise<Record<string, number> | null> {
  const card = cardName ? await getCard(ctx, session, cardName) : await getActiveCard(ctx, session);

  if (!card) return null;

  return typeof card.attributes === 'string' ? JSON.parse(card.attributes) : card.attributes;
}

/**
 * 切换激活的人物卡
 */
export async function switchCard(ctx: Context, session: Session, cardName: string): Promise<void> {
  const { userId, platform } = getUserKey(session);

  // 检查目标卡是否存在
  const targetCard = await getCard(ctx, session, cardName);
  if (!targetCard) {
    throw new Error(`人物卡 "${cardName}" 不存在`);
  }

  // 取消所有卡的激活状态
  await ctx.database.set('koidice_character', { userId, platform }, { isActive: false });

  // 激活目标卡
  await ctx.database.set('koidice_character', { userId, platform, cardName }, { isActive: true });
}

/**
 * 删除人物卡
 */
export async function deleteCard(
  ctx: Context,
  session: Session,
  cardName: string
): Promise<boolean> {
  const card = await getCard(ctx, session, cardName);
  if (!card) return false;

  const { userId, platform } = getUserKey(session);

  // 删除绑定
  await ctx.database.remove('koidice_character_binding', {
    userId,
    platform,
    cardName
  });

  // 删除卡片
  await ctx.database.remove('koidice_character', {
    userId,
    platform,
    cardName
  });

  return true;
}

/**
 * 使用 C++ 实现解析 COC 输出并设置属性
 */
export async function parseAndSetCOCAttributes(
  ctx: Context,
  diceAdapter: DiceAdapter,
  session: Session,
  cardName: string | null,
  cocOutput: string
): Promise<void> {
  // 使用 C++ 解析 COC 输出
  const result = diceAdapter.parseCOCAttributes(cocOutput);
  const attributes = typeof result === 'string' ? JSON.parse(result) : result;

  if (Object.keys(attributes).length === 0) {
    throw new Error('无法解析 COC 属性');
  }

  // 设置属性
  await setAttributes(ctx, session, cardName, attributes);
}

/**
 * 重命名人物卡
 */
export async function renameCard(
  ctx: Context,
  session: Session,
  oldName: string,
  newName: string
): Promise<void> {
  const { userId, platform } = getUserKey(session);

  // 检查旧卡是否存在
  const oldCard = await getCard(ctx, session, oldName);
  if (!oldCard) {
    throw new Error(`人物卡 "${oldName}" 不存在`);
  }

  // 检查新名称是否已存在
  const newCard = await getCard(ctx, session, newName);
  if (newCard) {
    throw new Error(`人物卡 "${newName}" 已存在`);
  }

  // 更新卡片名称
  await ctx.database.set(
    'koidice_character',
    { userId, platform, cardName: oldName },
    { cardName: newName, updatedAt: new Date() }
  );

  // 更新绑定
  await ctx.database.set(
    'koidice_character_binding',
    { userId, platform, cardName: oldName },
    { cardName: newName }
  );
}

/**
 * 复制人物卡
 */
export async function copyCard(
  ctx: Context,
  session: Session,
  sourceName: string,
  targetName: string
): Promise<CharacterCard> {
  const { userId, platform } = getUserKey(session);

  // 检查源卡是否存在
  const sourceCard = await getCard(ctx, session, sourceName);
  if (!sourceCard) {
    throw new Error(`人物卡 "${sourceName}" 不存在`);
  }

  // 检查目标名称是否已存在
  const targetCard = await getCard(ctx, session, targetName);
  if (targetCard) {
    throw new Error(`人物卡 "${targetName}" 已存在`);
  }

  // 创建新卡
  const newCard = await ctx.database.create('koidice_character', {
    userId,
    platform,
    cardName: targetName,
    cardType: sourceCard.cardType,
    attributes: sourceCard.attributes as any, // 保持原始格式
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return newCard;
}

/**
 * 清空所有人物卡
 */
export async function clearAllCards(ctx: Context, session: Session): Promise<number> {
  const { userId, platform } = getUserKey(session);

  // 删除所有卡
  const cards = await getAllCards(ctx, session);
  await ctx.database.remove('koidice_character', {
    userId,
    platform
  });

  // 删除所有绑定
  await ctx.database.remove('koidice_character_binding', {
    userId,
    platform
  });

  // 删除所有统计
  await ctx.database.remove('koidice_character_stats', {
    userId,
    platform
  });

  return cards.length;
}
