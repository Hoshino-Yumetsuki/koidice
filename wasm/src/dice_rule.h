#pragma once
#include <string>
#include <vector>

/**
 * 规则查询结果
 */
struct RuleQueryResult {
    bool success;
    std::string content;
    std::string error;
};

/**
 * 规则条目
 */
struct RuleEntry {
    std::string key;
    std::string value;
};

/**
 * 查询规则（支持 "system:keyword" 格式）
 */
RuleQueryResult queryRule(const std::string& query);

/**
 * 按系统查询规则
 */
RuleQueryResult queryRuleBySystem(const std::string& system, const std::string& keyword);

/**
 * 列出所有规则关键词
 */
std::vector<std::string> listRuleKeys();

/**
 * 列出指定系统的规则
 */
std::vector<std::string> listRulesBySystem(const std::string& system);
