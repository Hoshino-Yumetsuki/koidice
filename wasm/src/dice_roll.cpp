#include "dice_roll.h"
#include "../../Dice/Dice/RD.h"
#include "../../Dice/Dice/RandomGenerator.h"
#include <emscripten/val.h>

using namespace emscripten;

// 全局随机数生成器初始化标志
static bool randomInitialized = false;

void ensureRandomInit() {
    if (!randomInitialized) {
        // WASM 环境使用默认随机数生成器
        randomInitialized = true;
    }
}

std::string getErrorMessage(int_errno err) {
    switch (err) {
        case Value_Err: return "数值错误";
        case Input_Err: return "输入错误";
        case ZeroDice_Err: return "骰子数量为0";
        case ZeroType_Err: return "骰子面数为0";
        case DiceTooBig_Err: return "骰子数量过大";
        case TypeTooBig_Err: return "骰子面数过大";
        case AddDiceVal_Err: return "加骰错误";
        case DiceCnt_Err: return "骰子计数错误";
        default: return "未知错误";
    }
}

val rollDice(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    val result = val::object();

    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Roll();

        result.set("total", rd.intTotal);
        result.set("expression", rd.strDice);
        result.set("detail", rd.FormCompleteString());
        result.set("errorCode", static_cast<int>(err));
        result.set("errorMsg", getErrorMessage(err));

    } catch (const std::exception& e) {
        result.set("total", 0);
        result.set("expression", expression);
        result.set("detail", "");
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("total", 0);
        result.set("expression", expression);
        result.set("detail", "");
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

val cocCheck(int skillValue, int bonusDice) {
    ensureRandomInit();
    val result = val::object();

    try {
        if (skillValue < 0 || skillValue > 100) {
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "技能值必须在0-100之间");
            result.set("errorCode", Input_Err);
            result.set("errorMsg", "技能值超出范围");
            return result;
        }

        RD rd("1D100", 100);
        int_errno err = rd.Roll();

        if (err != 0) {
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "掷骰失败");
            result.set("errorCode", static_cast<int>(err));
            result.set("errorMsg", getErrorMessage(err));
            return result;
        }

        int rollValue = rd.intTotal;
        int successLevel = 1; // 默认失败
        std::string description = "失败";

        // 应用奖励/惩罚骰
        if (bonusDice != 0) {
            int tensDigit = (rollValue / 10) * 10;
            int onesDigit = rollValue % 10;

            if (bonusDice > 0) {
                // 奖励骰：取最小的十位数
                for (int i = 0; i < bonusDice; i++) {
                    RD bonusRd("1D10", 10);
                    bonusRd.Roll();
                    int newTens = (bonusRd.intTotal % 10) * 10;
                    if (newTens < tensDigit) {
                        tensDigit = newTens;
                    }
                }
            } else {
                // 惩罚骰：取最大的十位数
                for (int i = 0; i < -bonusDice; i++) {
                    RD penaltyRd("1D10", 10);
                    penaltyRd.Roll();
                    int newTens = (penaltyRd.intTotal % 10) * 10;
                    if (newTens > tensDigit) {
                        tensDigit = newTens;
                    }
                }
            }

            rollValue = tensDigit + onesDigit;
        }

        // 判定成功等级
        if (rollValue <= 5 || (rollValue <= skillValue && rollValue <= 5)) {
            successLevel = 5; // 大成功
            description = "大成功";
        } else if (rollValue >= 96) {
            successLevel = 0; // 大失败
            description = "大失败";
        } else if (rollValue <= skillValue / 5) {
            successLevel = 4; // 极难成功
            description = "极难成功";
        } else if (rollValue <= skillValue / 2) {
            successLevel = 3; // 困难成功
            description = "困难成功";
        } else if (rollValue <= skillValue) {
            successLevel = 2; // 成功
            description = "成功";
        }

        result.set("rollValue", rollValue);
        result.set("skillValue", skillValue);
        result.set("successLevel", successLevel);
        result.set("description", description);
        result.set("errorCode", 0);
        result.set("errorMsg", "");

    } catch (const std::exception& e) {
        result.set("rollValue", 0);
        result.set("skillValue", skillValue);
        result.set("successLevel", 0);
        result.set("description", "异常");
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("rollValue", 0);
        result.set("skillValue", skillValue);
        result.set("successLevel", 0);
        result.set("description", "未知异常");
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

bool hiddenRoll(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Roll();
        return err == 0;
    } catch (...) {
        return false;
    }
}

int getMaxValue(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Max();
        if (err != 0) {
            return -1;
        }
        return rd.intTotal;
    } catch (...) {
        return -1;
    }
}

int getMinValue(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Min();
        if (err != 0) {
            return -1;
        }
        return rd.intTotal;
    } catch (...) {
        return -1;
    }
}
