#include "lua_support.h"
#include "extension_manager.h"
#include "../core/roll_handler.h"
#include "../core/check_handler.h"
#include "../features/rule.h"
#include <lua.hpp>
#include <stdexcept>
#include <sstream>
#include <emscripten/val.h>

namespace koidice {
namespace extensions {

// Lua C API 辅助宏
#define LUA_CHECK_ARGS(L, n) \
    if (lua_gettop(L) < n) { \
        return luaL_error(L, "Expected at least %d arguments", n); \
    }

// ============ Lua API 函数 ============

// dice.roll(expression[, defaultDice])
static int lua_dice_roll(lua_State* L) {
    LUA_CHECK_ARGS(L, 1);
    const char* expr = luaL_checkstring(L, 1);
    int defaultDice = luaL_optinteger(L, 2, 100);

    auto result = koidice::RollHandler::rollOnce(expr, defaultDice);

    // 返回 table: { total, detail, errorCode, errorMsg }
    lua_newtable(L);
    lua_pushinteger(L, result.total);
    lua_setfield(L, -2, "total");
    lua_pushstring(L, result.detail.c_str());
    lua_setfield(L, -2, "detail");
    lua_pushinteger(L, result.errorCode);
    lua_setfield(L, -2, "errorCode");
    lua_pushstring(L, result.errorMsg.c_str());
    lua_setfield(L, -2, "errorMsg");

    return 1;
}

// dice.cocCheck(skillValue[, bonusDice])
static int lua_dice_cocCheck(lua_State* L) {
    LUA_CHECK_ARGS(L, 1);
    int skillValue = luaL_checkinteger(L, 1);
    int bonusDice = luaL_optinteger(L, 2, 0);

    // 调用 CheckHandler::cocCheck，返回 emscripten::val
    emscripten::val jsResult = koidice::CheckHandler::cocCheck(skillValue, bonusDice);

    lua_newtable(L);
    lua_pushinteger(L, jsResult["rollValue"].as<int>());
    lua_setfield(L, -2, "rollValue");
    lua_pushinteger(L, jsResult["skillValue"].as<int>());
    lua_setfield(L, -2, "skillValue");
    lua_pushinteger(L, jsResult["successLevel"].as<int>());
    lua_setfield(L, -2, "successLevel");
    lua_pushstring(L, jsResult["description"].as<std::string>().c_str());
    lua_setfield(L, -2, "description");

    return 1;
}

// dice.log(message)
static int lua_dice_log(lua_State* L) {
    LUA_CHECK_ARGS(L, 1);
    const char* msg = luaL_checkstring(L, 1);
    // 在 WASM 环境中，输出到 stdout (会被 emscripten 捕获)
    printf("[Lua Extension] %s\n", msg);
    return 0;
}

// dice.queryRule(query) - 查询规则
static int lua_dice_queryRule(lua_State* L) {
    LUA_CHECK_ARGS(L, 1);
    const char* query = luaL_checkstring(L, 1);

    std::string result = koidice::queryRule(query);

    // 返回结果表
    lua_newtable(L);

    lua_pushboolean(L, !result.empty());
    lua_setfield(L, -2, "success");

    lua_pushstring(L, result.c_str());
    lua_setfield(L, -2, "content");

    lua_pushstring(L, result.empty() ? "Not found" : "");
    lua_setfield(L, -2, "error");

    return 1;
}

// dice.getUserData(uid, key)
static int lua_dice_getUserData(lua_State* L) {
    LUA_CHECK_ARGS(L, 2);
    const char* uid = luaL_checkstring(L, 1);
    const char* key = luaL_checkstring(L, 2);

    std::string value = ExtensionManager::getInstance().callUserDataGet(uid, key);
    lua_pushstring(L, value.c_str());
    return 1;
}

// dice.setUserData(uid, key, value)
static int lua_dice_setUserData(lua_State* L) {
    LUA_CHECK_ARGS(L, 3);
    const char* uid = luaL_checkstring(L, 1);
    const char* key = luaL_checkstring(L, 2);
    const char* value = luaL_checkstring(L, 3);

    ExtensionManager::getInstance().callUserDataSet(uid, key, value);
    return 0;
}

// dice.getGroupData(gid, key)
static int lua_dice_getGroupData(lua_State* L) {
    LUA_CHECK_ARGS(L, 2);
    const char* gid = luaL_checkstring(L, 1);
    const char* key = luaL_checkstring(L, 2);

    std::string value = ExtensionManager::getInstance().callGroupDataGet(gid, key);
    lua_pushstring(L, value.c_str());
    return 1;
}

// dice.setGroupData(gid, key, value)
static int lua_dice_setGroupData(lua_State* L) {
    LUA_CHECK_ARGS(L, 3);
    const char* gid = luaL_checkstring(L, 1);
    const char* key = luaL_checkstring(L, 2);
    const char* value = luaL_checkstring(L, 3);

    ExtensionManager::getInstance().callGroupDataSet(gid, key, value);
    return 0;
}

// loadLua(scriptName) - 加载另一个 Lua 脚本
// 模拟原版 Dice 行为：重新执行原始脚本代码并返回结果
static int lua_loadLua(lua_State* L) {
    LUA_CHECK_ARGS(L, 1);
    const char* scriptName = luaL_checkstring(L, 1);

    // 从原始代码注册表中查找脚本代码
    lua_getglobal(L, "__KOIDICE_ORIGINAL_CODES__");
    if (!lua_istable(L, -1)) {
        return luaL_error(L, "Original code registry not found");
    }

    lua_getfield(L, -1, scriptName);
    if (lua_isnil(L, -1)) {
        lua_pop(L, 2); // 弹出 nil 和表
        return luaL_error(L, "Script '%s' not found", scriptName);
    }

    // 获取原始代码字符串
    const char* originalCode = lua_tostring(L, -1);
    if (!originalCode) {
        lua_pop(L, 2);
        return luaL_error(L, "Failed to get original code for '%s'", scriptName);
    }

    // 移除表和代码字符串，清理栈
    lua_pop(L, 2);

    // 编译并执行原始代码（不是包装后的代码）
    if (luaL_loadstring(L, originalCode) != LUA_OK) {
        return lua_error(L); // 传播编译错误
    }

    // 执行脚本，无参数，1个返回值
    if (lua_pcall(L, 0, 1, 0) != LUA_OK) {
        return lua_error(L); // 传播运行时错误
    }

    // 返回脚本执行的结果（可能是函数、字符串等）
    return 1;
}

// ============ Lua 扩展类实现 ============

LuaExtension::LuaExtension() : L(nullptr), lastError("") {
    initLuaState();
}

LuaExtension::~LuaExtension() {
    cleanup();
}

void LuaExtension::initLuaState() {
    L = luaL_newstate();
    if (!L) {
        throw std::runtime_error("Failed to create Lua state");
    }

    // 打开标准库（精简版）
    luaL_openlibs(L);

    // 注册 dice API
    registerDiceAPI();

    // 创建脚本注册表（保存包装后的函数）
    lua_newtable(L);
    lua_setglobal(L, "__KOIDICE_SCRIPTS__");

    // 创建原始代码注册表（保存原始脚本代码）
    lua_newtable(L);
    lua_setglobal(L, "__KOIDICE_ORIGINAL_CODES__");
}

void LuaExtension::registerDiceAPI() {
    // 创建 dice table
    lua_newtable(L);

    // 注册函数
    lua_pushcfunction(L, lua_dice_roll);
    lua_setfield(L, -2, "roll");

    lua_pushcfunction(L, lua_dice_cocCheck);
    lua_setfield(L, -2, "cocCheck");

    lua_pushcfunction(L, lua_dice_log);
    lua_setfield(L, -2, "log");

    lua_pushcfunction(L, lua_dice_queryRule);
    lua_setfield(L, -2, "queryRule");

    lua_pushcfunction(L, lua_dice_getUserData);
    lua_setfield(L, -2, "getUserData");

    lua_pushcfunction(L, lua_dice_setUserData);
    lua_setfield(L, -2, "setUserData");

    lua_pushcfunction(L, lua_dice_getGroupData);
    lua_setfield(L, -2, "getGroupData");

    lua_pushcfunction(L, lua_dice_setGroupData);
    lua_setfield(L, -2, "setGroupData");

    // 设置为全局变量 dice
    lua_setglobal(L, "dice");

    // 注册 loadLua 为全局函数
    lua_pushcfunction(L, lua_loadLua);
    lua_setglobal(L, "loadLua");
}

bool LuaExtension::loadScript(const std::string& name, const std::string& code, const std::string& originalCode) {
    if (scripts.find(name) != scripts.end()) {
        lastError = "Script '" + name + "' already loaded";
        return false;
    }

    // 编译脚本（包装后的代码）
    int loadResult = luaL_loadstring(L, code.c_str());
    if (loadResult != LUA_OK) {
        lastError = lua_tostring(L, -1);
        lua_pop(L, 1);
        return false;
    }

    // 执行脚本（应返回一个函数）
    int callResult = lua_pcall(L, 0, 1, 0);
    if (callResult != LUA_OK) {
        lastError = lua_tostring(L, -1);
        lua_pop(L, 1);
        return false;
    }

    // 检查返回值是否为函数
    if (!lua_isfunction(L, -1)) {
        lastError = "Script must return a function";
        lua_pop(L, 1);
        return false;
    }

    // 保存到注册表
    int ref = luaL_ref(L, LUA_REGISTRYINDEX);

    // 同时保存到脚本注册表（供 execute 使用）
    lua_getglobal(L, "__KOIDICE_SCRIPTS__");
    lua_rawgeti(L, LUA_REGISTRYINDEX, ref);
    lua_setfield(L, -2, name.c_str());
    lua_pop(L, 1);

    // 保存原始代码到原始代码注册表（供 loadLua 使用）
    if (!originalCode.empty()) {
        lua_getglobal(L, "__KOIDICE_ORIGINAL_CODES__");
        lua_pushstring(L, originalCode.c_str());
        lua_setfield(L, -2, name.c_str());
        lua_pop(L, 1);
    }

    Script script;
    script.name = name;
    script.code = code;
    script.functionRef = ref;
    scripts[name] = script;

    return true;
}

std::string LuaExtension::execute(const std::string& name, const AttrObject& context) {
    auto it = scripts.find(name);
    if (it == scripts.end()) {
        return "[Error] Script '" + name + "' not found";
    }

    // 获取函数
    lua_rawgeti(L, LUA_REGISTRYINDEX, it->second.functionRef);

    // 推送 context 参数
    pushAttrObject(context);

    // 调用函数
    int callResult = lua_pcall(L, 1, 1, 0);
    if (callResult != LUA_OK) {
        lastError = lua_tostring(L, -1);
        lua_pop(L, 1);
        return "[Error] " + lastError;
    }

    // 获取返回值
    std::string result = getResultString();
    lua_pop(L, 1);

    return result;
}

void LuaExtension::unload(const std::string& name) {
    auto it = scripts.find(name);
    if (it == scripts.end()) return;
    luaL_unref(L, LUA_REGISTRYINDEX, it->second.functionRef);
    for (const char* tableName : {"__KOIDICE_SCRIPTS__", "__KOIDICE_ORIGINAL_CODES__"}) {
        lua_getglobal(L, tableName);
        if (lua_istable(L, -1)) {
            lua_pushnil(L);
            lua_setfield(L, -2, name.c_str());
        }
        lua_pop(L, 1);
    }
    scripts.erase(it);
}

bool LuaExtension::has(const std::string& name) const {
    return scripts.find(name) != scripts.end();
}

void LuaExtension::cleanup() {
    if (L) {
        lua_close(L);
        L = nullptr;
    }
    scripts.clear();
}

std::string LuaExtension::getLastError() const {
    return lastError;
}

void LuaExtension::pushAttrObject(const AttrObject& obj) {
    if (!obj) {
        lua_pushnil(L);
        return;
    }

    lua_newtable(L);

    // 推送字典项
    auto& dict = obj->as_dict();
    for (const auto& pair : dict) {
            lua_pushstring(L, pair.first.c_str());

            const AttrVar& val = pair.second;
            switch (val.type) {
                case AttrVar::Type::Boolean:
                    lua_pushboolean(L, val.bit);
                    break;
                case AttrVar::Type::Integer:
                    lua_pushinteger(L, val.attr);
                    break;
                case AttrVar::Type::Number:
                    lua_pushnumber(L, val.number);
                    break;
                case AttrVar::Type::U8String:
                case AttrVar::Type::GBString:
                    lua_pushstring(L, val.text.c_str());
                    break;
                case AttrVar::Type::Table:
                    pushAttrObject(val.table);
                    break;
                default:
                    lua_pushnil(L);
                    break;
            }

            lua_settable(L, -3);
    }

    // 推送数组项
    auto listPtr = obj->to_list();
    if (listPtr) {
        int idx = 1;
        for (const auto& val : *listPtr) {
            lua_pushinteger(L, idx++);

            switch (val.type) {
                case AttrVar::Type::Boolean:
                    lua_pushboolean(L, val.bit);
                    break;
                case AttrVar::Type::Integer:
                    lua_pushinteger(L, val.attr);
                    break;
                case AttrVar::Type::Number:
                    lua_pushnumber(L, val.number);
                    break;
                case AttrVar::Type::U8String:
                case AttrVar::Type::GBString:
                    lua_pushstring(L, val.text.c_str());
                    break;
                case AttrVar::Type::Table:
                    pushAttrObject(val.table);
                    break;
                default:
                    lua_pushnil(L);
                    break;
            }

            lua_settable(L, -3);
        }
    }
}

std::string LuaExtension::getResultString() {
    if (lua_isstring(L, -1)) {
        return lua_tostring(L, -1);
    } else if (lua_isboolean(L, -1)) {
        return lua_toboolean(L, -1) ? "true" : "false";
    } else if (lua_isnumber(L, -1)) {
        return std::to_string(lua_tonumber(L, -1));
    } else if (lua_isnil(L, -1)) {
        return "";
    } else {
        return "[Unsupported return type]";
    }
}

} // namespace extensions
} // namespace koidice
