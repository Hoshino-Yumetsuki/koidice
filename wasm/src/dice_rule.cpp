#include "dice_rule.h"
#include "../../Dice/Dice/GlobalVar.h"
#include <algorithm>

/**
 * 从 GlobalVar 的 GlobalMsg 中查询规则
 */
RuleQueryResult queryRule(const std::string& query) {
    RuleQueryResult result;
    result.success = false;

    try {
        // 解析查询字符串
        std::string system;
        std::string keyword = query;

        size_t colonPos = query.find(':');
        if (colonPos != std::string::npos) {
            system = query.substr(0, colonPos);
            keyword = query.substr(colonPos + 1);

            // 转换为小写
            std::transform(system.begin(), system.end(), system.begin(), ::tolower);
        }

        // 转换关键词为小写进行匹配
        std::string keyLower = keyword;
        std::transform(keyLower.begin(), keyLower.end(), keyLower.begin(), ::tolower);

        // 在 GlobalMsg 中查找
        for (const auto& [key, value] : GlobalMsg) {
            std::string msgKey = key;
            std::transform(msgKey.begin(), msgKey.end(), msgKey.begin(), ::tolower);

            if (msgKey == keyLower || msgKey.find(keyLower) != std::string::npos) {
                result.success = true;
                result.content = value;
                return result;
            }
        }

        result.error = "未找到规则: " + keyword;
    } catch (const std::exception& e) {
        result.error = std::string("查询异常: ") + e.what();
    } catch (...) {
        result.error = "未知异常";
    }

    return result;
}

/**
 * 按系统查询规则
 */
RuleQueryResult queryRuleBySystem(const std::string& system, const std::string& keyword) {
    return queryRule(system + ":" + keyword);
}

/**
 * 列出所有规则关键词
 */
std::vector<std::string> listRuleKeys() {
    std::vector<std::string> keys;

    for (const auto& [key, value] : GlobalMsg) {
        // 过滤掉一些非规则的消息
        if (key.find("str") == 0) continue;  // 跳过 strXxx 开头的系统消息
        keys.push_back(key);
    }

    return keys;
}

/**
 * 列出指定系统的规则
 */
std::vector<std::string> listRulesBySystem(const std::string& system) {
    std::vector<std::string> keys;
    std::string sysLower = system;
    std::transform(sysLower.begin(), sysLower.end(), sysLower.begin(), ::tolower);

    for (const auto& [key, value] : GlobalMsg) {
        std::string keyLower = key;
        std::transform(keyLower.begin(), keyLower.end(), keyLower.begin(), ::tolower);

        // 简单的系统匹配逻辑
        if (sysLower == "coc" && (keyLower.find("coc") != std::string::npos || 
                                   keyLower.find("检定") != std::string::npos ||
                                   keyLower.find("疯狂") != std::string::npos)) {
            keys.push_back(key);
        } else if (sysLower == "dnd" && keyLower.find("dnd") != std::string::npos) {
            keys.push_back(key);
        }
    }

    return keys;
}
