#include "dice_character.h"
#include "dice_roll.h"
#include "../../Dice/Dice/RD.h"

std::string generateCOC7Character() {
    ensureRandomInit();
    try {
        return COC7D();
    } catch (const std::exception& e) {
        return std::string("生成失败: ") + e.what();
    } catch (...) {
        return "生成失败: 未知错误";
    }
}

std::string generateCOC6Character() {
    ensureRandomInit();
    try {
        return COC6D();
    } catch (const std::exception& e) {
        return std::string("生成失败: ") + e.what();
    } catch (...) {
        return "生成失败: 未知错误";
    }
}

std::string generateCOC7CharacterDetailed() {
    ensureRandomInit();
    try {
        return COC7D();
    } catch (const std::exception& e) {
        return std::string("生成失败: ") + e.what();
    } catch (...) {
        return "生成失败: 未知错误";
    }
}

std::string generateCOC6CharacterDetailed() {
    ensureRandomInit();
    try {
        return COC6D();
    } catch (const std::exception& e) {
        return std::string("生成失败: ") + e.what();
    } catch (...) {
        return "生成失败: 未知错误";
    }
}

std::string generateCOC7Multiple(int count) {
    ensureRandomInit();
    try {
        return COC7(count);
    } catch (const std::exception& e) {
        return std::string("生成失败: ") + e.what();
    } catch (...) {
        return "生成失败: 未知错误";
    }
}

std::string generateCOC6Multiple(int count) {
    ensureRandomInit();
    try {
        return COC6(count);
    } catch (const std::exception& e) {
        return std::string("生成失败: ") + e.what();
    } catch (...) {
        return "生成失败: 未知错误";
    }
}

std::string generateDNDCharacter(int count) {
    ensureRandomInit();
    try {
        return DND(count);
    } catch (const std::exception& e) {
        return std::string("生成失败: ") + e.what();
    } catch (...) {
        return "生成失败: 未知错误";
    }
}
