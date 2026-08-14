import type { DescriptorJson } from './types';

/**
 * 生成 Lua 脚本包装代码
 */
export function wrapLuaScript(code: string, _descriptor: DescriptorJson): string {
  const trimmedCode = code.trim();

  // 如果已经是函数格式，直接返回
  if (trimmedCode.match(/^return\s+function/)) {
    return trimmedCode;
  }

  // 包装脚本，提供全局函数访问
  return `return function(msg)
  -- 提取 dice API 为局部变量（同步版本）
  -- 自定义 queryRule 函数，支持插件规则
  local function queryRule(query)
    -- 插件规则会通过 msg.pluginRules 传递
    if msg.pluginRules then
      for ruleName, manual in pairs(msg.pluginRules) do
        if manual[query] then
          return manual[query]
        end
      end
    end
    -- 如果插件规则中没找到，使用 dice.queryRule
    local result = dice.queryRule(query)
    if result and result.success then
      return result.content
    end
    return nil
  end

  local function setGroupConf(gid, key, value)
    dice.setGroupData(gid, key, tostring(value))
  end
  local function getGroupConf(gid, key)
    return dice.getGroupData(gid, key)
  end
  local function setGroupData(gid, key, value)
    dice.setGroupData(gid, key, tostring(value))
  end
  local function getGroupData(gid, key)
    return dice.getGroupData(gid, key)
  end
  local function setUserData(uid, key, value)
    dice.setUserData(uid, key, tostring(value))
  end
  local function getUserData(uid, key)
    return dice.getUserData(uid, key)
  end

  -- 创建玩家卡片缓存表(稍后填充)
  local playerCardCache = {}

  -- 属性别名映射表(从插件模板加载)
  -- 格式: { ["Maid"] = { ["Favor"] = "宠爱", ["Stress"] = "压力", ... } }
  local templateAliasMap = msg.templateAliasMap or {}

  -- 调试: 输出别名映射
  if templateAliasMap and type(templateAliasMap) == "table" then
    for cardType, aliasMap in pairs(templateAliasMap) do
      dice.log("Template alias map for " .. cardType .. ":")
      if type(aliasMap) == "table" then
        for alias, chineseName in pairs(aliasMap) do
          dice.log("  " .. alias .. " -> " .. chineseName)
        end
      end
    end
  else
    dice.log("No template alias map available")
  end

  -- 为角色卡添加别名查找元表
  local function addAliasMetatable(card)
    if not card or type(card) ~= "table" then
      return card
    end

    -- 获取角色卡类型对应的别名映射
    local cardType = card.type
    local aliasMap = templateAliasMap[cardType]

    if aliasMap then
      local mt = {
        __index = function(t, key)
          -- 先尝试直接访问
          local value = rawget(t, key)
          if value ~= nil then
            return value
          end

          -- 如果没找到,尝试通过别名查找
          local chineseName = aliasMap[key]
          if chineseName then
            return rawget(t, chineseName)
          end

          return nil
        end
      }
      setmetatable(card, mt)
    end

    return card
  end

  -- 简单的 JSON 解析辅助函数
  local function parseJSON(str)
    if not str or str == "" then return nil end

    local success, result = pcall(function()
      -- 移除外层空格
      str = str:gsub("^%s+", ""):gsub("%s+$", "")

      -- 先尝试作为 Lua table 字面量解析
      local func = load("return " .. str)
      if func then
        local ok, data = pcall(func)
        if ok then return data end
      end

      -- 如果失败,尝试 JSON 解析
      -- 简单的 JSON 到 Lua 转换
      local jsonStr = str
      -- 处理对象: {"key":value} -> {["key"]=value}
      jsonStr = jsonStr:gsub('"([^"]+)"%s*:', function(k)
        return '["' .. k .. '"]='
      end)
      -- 处理布尔值和 null
      jsonStr = jsonStr:gsub(':%s*true', '=true')
      jsonStr = jsonStr:gsub(':%s*false', '=false')
      jsonStr = jsonStr:gsub(':%s*null', '=nil')
      jsonStr = jsonStr:gsub(',%s*true', ',true')
      jsonStr = jsonStr:gsub(',%s*false', ',false')
      jsonStr = jsonStr:gsub(',%s*null', ',nil')

      func = load("return " .. jsonStr)
      if func then
        local ok, data = pcall(func)
        if ok then return data end
      end

      return nil
    end)

    return success and result or nil
  end

  -- getPlayerCard 从缓存中实时查询（同步）
  -- 使用脚本初始化时创建的 playerCardCache 表
  local function getPlayerCard(uid, gid)
    local card
    -- 如果是当前用户,直接返回 msg.char
    if uid == msg.uid then
      card = msg.char
    else
      -- 从缓存表中获取
      card = playerCardCache[uid]
    end

    -- 为角色卡添加别名查找元表
    if card then
      card = addAliasMetatable(card)
    end

    return card
  end

  -- 缓存角色卡数据（供脚本主动缓存使用）
  local function cachePlayerCard(uid, cardData, gid)
    if not cardData then return end
    local cacheKey = "player_card#" .. uid
    -- 简单的 table 序列化（Lua table 字面量格式）
    local function serialize(t)
      if type(t) ~= "table" then
        if type(t) == "string" then
          return string.format("%q", t)
        else
          return tostring(t)
        end
      end
      local result = "{"
      local first = true
      for k, v in pairs(t) do
        if not first then result = result .. "," end
        first = false
        if type(k) == "string" then
          result = result .. "[" .. string.format("%q", k) .. "]="
        else
          result = result .. "[" .. k .. "]="
        end
        result = result .. serialize(v)
      end
      result = result .. "}"
      return result
    end
    local serialized = serialize(cardData)
    dice.setGroupData(gid or msg.gid, cacheKey, serialized)
  end

  -- 填充玩家卡片缓存表(从 msg 中提取预缓存的数据)
  if msg.game and msg.game.pls then
    dice.log("game.pls exists, length: " .. tostring(#msg.game.pls))

    -- 为每个玩家ID尝试从数据库缓存中加载角色卡
    for i = 1, #msg.game.pls do
      local playerId = msg.game.pls[i]
      local cacheKey = "player_card#" .. playerId
      local cached = dice.getGroupData(msg.gid, cacheKey)
      if cached and cached ~= "" then
        local card = parseJSON(cached)
        if card then
          -- 为角色卡添加别名查找元表
          card = addAliasMetatable(card)
          playerCardCache[playerId] = card
          dice.log("Cached player card for: " .. playerId .. ", type: " .. tostring(card.type))
        end
      end
    end

    -- 添加 totable() 方法（兼容原版 Dice）
    local pls_mt = {
      __index = {
        totable = function(self)
          dice.log("totable() called, returning pls array")
          return self
        end
      }
    }
    setmetatable(msg.game.pls, pls_mt)
  else
    dice.log("game.pls does not exist or is nil")
  end

  -- 为当前用户的角色卡添加别名元表
  if msg.char then
    msg.char = addAliasMetatable(msg.char)
  end

  -- 自动缓存当前用户的角色卡数据（供 getPlayerCard 使用）
  if msg.char and msg.uid and msg.gid then
    cachePlayerCard(msg.uid, msg.char, msg.gid)
  end

  -- 原始脚本代码
  local __result = (function()
${code}
  end)()

  -- 替换占位符（如果返回字符串）
  if type(__result) == "string" then
    __result = __result:gsub("{card}", tostring(msg.card or ""))
    __result = __result:gsub("{pc}", tostring(msg.char and msg.char.__Name or ""))
  end

  return __result
end`;
}

/**
 * 替换结果中的占位符
 */
export function replacePlaceholders(
  result: string,
  context: {
    username?: string;
    userId?: string;
    guildId?: string;
    channelId?: string;
    charName?: string;
    card?: string;
  }
): string {
  return result
    .replace(/\{self\}/g, context.username || context.userId || '你')
    .replace(/\{nick\}/g, context.username || context.userId || '你')
    .replace(/\{uid\}/g, context.userId || '')
    .replace(/\{gid\}/g, context.guildId || context.channelId || '')
    .replace(/\{card\}/g, context.card || context.charName || '角色卡')
    .replace(/\{pc\}/g, context.charName || '');
}
