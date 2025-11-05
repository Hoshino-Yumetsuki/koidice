#include "dice_deck.h"
#include "dice_roll.h"
#include "../../Dice/Dice/CardDeck.h"
#include <sstream>

using namespace emscripten;

val drawFromDeck(const std::string& deckName, int count) {
    ensureRandomInit();
    val result = val::object();

    try {
        if (count < 1 || count > 10) {
            result.set("success", false);
            result.set("message", "抽取数量必须在1-10之间");
            result.set("cards", val::array());
            return result;
        }

        // 检查牌堆是否存在
        if (CardDeck::mPublicDeck.count(deckName) == 0 && 
            CardDeck::mExternPublicDeck.count(deckName) == 0) {
            result.set("success", false);
            result.set("message", "牌堆 " + deckName + " 不存在");
            result.set("cards", val::array());
            return result;
        }

        std::vector<std::string> cards;

        for (int i = 0; i < count; i++) {
            // 使用 {牌堆名} 格式调用 draw 函数
            std::string expression = "{" + deckName + "}";
            std::string card = CardDeck::draw(expression);
            
            // 如果返回的还是原表达式，说明抽取失败
            if (card == expression || card.empty()) {
                result.set("success", false);
                result.set("message", "从牌堆 " + deckName + " 抽取失败");
                result.set("cards", val::array());
                return result;
            }
            cards.push_back(card);
        }

        // 转换为 JavaScript 数组
        val jsCards = val::array();
        for (size_t i = 0; i < cards.size(); i++) {
            jsCards.set(i, cards[i]);
        }

        result.set("success", true);
        result.set("message", "");
        result.set("cards", jsCards);

    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("message", std::string("异常: ") + e.what());
        result.set("cards", val::array());
    } catch (...) {
        result.set("success", false);
        result.set("message", "未知异常");
        result.set("cards", val::array());
    }

    return result;
}

std::string listDecks() {
    try {
        std::ostringstream oss;
        oss << "=== 可用牌堆 ===" << std::endl;

        // 列出公共牌堆
        bool hasDecks = false;
        for (const auto& [name, deck] : CardDeck::mPublicDeck) {
            oss << "- " << name << " (" << deck.size() << "张)" << std::endl;
            hasDecks = true;
        }

        // 列出扩展牌堆
        for (const auto& [name, deck] : CardDeck::mExternPublicDeck) {
            oss << "- " << name << " [扩展] (" << deck.size() << "张)" << std::endl;
            hasDecks = true;
        }

        if (!hasDecks) {
            return "没有可用的牌堆";
        }

        return oss.str();
    } catch (...) {
        return "获取牌堆列表失败";
    }
}

int getDeckSize(const std::string& deckName) {
    try {
        // 查找公共牌堆
        if (CardDeck::mPublicDeck.count(deckName)) {
            return static_cast<int>(CardDeck::mPublicDeck[deckName].size());
        }

        // 查找扩展牌堆
        if (CardDeck::mExternPublicDeck.count(deckName)) {
            return static_cast<int>(CardDeck::mExternPublicDeck[deckName].size());
        }

        return -1; // 牌堆不存在
    } catch (...) {
        return -1;
    }
}

bool deckExists(const std::string& deckName) {
    return CardDeck::findDeck(deckName) >= 0;
}
