import type { Context, Session } from 'koishi';
import type { CharacterCard, CharacterBinding } from '../../database';
import { getUserKey, getCard, getActiveCard } from './card-operations';

/**
 * 获取当前群组绑定的人物卡
 */
export async function getBoundCard(ctx: Context, session: Session): Promise<CharacterCard | null> {
  const { userId, platform } = getUserKey(session);
  const guildId = session.guildId || '';

  // 查询绑定
  const bindings = await ctx.database.get('koidice_character_binding', {
    userId,
    platform,
    guildId
  });

  if (bindings.length === 0) {
    return null;
  }

  const binding = bindings[0];

  // 查询卡片
  const cards = await ctx.database.get('koidice_character', {
    userId,
    platform,
    cardName: binding.cardName
  });

  return cards[0] || null;
}

/**
 * 绑定人物卡到群组
 */
export async function bindCard(
  ctx: Context,
  session: Session,
  cardName: string | null
): Promise<void> {
  const { userId, platform } = getUserKey(session);
  const guildId = session.guildId || '';

  if (!guildId) {
    throw new Error('只能在群聊中绑定人物卡');
  }

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

  // 检查是否已有绑定
  const existing = await ctx.database.get('koidice_character_binding', {
    userId,
    platform,
    guildId
  });

  if (existing.length > 0) {
    // 更新绑定
    await ctx.database.set(
      'koidice_character_binding',
      { userId, platform, guildId },
      { cardName: targetCard.cardName }
    );
  } else {
    // 创建绑定
    await ctx.database.create('koidice_character_binding', {
      userId,
      platform,
      guildId,
      cardName: targetCard.cardName
    });
  }

  // 缓存角色卡数据到群组数据，供 Lua 实时查询
  try {
    const attrs =
      typeof targetCard.attributes === 'string'
        ? JSON.parse(targetCard.attributes)
        : targetCard.attributes;
    const cardData = {
      __Name: targetCard.cardName,
      name: targetCard.cardName,
      type: targetCard.cardType,
      ...attrs
    };
    const cacheKey = `player_card#${userId}`;
    // 转换为 Lua table 字面量格式
    const cacheValue = toLuaTable(cardData);

    // 检查是否已存在
    const existing = await ctx.database.get('koidice_group_data', {
      guildId,
      dataKey: cacheKey
    });

    if (existing.length > 0) {
      // 更新现有记录
      await ctx.database.set(
        'koidice_group_data',
        { guildId, dataKey: cacheKey },
        {
          dataValue: cacheValue
        }
      );
    } else {
      // 创建新记录
      await ctx.database.create('koidice_group_data', {
        guildId,
        dataKey: cacheKey,
        dataValue: cacheValue
      });
    }
  } catch (error) {
    // 缓存失败不影响绑定
    console.error('缓存角色卡失败:', error);
  }
}

/**
 * 将 JavaScript 对象转换为 Lua table 字面量
 */
function toLuaTable(obj: any): string {
  if (typeof obj !== 'object' || obj === null) {
    if (typeof obj === 'string') {
      return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return String(obj);
  }

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const luaKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `["${key}"]`;
    pairs.push(`${luaKey}=${toLuaTable(value)}`);
  }
  return `{${pairs.join(',')}}`;
}

/**
 * 获取所有群组绑定
 */
export async function getAllBindings(ctx: Context, session: Session): Promise<CharacterBinding[]> {
  const { userId, platform } = getUserKey(session);
  return await ctx.database.get('koidice_character_binding', {
    userId,
    platform
  });
}
