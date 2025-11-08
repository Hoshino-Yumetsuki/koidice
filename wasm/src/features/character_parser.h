#pragma once
#include <string>
#include <vector>
#include <emscripten/val.h>

namespace koidice {

/**
 * 属性操作结构
 */
struct AttributeOperation {
    std::string attr;
    std::string op;  // "set", "add", "sub"
    int value;
};

/**
 * 解析后的 .st 命令结果
 */
struct ParsedStCommand {
    std::string cardName;  // 空字符串表示未指定
    std::vector<AttributeOperation> operations;
};

/**
 * 规范化属性名称
 * 将各种同义词转换为标准名称（中文）
 */
std::string normalizeAttributeName(const std::string& name);

/**
 * 解析 .st 命令参数
 * 支持格式：
 * - 力量 60 敏捷 70
 * - Alice--力量 60 敏捷 70
 * 
 * @param input 输入字符串
 * @return JS对象 { cardName?: string, operations: Array<{attr, op, value}> }
 */
emscripten::val parseStCommand(const std::string& input);

/**
 * 解析属性名列表（用于 show 和 del 命令）
 * 支持格式：
 * - 力量 敏捷
 * - Alice--力量 敏捷
 * - all
 * 
 * @param input 输入字符串
 * @return JS对象 { cardName?: string, attributes: Array<string> }
 */
emscripten::val parseAttributeList(const std::string& input);

} // namespace koidice
