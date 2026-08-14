#include "extension_manager.h"
#include "lua_support.h"
#include "js_support.h"
#include <sstream>
#include <vector>

namespace koidice {
namespace extensions {

namespace {

void appendJsonString(std::string& result, const std::string& value) {
    static const char hex[] = "0123456789abcdef";
    result.push_back('"');
    for (unsigned char ch : value) {
        switch (ch) {
            case '"': result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\b': result += "\\b"; break;
            case '\f': result += "\\f"; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default:
                if (ch < 0x20) {
                    result += "\\u00";
                    result.push_back(hex[ch >> 4]);
                    result.push_back(hex[ch & 0x0f]);
                } else {
                    result.push_back(static_cast<char>(ch));
                }
        }
    }
    result.push_back('"');
}

struct DataWrite {
    const char* scope;
    std::string id;
    std::string key;
    std::string value;
};

using DataSnapshot = std::map<std::string, std::map<std::string, std::string>>;

std::string snapshotGet(const DataSnapshot& snapshot, const std::string& id, const std::string& key) {
    const auto idIt = snapshot.find(id);
    if (idIt == snapshot.end()) return "";
    const auto valueIt = idIt->second.find(key);
    return valueIt == idIt->second.end() ? "" : valueIt->second;
}

} // namespace
// Pimpl 实现
class ExtensionManager::Impl {
public:
    std::unique_ptr<LuaExtension> luaExt;
    std::unique_ptr<JSExtension> jsExt;
    std::map<std::string, ExtensionInfo> extensions;

    DataSnapshot userData;
    DataSnapshot groupData;
    std::vector<DataWrite> dataWrites;

    Impl() {
        luaExt = std::make_unique<LuaExtension>();
        jsExt = std::make_unique<JSExtension>();
    }
};

ExtensionManager::ExtensionManager() : pImpl(std::make_unique<Impl>()) {}

ExtensionManager::~ExtensionManager() = default;

ExtensionManager& ExtensionManager::getInstance() {
    static ExtensionManager instance;
    return instance;
}

bool ExtensionManager::loadLuaExtension(const std::string& name, const std::string& code, const std::string& originalCode) {
    if (!pImpl->luaExt->loadScript(name, code, originalCode)) {
        return false;
    }

    ExtensionInfo info;
    info.name = name;
    info.type = ExtensionType::Lua;
    info.loaded = true;
    pImpl->extensions[name] = info;

    return true;
}

bool ExtensionManager::loadJSExtension(const std::string& name, const std::string& code) {
    if (!pImpl->jsExt->loadScript(name, code)) {
        return false;
    }

    ExtensionInfo info;
    info.name = name;
    info.type = ExtensionType::JavaScript;
    info.loaded = true;
    pImpl->extensions[name] = info;

    return true;
}

std::string ExtensionManager::callExtension(const std::string& name, const AttrObject& context) {
    auto it = pImpl->extensions.find(name);
    if (it == pImpl->extensions.end()) {
        return "[Error] Extension '" + name + "' not found";
    }

    const ExtensionInfo& info = it->second;

    try {
        if (info.type == ExtensionType::Lua) {
            return pImpl->luaExt->execute(name, context);
        } else {
            return pImpl->jsExt->execute(name, context);
        }
    } catch (const std::exception& e) {
        return std::string("[Error] ") + e.what();
    }
}

bool ExtensionManager::unloadExtension(const std::string& name) {
    auto it = pImpl->extensions.find(name);
    if (it == pImpl->extensions.end()) {
        return false;
    }

    const ExtensionInfo& info = it->second;

    if (info.type == ExtensionType::Lua) {
        pImpl->luaExt->unload(name);
    } else {
        pImpl->jsExt->unload(name);
    }

    pImpl->extensions.erase(it);
    return true;
}

std::string ExtensionManager::listExtensions() {
    if (pImpl->extensions.empty()) {
        return "No extensions loaded.";
    }

    std::ostringstream oss;
    oss << "Loaded extensions (" << pImpl->extensions.size() << "):\n";

    for (const auto& pair : pImpl->extensions) {
        const ExtensionInfo& info = pair.second;
        oss << "  - " << info.name;
        oss << " [" << (info.type == ExtensionType::Lua ? "Lua" : "JS") << "]";
        if (!info.version.empty()) {
            oss << " v" << info.version;
        }
        oss << "\n";
    }

    return oss.str();
}

bool ExtensionManager::hasExtension(const std::string& name) {
    return pImpl->extensions.find(name) != pImpl->extensions.end();
}

ExtensionInfo ExtensionManager::getExtensionInfo(const std::string& name) {
    auto it = pImpl->extensions.find(name);
    if (it != pImpl->extensions.end()) {
        return it->second;
    }
    return ExtensionInfo();
}

// ============ Extension data snapshot/write journal ============

void ExtensionManager::clearExtensionData() {
    pImpl->userData.clear();
    pImpl->groupData.clear();
    pImpl->dataWrites.clear();
}

void ExtensionManager::preloadUserExtensionData(const std::string& uid, const std::string& key, const std::string& value) {
    pImpl->userData[uid][key] = value;
}

void ExtensionManager::preloadGroupExtensionData(const std::string& gid, const std::string& key, const std::string& value) {
    pImpl->groupData[gid][key] = value;
}

std::string ExtensionManager::drainExtensionDataWrites() {
    std::string result = "[";
    bool first = true;
    for (const auto& write : pImpl->dataWrites) {
        if (!first) result.push_back(',');
        first = false;
        result += "{\"scope\":";
        appendJsonString(result, write.scope);
        result += ",\"id\":";
        appendJsonString(result, write.id);
        result += ",\"key\":";
        appendJsonString(result, write.key);
        result += ",\"value\":";
        appendJsonString(result, write.value);
        result.push_back('}');
    }
    result.push_back(']');
    pImpl->dataWrites.clear();
    return result;
}

std::string ExtensionManager::callUserDataGet(const std::string& uid, const std::string& key) {
    return snapshotGet(pImpl->userData, uid, key);
}

void ExtensionManager::callUserDataSet(const std::string& uid, const std::string& key, const std::string& value) {
    pImpl->userData[uid][key] = value;
    pImpl->dataWrites.push_back({"user", uid, key, value});
}

std::string ExtensionManager::callGroupDataGet(const std::string& gid, const std::string& key) {
    return snapshotGet(pImpl->groupData, gid, key);
}

void ExtensionManager::callGroupDataSet(const std::string& gid, const std::string& key, const std::string& value) {
    pImpl->groupData[gid][key] = value;
    pImpl->dataWrites.push_back({"group", gid, key, value});
}

void ExtensionManager::cleanup() {
    if (pImpl) {
        pImpl->luaExt = std::make_unique<LuaExtension>();
        pImpl->jsExt = std::make_unique<JSExtension>();
        pImpl->extensions.clear();
        clearExtensionData();
    }
}

} // namespace extensions
} // namespace koidice
