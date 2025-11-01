#include "dice_initiative.h"
#include "dice_roll.h"
#include "../../Dice/Dice/RD.h"
#include "../../Dice/Dice/Jsonio.h"
#include <algorithm>
#include <sstream>

using namespace emscripten;

// 全局先攻列表存储（按频道ID）
static std::map<std::string, InitiativeList> initiativeLists;

InitiativeList* getInitiativeListInternal(const std::string& channelId) {
    auto it = initiativeLists.find(channelId);
    if (it != initiativeLists.end()) {
        return &it->second;
    }
    return nullptr;
}

InitiativeList* createInitiativeList(const std::string& channelId) {
    InitiativeList list;
    list.currentRound = 1;
    list.currentIndex = 0;
    initiativeLists[channelId] = list;
    return &initiativeLists[channelId];
}

val addInitiative(const std::string& channelId, const std::string& name, int initiative) {
    val result = val::object();

    try {
        InitiativeList* list = getInitiativeListInternal(channelId);
        if (!list) {
            list = createInitiativeList(channelId);
        }

        // 创建条目
        InitiativeEntry entry;
        entry.name = name;
        entry.initiative = initiative;

        // 添加到列表
        list->entries.push_back(entry);

        // 按先攻值降序排序
        std::sort(list->entries.begin(), list->entries.end(),
                 [](const InitiativeEntry& a, const InitiativeEntry& b) {
                     return a.initiative > b.initiative;
                 });

        result.set("success", true);
        result.set("message", "添加成功");

    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("message", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("success", false);
        result.set("message", "未知异常");
    }

    return result;
}

val rollInitiative(const std::string& channelId, const std::string& name, int modifier) {
    ensureRandomInit();
    val result = val::object();

    try {
        // 构建掷骰表达式
        std::string expression = "1d20";
        if (modifier != 0) {
            expression += (modifier > 0 ? "+" : "") + std::to_string(modifier);
        }

        // 掷骰
        RD rd(expression, 20);
        int_errno err = rd.Roll();

        if (err != 0) {
            result.set("success", false);
            result.set("message", getErrorMessage(err));
            result.set("initiative", 0);
            return result;
        }

        int initValue = rd.intTotal;

        // 添加到先攻列表
        val addResult = addInitiative(channelId, name, initValue);

        result.set("success", true);
        result.set("initiative", initValue);
        result.set("detail", rd.FormCompleteString());

    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("message", std::string("异常: ") + e.what());
        result.set("initiative", 0);
    } catch (...) {
        result.set("success", false);
        result.set("message", "未知异常");
        result.set("initiative", 0);
    }

    return result;
}

bool removeInitiative(const std::string& channelId, const std::string& name) {
    InitiativeList* list = getInitiativeListInternal(channelId);
    if (!list) {
        return false;
    }

    size_t beforeSize = list->entries.size();

    list->entries.erase(
        std::remove_if(list->entries.begin(), list->entries.end(),
                      [&name](const InitiativeEntry& e) { return e.name == name; }),
        list->entries.end()
    );

    // 调整当前索引
    if (list->currentIndex >= static_cast<int>(list->entries.size())) {
        list->currentIndex = 0;
    }

    return list->entries.size() < beforeSize;
}

bool clearInitiative(const std::string& channelId) {
    auto it = initiativeLists.find(channelId);
    if (it != initiativeLists.end()) {
        initiativeLists.erase(it);
        return true;
    }
    return false;
}

val nextInitiativeTurn(const std::string& channelId) {
    val result = val::object();

    InitiativeList* list = getInitiativeListInternal(channelId);
    if (!list || list->entries.empty()) {
        result.set("success", false);
        result.set("message", "先攻列表为空");
        return result;
    }

    list->currentIndex++;

    // 如果到达列表末尾，进入下一轮
    if (list->currentIndex >= static_cast<int>(list->entries.size())) {
        list->currentIndex = 0;
        list->currentRound++;
    }

    // 获取当前行动者
    const InitiativeEntry& current = list->entries[list->currentIndex];

    result.set("success", true);
    result.set("currentName", current.name);
    result.set("currentInitiative", current.initiative);
    result.set("currentRound", list->currentRound);

    return result;
}

std::string getInitiativeList(const std::string& channelId) {
    InitiativeList* list = getInitiativeListInternal(channelId);
    if (!list || list->entries.empty()) {
        return "先攻列表为空";
    }

    std::ostringstream oss;
    oss << "=== 先攻列表 (第" << list->currentRound << "轮) ===" << std::endl;

    for (size_t i = 0; i < list->entries.size(); i++) {
        const InitiativeEntry& entry = list->entries[i];
        std::string marker = (static_cast<int>(i) == list->currentIndex) ? "→" : " ";
        oss << marker << " " << (i + 1) << ". " << entry.name << ": " << entry.initiative << std::endl;
    }

    return oss.str();
}

int getInitiativeCount(const std::string& channelId) {
    InitiativeList* list = getInitiativeListInternal(channelId);
    if (!list) {
        return 0;
    }
    return static_cast<int>(list->entries.size());
}

std::string serializeInitiative(const std::string& channelId) {
    InitiativeList* list = getInitiativeListInternal(channelId);
    if (!list) {
        return "{}";
    }

    try {
        nlohmann::json j;
        j["currentRound"] = list->currentRound;
        j["currentIndex"] = list->currentIndex;
        j["entries"] = nlohmann::json::array();

        for (const auto& entry : list->entries) {
            nlohmann::json entryJson;
            entryJson["name"] = entry.name;
            entryJson["initiative"] = entry.initiative;
            j["entries"].push_back(entryJson);
        }

        return j.dump();
    } catch (...) {
        return "{}";
    }
}

bool deserializeInitiative(const std::string& channelId, const std::string& jsonStr) {
    try {
        nlohmann::json j = nlohmann::json::parse(jsonStr);

        InitiativeList list;
        list.currentRound = j.value("currentRound", 1);
        list.currentIndex = j.value("currentIndex", 0);

        if (j.contains("entries") && j["entries"].is_array()) {
            for (const auto& entryJson : j["entries"]) {
                InitiativeEntry entry;
                entry.name = entryJson.value("name", "");
                entry.initiative = entryJson.value("initiative", 0);
                list.entries.push_back(entry);
            }
        }

        initiativeLists[channelId] = list;
        return true;
    } catch (...) {
        return false;
    }
}
