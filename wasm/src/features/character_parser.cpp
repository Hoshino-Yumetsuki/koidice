#include "character_parser.h"
#include "../core/utils.h"
#include <regex>
#include <unordered_map>
#include <algorithm>
#include <cctype>
#include <emscripten/val.h>

namespace koidice {

// 属性名称同义词映射（全小写）
static const std::unordered_map<std::string, std::string> ATTRIBUTE_ALIASES = {
    // COC7 属性
    {"str", "力量"},
    {"力量", "力量"},
    {"strength", "力量"},
    {"con", "体质"},
    {"体质", "体质"},
    {"constitution", "体质"},
    {"siz", "体型"},
    {"体型", "体型"},
    {"size", "体型"},
    {"dex", "敏捷"},
    {"敏捷", "敏捷"},
    {"dexterity", "敏捷"},
    {"app", "外貌"},
    {"外貌", "外貌"},
    {"appearance", "外貌"},
    {"int", "智力"},
    {"智力", "智力"},
    {"intelligence", "智力"},
    {"pow", "意志"},
    {"意志", "意志"},
    {"power", "意志"},
    {"edu", "教育"},
    {"教育", "教育"},
    {"education", "教育"},
    {"luck", "幸运"},
    {"幸运", "幸运"},
    {"luk", "幸运"},
    {"san", "理智"},
    {"理智", "理智"},
    {"sanity", "理智"},
    {"hp", "生命"},
    {"生命", "生命"},
    {"生命值", "生命"},
    {"mp", "魔法"},
    {"魔法", "魔法"},
    {"魔法值", "魔法"},
    {"db", "伤害加值"},
    {"伤害加值", "伤害加值"},
    {"伤害奖励", "伤害加值"},
    {"mov", "移动力"},
    {"移动力", "移动力"},
    {"move", "移动力"}
};

std::string normalizeAttributeName(const std::string& name) {
    std::string lower = name;
    std::transform(lower.begin(), lower.end(), lower.begin(), 
                   [](unsigned char c) { return std::tolower(c); });
    
    // 去除空格
    lower.erase(std::remove_if(lower.begin(), lower.end(), ::isspace), lower.end());
    
    auto it = ATTRIBUTE_ALIASES.find(lower);
    if (it != ATTRIBUTE_ALIASES.end()) {
        return it->second;
    }
    return name;
}

emscripten::val parseStCommand(const std::string& input) {
    std::string text = trim(input);
    std::string cardName;
    std::vector<AttributeOperation> operations;
    
    // 解析人物卡名称（格式：名称--属性 值）
    std::regex cardRegex(R"(^(.+?)--(.+)$)");
    std::smatch match;
    
    if (std::regex_match(text, match, cardRegex)) {
        cardName = trim(match[1].str());
        text = trim(match[2].str());
    }
    
    // 按空格分割
    std::vector<std::string> parts;
    std::istringstream iss(text);
    std::string part;
    while (iss >> part) {
        if (!part.empty()) {
            parts.push_back(part);
        }
    }
    
    // 简单的"属性名 值"配对解析
    for (size_t i = 0; i + 1 < parts.size(); i += 2) {
        const std::string& attrName = parts[i];
        const std::string& valueStr = parts[i + 1];
        
        // 验证属性名：只接受纯中文、英文或数字字母组合
        // 使用简单的ASCII检查和UTF-8中文检查
        bool isValidAttrName = true;
        bool hasAlpha = false;
        
        for (unsigned char c : attrName) {
            if (c >= 0x80) {
                // 可能是UTF-8多字节字符（中文）
                continue;
            } else if (std::isalpha(c)) {
                hasAlpha = true;
            } else if (!std::isspace(c)) {
                // 既不是字母也不是UTF-8字符
                isValidAttrName = false;
                break;
            }
        }
        
        if (!isValidAttrName || attrName.empty()) {
            continue;
        }
        
        // 解析数值
        try {
            int value = std::stoi(valueStr);
            operations.push_back({
                normalizeAttributeName(attrName),
                "set",
                value
            });
        } catch (...) {
            // 忽略无效数值
            continue;
        }
    }
    
    // 转换为 JS 对象
    emscripten::val result = emscripten::val::object();
    
    if (!cardName.empty()) {
        result.set("cardName", cardName);
    }
    
    emscripten::val jsOperations = emscripten::val::array();
    for (size_t i = 0; i < operations.size(); ++i) {
        emscripten::val op = emscripten::val::object();
        op.set("attr", operations[i].attr);
        op.set("op", operations[i].op);
        op.set("value", operations[i].value);
        jsOperations.set(i, op);
    }
    result.set("operations", jsOperations);
    
    return result;
}

emscripten::val parseAttributeList(const std::string& input) {
    std::string text = trim(input);
    std::string cardName;
    std::vector<std::string> attributes;
    
    // 解析人物卡名称（格式：名称--属性1 属性2）
    std::regex cardRegex(R"(^(.+?)--(.+)$)");
    std::smatch match;
    
    if (std::regex_match(text, match, cardRegex)) {
        cardName = trim(match[1].str());
        text = trim(match[2].str());
    }
    
    // 分割属性名
    std::istringstream iss(text);
    std::string attr;
    while (iss >> attr) {
        if (!attr.empty()) {
            attributes.push_back(normalizeAttributeName(attr));
        }
    }
    
    // 转换为 JS 对象
    emscripten::val result = emscripten::val::object();
    
    if (!cardName.empty()) {
        result.set("cardName", cardName);
    }
    
    emscripten::val jsAttributes = emscripten::val::array();
    for (size_t i = 0; i < attributes.size(); ++i) {
        jsAttributes.set(i, attributes[i]);
    }
    result.set("attributes", jsAttributes);
    
    return result;
}

} // namespace koidice
