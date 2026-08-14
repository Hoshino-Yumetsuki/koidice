import type { Context, Session } from 'koishi'
import type {
  DiceAdapter,
  ExtensionDataSnapshot,
  ExtensionDataWrite
} from '../../wasm'
import type {
  DescriptorJson,
  ExtensionContext,
  ReplyConfig,
  ReplyEcho,
  ReplyLimit,
  ReplyMatchMode
} from './types'
import { logger } from '../../index'
import { replacePlaceholders } from './script-wrapper'
import type { CharacterService } from '../character-service'
import type { GameSessionService } from '../game-session-service'

interface MatchResult {
  suffix: string
}

interface RegisteredReply {
  config: ReplyConfig
  scriptName?: string
  matchers: Array<{ mode: ReplyMatchMode; value: string | RegExp }>
}

export async function registerPluginCommands(
  ctx: Context,
  adapter: DiceAdapter,
  descriptor: DescriptorJson,
  commands: Map<string, ReplyConfig>,
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, unknown>,
  templateAliasMap?: Map<string, Record<string, string>>
): Promise<Array<() => void>> {
  const disposers: Array<() => void> = []
  const replies: RegisteredReply[] = []

  for (const [name, config] of commands) {
    const echo = normalizeEcho(config.echo)
    const script = echo.lua || echo.js
    const scriptName = script
      ? script.startsWith(`${descriptor.name}.`)
        ? script
        : `${descriptor.name}.${script}`
      : undefined
    const matchers = compileMatchers(name, config)
    if (!matchers.length) continue
    replies.push({ config, scriptName, matchers })
  }

  if (!replies.length) return disposers

  const dispose = ctx.middleware(async (session, next) => {
    const content = session.stripped?.content ?? session.content ?? ''
    for (const mode of ['match', 'prefix', 'search', 'regex'] as const) {
      const candidates = replies
        .map((reply) => ({ reply, matched: matchReply(reply, content, mode) }))
        .filter((candidate) => candidate.matched)
        .sort((left, right) => right.matched!.matchedLength - left.matched!.matchedLength)
      for (const { reply, matched } of candidates) {
        const type = (reply.config.type || 'Reply').toLowerCase()
        if (type !== 'reply' && type !== 'both') continue
        if (!allowsSession(reply.config.limit, session)) continue
        if (!passesProbability(reply.config.limit?.prob)) continue
        const result = await executeReply(
          ctx, adapter, descriptor, reply, matched!.suffix, session,
          characterService, gameSessionService, pluginRules, templateAliasMap
        )
        if (result) await session.send(result)
        return
      }
    }
    return next()
  }, true)
  disposers.push(dispose)
  return disposers
}

function compileMatchers(name: string, config: ReplyConfig) {
  const keyword = config.keyword || {}
  const result: RegisteredReply['matchers'] = []
  const append = (mode: ReplyMatchMode, input?: string | string[]) => {
    for (const value of asArray(input)) {
      if (!value) continue
      if (mode === 'regex') {
        try {
          result.push({ mode, value: new RegExp(value, 'u') })
        } catch (error) {
          logger.warn(`Invalid extension regex ${value}: ${String(error)}`)
        }
      } else {
        result.push({ mode, value })
      }
    }
  }
  append('match', keyword.match ?? keyword.Match)
  append('prefix', keyword.prefix ?? keyword.Prefix)
  append('search', keyword.search ?? keyword.Search)
  append('regex', keyword.regex ?? keyword.Regex)
  if (!result.length) append('prefix', `.${name}`)
  return result
}

function matchReply(
  reply: RegisteredReply,
  content: string,
  mode: ReplyMatchMode
): (MatchResult & { matchedLength: number }) | undefined {
  const foldedContent = content.toLocaleLowerCase()
  for (const matcher of reply.matchers) {
    if (matcher.mode !== mode) continue
    if (matcher.value instanceof RegExp) {
      const match = matcher.value.exec(content)
      if (match && match.index === 0 && match[0].length === content.length) {
        return { suffix: match[1] ?? '', matchedLength: match[0].length }
      }
      continue
    }
    const keyword = matcher.value
    const foldedKeyword = keyword.toLocaleLowerCase()
    if (mode === 'match' && foldedContent === foldedKeyword) {
      return { suffix: '', matchedLength: keyword.length }
    }
    if (mode === 'prefix' && foldedContent.startsWith(foldedKeyword)) {
      return { suffix: content.slice(keyword.length).trim(), matchedLength: keyword.length }
    }
    if (mode === 'search') {
      const index = foldedContent.indexOf(foldedKeyword)
      if (index >= 0) {
        return { suffix: content.slice(index + keyword.length).trim(), matchedLength: keyword.length }
      }
    }
  }
}

async function executeReply(
  ctx: Context,
  adapter: DiceAdapter,
  descriptor: DescriptorJson,
  reply: RegisteredReply,
  suffix: string,
  session: Session,
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, unknown>,
  templateAliasMap?: Map<string, Record<string, string>>
): Promise<string> {
  try {
    const context = await buildExtensionContext(
      ctx,
      session,
      suffix,
      characterService,
      gameSessionService,
      pluginRules,
      templateAliasMap
    )
    let result = ''
    const echo = normalizeEcho(reply.config.echo)
    if (reply.scriptName) {
      const snapshot = await loadDataSnapshot(ctx, context.uid, context.gid)
      result = await adapter.callExtension(reply.scriptName, context, snapshot)
      await persistWrites(ctx, adapter.drainExtensionDataWrites())
    } else if (echo.deck?.length) {
      result = echo.deck[Math.floor(Math.random() * echo.deck.length)] || ''
    } else {
      result = echo.text || ''
    }
    return replacePlaceholders(result, {
      username: session.username,
      userId: session.userId,
      guildId: session.guildId,
      charName:
        typeof context.char?.__Name === 'string'
          ? context.char.__Name
          : typeof context.char?.name === 'string'
            ? context.char.name
            : '',
      card: context.card
    })
  } catch (error) {
    logger.error(`Extension reply failed (${descriptor.name}):`, error)
    return `[错误] ${error instanceof Error ? error.message : String(error)}`
  }
}

async function buildExtensionContext(
  ctx: Context,
  session: Session,
  suffix: string,
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, unknown>,
  templateAliasMap?: Map<string, Record<string, string>>
): Promise<ExtensionContext> {
  let char: Record<string, unknown> | undefined
  try {
    const active =
      (session.guildId && (await characterService.getBoundCard(session))) ||
      (await characterService.getActiveCard(session))
    if (active) {
      const attributes =
        typeof active.attributes === 'string'
          ? JSON.parse(active.attributes)
          : active.attributes
      char = { __Name: active.cardName, name: active.cardName, type: active.cardType, ...attributes }
    }
  } catch (error) {
    logger.debug('读取扩展角色卡失败:', error)
  }

  let game: Record<string, unknown> = {}
  try {
    const current = await gameSessionService.getSession(session)
    if (current) game = gameSessionService.gameToContext(current)
  } catch (error) {
    logger.debug('读取扩展游戏会话失败:', error)
  }

  const gid = session.guildId || session.channelId || ''
  const cardRows = gid
    ? await ctx.database.get('koidice_group_data', {
        guildId: gid,
        dataKey: `card#${session.userId}`
      })
    : []

  return {
    suffix,
    uid: session.userId || '',
    gid,
    private: !session.guildId,
    char,
    card: cardRows[0]?.dataValue || '',
    game,
    pluginRules: Object.fromEntries(pluginRules),
    templateAliasMap: templateAliasMap ? Object.fromEntries(templateAliasMap) : {}
  }
}

async function loadDataSnapshot(
  ctx: Context,
  uid: string,
  gid: string
): Promise<ExtensionDataSnapshot> {
  const users = uid
    ? await ctx.database.get('koidice_user_data', { userId: uid })
    : []
  const groups = gid
    ? await ctx.database.get('koidice_group_data', { guildId: gid })
    : []
  return {
    users: users.map((row) => ({ id: uid, key: row.dataKey, value: row.dataValue })),
    groups: groups.map((row) => ({ id: gid, key: row.dataKey, value: row.dataValue }))
  }
}

async function persistWrites(ctx: Context, writes: ExtensionDataWrite[]) {
  const userRows = writes
    .filter((write) => write.scope === 'user')
    .map((write) => ({ userId: write.id, dataKey: write.key, dataValue: write.value }))
  const groupRows = writes
    .filter((write) => write.scope === 'group')
    .map((write) => ({ guildId: write.id, dataKey: write.key, dataValue: write.value }))
  if (userRows.length) await ctx.database.upsert('koidice_user_data', userRows)
  if (groupRows.length) await ctx.database.upsert('koidice_group_data', groupRows)
}

function allowsSession(limit: ReplyLimit | undefined, session: Session): boolean {
  return (
    allowsId(limit?.user_id, session.userId || '') &&
    allowsId(limit?.grp_id, session.guildId || '')
  )
}

function allowsId(limit: ReplyLimit['user_id'], id: string): boolean {
  if (!limit) return true
  if (typeof limit === 'string' || Array.isArray(limit)) return asArray(limit).includes(id)
  const only = asArray(limit.only)
  const not = asArray(limit.not)
  if (only.length && !only.includes(id)) return false
  if (not.includes(id)) return false
  const nor = asArray(limit.nor).map(String)
  if (nor.includes('0') && !id) return false
  return !nor.includes(id)
}

function passesProbability(probability?: number): boolean {
  if (!probability) return true
  return Math.random() * 100 < Math.max(0, Math.min(100, probability))
}

function normalizeEcho(echo: ReplyConfig['echo']): ReplyEcho {
  if (typeof echo === 'string') return { text: echo }
  if (Array.isArray(echo)) return { deck: echo }
  return echo || {}
}

function asArray<T>(value?: T | T[]): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value]
}
