#pragma once
#ifndef EXTENSION_MANAGER_H
#define EXTENSION_MANAGER_H

#include <cstring>
#include <memory>
#include <map>
#include <functional>
#include <string>
#include "../../../Dice/Dice/DiceAttrVar.h"

namespace koidice {
namespace extensions {

// 扩展类型
enum class ExtensionType {
    Lua,
    JavaScript
};

// 扩展回调函数类型
// 参数: msg context (包含 uid, gid, suffix, char, game 等)
// 返回: 回复字符串
using ExtensionCallback = std::function<std::string(const AttrObject&)>;

// Extension data is synchronously read by scripts from a snapshot populated by
// the host. Mutations update that snapshot and are appended to a write journal.

// 扩展信息
struct ExtensionInfo {
    std::string name;
    std::string version;
    std::string author;
    ExtensionType type;
    bool loaded;

    ExtensionInfo() : type(ExtensionType::Lua), loaded(false) {}
};

// 扩展管理器
class ExtensionManager {
public:
    static ExtensionManager& getInstance();

    // 加载 Lua 扩展
    // name: 扩展名称（如 "Maid.sn"）
    // code: Lua 脚本代码（包装后的）
    // originalCode: 原始 Lua 脚本代码（用于 loadLua）
    // returns: 是否成功
    bool loadLuaExtension(const std::string& name, const std::string& code, const std::string& originalCode = "");

    // 加载 JavaScript 扩展
    // name: 扩展名称（如 "Maid.team"）
    // code: JS 脚本代码
    // returns: 是否成功
    bool loadJSExtension(const std::string& name, const std::string& code);

    // 调用扩展
    // name: 扩展名称
    // context: 消息上下文（包含 msg.suffix, msg.uid, msg.gid 等）
    // returns: 扩展返回的字符串
    std::string callExtension(const std::string& name, const AttrObject& context);

    // 卸载扩展
    bool unloadExtension(const std::string& name);

    // 列出所有已加载的扩展
    std::string listExtensions();

    // 检查扩展是否存在
    bool hasExtension(const std::string& name);

    // 获取扩展信息
    ExtensionInfo getExtensionInfo(const std::string& name);

    // Reset the extension data snapshots and pending write journal.
    void clearExtensionData();

    // Populate one snapshot entry before synchronous script execution.
    void preloadUserExtensionData(const std::string& uid, const std::string& key, const std::string& value);
    void preloadGroupExtensionData(const std::string& gid, const std::string& key, const std::string& value);

    // Return pending writes as JSON and clear the journal. Each write is
    // returned at most once.
    std::string drainExtensionDataWrites();

    // Storage entry points used by the existing Lua and JavaScript APIs.
    std::string callUserDataGet(const std::string& uid, const std::string& key);
    void callUserDataSet(const std::string& uid, const std::string& key, const std::string& value);
    std::string callGroupDataGet(const std::string& gid, const std::string& key);
    void callGroupDataSet(const std::string& gid, const std::string& key, const std::string& value);

    // 清理所有扩展
    void cleanup();

    ~ExtensionManager();

private:
    ExtensionManager();
    ExtensionManager(const ExtensionManager&) = delete;
    ExtensionManager& operator=(const ExtensionManager&) = delete;

    class Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace extensions
} // namespace koidice

#endif // EXTENSION_MANAGER_H
