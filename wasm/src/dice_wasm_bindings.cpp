#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "version.h"
#include "dice_roll.h"
#include "dice_character.h"
#include "dice_insanity.h"
#include "dice_initiative.h"
#include "dice_deck.h"
#include "dice_rule.h"

using namespace emscripten;

// ============ 工具函数 ============

bool initialize() {
    try {
        ensureRandomInit();
        return true;
    } catch (...) {
        return false;
    }
}

std::string getVersion() {
    return DICE_VERSION;
}

// ============ Emscripten绑定 ============

EMSCRIPTEN_BINDINGS(dice_module) {
    // 核心掷骰功能
    function("rollDice", &rollDice);
    function("cocCheck", &cocCheck);
    function("hiddenRoll", &hiddenRoll);
    function("getMaxValue", &getMaxValue);
    function("getMinValue", &getMinValue);

    // 人物作成功能
    function("generateCOC7Character", &generateCOC7Character);
    function("generateCOC6Character", &generateCOC6Character);
    function("generateDNDCharacter", &generateDNDCharacter);

    // 理智检定功能
    function("sanityCheck", &sanityCheck);

    // 疯狂症状功能
    function("getTempInsanity", &getTempInsanity);
    function("getLongInsanity", &getLongInsanity);
    function("getPhobia", &getPhobia);
    function("getMania", &getMania);

    // 先攻列表功能
    function("addInitiative", &addInitiative);
    function("rollInitiative", &rollInitiative);
    function("removeInitiative", &removeInitiative);
    function("clearInitiative", &clearInitiative);
    function("nextInitiativeTurn", &nextInitiativeTurn);
    function("getInitiativeList", &getInitiativeList);
    function("getInitiativeCount", &getInitiativeCount);
    function("serializeInitiative", &serializeInitiative);
    function("deserializeInitiative", &deserializeInitiative);

    // 牌堆功能
    function("drawFromDeck", &drawFromDeck);
    function("listDecks", &listDecks);
    function("getDeckSize", &getDeckSize);
    function("deckExists", &deckExists);

    // 规则查询功能
    function("queryRule", &queryRule);
    function("queryRuleBySystem", &queryRuleBySystem);
    function("listRuleKeys", &listRuleKeys);
    function("listRulesBySystem", &listRulesBySystem);

    // 工具函数
    function("initialize", &initialize);
    function("getVersion", &getVersion);

    // 注册结构体
    value_object<RuleQueryResult>("RuleQueryResult")
        .field("success", &RuleQueryResult::success)
        .field("content", &RuleQueryResult::content)
        .field("error", &RuleQueryResult::error);

    // 注册容器
    register_vector<std::string>("VectorString");
}
