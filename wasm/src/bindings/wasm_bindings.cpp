#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "../core/command_processor.h"
#include "../core/utils.h"
#include "../features/character.h"
#include "../features/character_parser.h"
#include "../features/insanity.h"
#include "../features/initiative.h"
#include "../features/deck.h"
#include "../features/rule.h"
#include "../dice_character_parse.h"
#include "../extensions/extension_manager.h"
#include "../../../Dice/Dice/RD.h"

using namespace emscripten;
using namespace koidice;

// 导入features命名空间的函数
using koidice::generateCOC7Character;
using koidice::generateCOC6Character;
using koidice::generateCOC7CharacterDetailed;
using koidice::generateCOC6CharacterDetailed;
using koidice::generateCOC7Multiple;
using koidice::generateCOC6Multiple;
using koidice::generateDNDCharacter;
using koidice::getTempInsanity;
using koidice::getLongInsanity;
using koidice::getPhobia;
using koidice::getMania;
using koidice::sanityCheck;
using koidice::addInitiative;
using koidice::rollInitiative;
using koidice::removeInitiative;
using koidice::clearInitiative;
using koidice::nextInitiativeTurn;
using koidice::getInitiativeList;
using koidice::getInitiativeCount;
using koidice::serializeInitiative;
using koidice::deserializeInitiative;
using koidice::drawFromDeck;
using koidice::listDecks;
using koidice::getDeckSize;
using koidice::deckExists;
using koidice::shuffleDeck;
using koidice::queryRule;
using koidice::queryRuleBySystem;
using koidice::listRuleKeys;
using koidice::listRulesBySystem;

// ============ 工具函数 ============

bool initialize() {
    try {
        ensureRandomInit();
        return true;
    } catch (...) {
        return false;
    }
}

// ============ Emscripten绑定 ============

EMSCRIPTEN_BINDINGS(dice_module) {
    // === 核心命令处理 ===
    function("processRoll", &CommandProcessor::processRoll);
    function("processCheck", &CommandProcessor::processCheck);
    function("processCOCCheck", &CommandProcessor::processCOCCheck);

    // === 基础掷骰 ===
    function("rollDice", &rollDice);
    function("cocCheck", &cocCheck);
    function("skillCheck", &skillCheck);
    function("hiddenRoll", &hiddenRoll);
    function("getMaxValue", &getMaxValue);
    function("getMinValue", &getMinValue);

    // === 角色生成 ===
    function("generateCOC7Character", &generateCOC7Character);
    function("generateCOC6Character", &generateCOC6Character);
    function("generateCOC7CharacterDetailed", &generateCOC7CharacterDetailed);
    function("generateCOC6CharacterDetailed", &generateCOC6CharacterDetailed);
    function("generateCOC7Multiple", &generateCOC7Multiple);
    function("generateCOC6Multiple", &generateCOC6Multiple);
    function("generateDNDCharacter", &generateDNDCharacter);

    // === 理智检定 ===
    function("sanityCheck", &sanityCheck);
    function("getTempInsanity", &getTempInsanity);
    function("getLongInsanity", &getLongInsanity);
    function("getPhobia", &getPhobia);
    function("getMania", &getMania);

    // === 先攻系统 ===
    function("addInitiative", &addInitiative);
    function("rollInitiative", &rollInitiative);
    function("removeInitiative", &removeInitiative);
    function("clearInitiative", &clearInitiative);
    function("nextInitiativeTurn", &nextInitiativeTurn);
    function("getInitiativeList", &getInitiativeList);
    function("getInitiativeCount", &getInitiativeCount);
    function("serializeInitiative", &serializeInitiative);
    function("deserializeInitiative", &deserializeInitiative);

    // === 牌堆系统 ===
    function("drawFromDeck", &drawFromDeck);
    function("shuffleDeck", &shuffleDeck);
    function("listDecks", &listDecks);
    function("getDeckSize", &getDeckSize);
    function("deckExists", &deckExists);

    // === 规则查询 ===
    function("queryRule", &queryRule);
    function("queryRuleBySystem", &queryRuleBySystem);
    function("listRuleKeys", &listRuleKeys);
    function("listRulesBySystem", &listRulesBySystem);

    // === 人物卡解析 ===
    function("parseCOCAttributes", &parseCOCAttributes);
    function("normalizeAttributeName", &normalizeAttributeName);
    function("parseStCommand", &parseStCommand);
    function("parseAttributeList", &parseAttributeList);

    // === 工具函数 ===
    function("initialize", &initialize);

    // === 扩展系统 ===
    // 加载扩展
    function("loadLuaExtension", optional_override([](const std::string& name, const std::string& code, const std::string& originalCode) {
        return extensions::ExtensionManager::getInstance().loadLuaExtension(name, code, originalCode);
    }));

    function("loadJSExtension", optional_override([](const std::string& name, const std::string& code) {
        return extensions::ExtensionManager::getInstance().loadJSExtension(name, code);
    }));

    // 辅助函数：递归转换 JS 值到 AttrVar
    auto convertJSValueToAttrVar = [](const val& value, auto& self) -> AttrVar {
        if (value.isUndefined() || value.isNull()) {
            return AttrVar();
        } else if (value.isString()) {
            return AttrVar(value.as<std::string>());
        } else if (value.isNumber()) {
            double num = value.as<double>();
            if (num == (int)num) {
                return AttrVar((int)num);
            } else {
                return AttrVar(num);
            }
        } else if (value.isTrue() || value.isFalse()) {
            return AttrVar(value.as<bool>());
        } else if (value.instanceof(val::global("Array"))) {
            // 处理数组 - 创建 VarArray 来正确初始化 AnysTable 的 list 成员
            int length = value["length"].as<int>();
            VarArray varArray;
            for (int i = 0; i < length; i++) {
                varArray.push_back(self(value[i], self));
            }
            AttrObject arr = std::make_shared<AnysTable>(varArray);
            return AttrVar(arr);
        } else {
            // 递归处理嵌套对象
            std::string typeStr = value["constructor"]["name"].as<std::string>();
            if (typeStr == "Object" || typeStr == "Array") {
                AttrObject obj = std::make_shared<AnysTable>();
                val keys = val::global("Object").call<val>("keys", value);
                int length = keys["length"].as<int>();
                for (int i = 0; i < length; i++) {
                    std::string key = keys[i].as<std::string>();
                    obj->set(key, self(value[key], self));
                }
                return AttrVar(obj);
            }
        }
        return AttrVar();
    };

    // 调用扩展 - 接收 JavaScript 对象作为 context
    function("callExtension", +[](const std::string& name, const val& jsContext) -> std::string {
        // 递归转换函数（内联）
        std::function<AttrVar(const val&)> convertValue = [&convertValue](const val& value) -> AttrVar {
            if (value.isUndefined() || value.isNull()) {
                return AttrVar();
            } else if (value.isString()) {
                return AttrVar(value.as<std::string>());
            } else if (value.isNumber()) {
                double num = value.as<double>();
                if (num == (int)num) {
                    return AttrVar((int)num);
                } else {
                    return AttrVar(num);
                }
            } else if (value.isTrue() || value.isFalse()) {
                return AttrVar(value.as<bool>());
            } else if (value.instanceof(val::global("Array"))) {
                int length = value["length"].as<int>();
                // 创建一个 VarArray 来存储数组元素
                VarArray varArray;
                for (int i = 0; i < length; i++) {
                    varArray.push_back(convertValue(value[i]));
                }
                // 使用 VarArray 构造 AnysTable
                AttrObject arr = std::make_shared<AnysTable>(varArray);
                return AttrVar(arr);
            } else {
                AttrObject obj = std::make_shared<AnysTable>();
                val keys = val::global("Object").call<val>("keys", value);
                int length = keys["length"].as<int>();
                for (int i = 0; i < length; i++) {
                    std::string key = keys[i].as<std::string>();
                    obj->set(key, convertValue(value[key]));
                }
                return AttrVar(obj);
            }
        };
        // 将 JavaScript 对象转换为 AttrObject
        AttrObject context = std::make_shared<AnysTable>();

        // 遍历 JS 对象的属性
        val keys = val::global("Object").call<val>("keys", jsContext);
        int length = keys["length"].as<int>();

        for (int i = 0; i < length; i++) {
            std::string key = keys[i].as<std::string>();
            val value = jsContext[key];

            // 使用递归转换函数
            context->set(key, convertValue(value));
        }

        return extensions::ExtensionManager::getInstance().callExtension(name, context);
    });

    // 卸载扩展
    function("unloadExtension", optional_override([](const std::string& name) {
        return extensions::ExtensionManager::getInstance().unloadExtension(name);
    }));

    // 列出所有扩展
    function("listExtensions", optional_override([]() {
        return extensions::ExtensionManager::getInstance().listExtensions();
    }));

    // 检查扩展是否存在
    function("hasExtension", optional_override([](const std::string& name) {
        return extensions::ExtensionManager::getInstance().hasExtension(name);
    }));

    // === 注册容器 ===
    register_vector<std::string>("VectorString");
}
