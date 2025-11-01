#include "dice_insanity.h"
#include "dice_roll.h"
#include "../../Dice/Dice/RDConstant.h"
#include "../../Dice/Dice/RD.h"
#include <emscripten/val.h>
#include <algorithm>

using namespace emscripten;

std::string getTempInsanity(int index) {
    if (index < 1 || index > 10) {
        return "索引超出范围";
    }
    return TempInsanity[index];
}

std::string getLongInsanity(int index) {
    if (index < 1 || index > 10) {
        return "索引超出范围";
    }
    return LongInsanity[index];
}

std::string getPhobia(int index) {
    if (index < 1 || index > 93) {
        return "未知恐惧症";
    }
    return strFear[index];
}

std::string getMania(int index) {
    if (index < 1 || index > 96) {
        return "未知躁狂症";
    }
    return strPanic[index];
}

val sanityCheck(int currentSan, const std::string& successLoss, const std::string& failureLoss) {
    ensureRandomInit();
    val result = val::object();

    try {
        if (currentSan < 0 || currentSan > 99) {
            result.set("success", false);
            result.set("rollValue", 0);
            result.set("sanLoss", 0);
            result.set("newSan", currentSan);
            result.set("errorMsg", "理智值必须在0-99之间");
            return result;
        }

        // 进行1d100检定
        RD rd("1d100", 100);
        int_errno err = rd.Roll();

        if (err != 0) {
            result.set("success", false);
            result.set("rollValue", 0);
            result.set("sanLoss", 0);
            result.set("newSan", currentSan);
            result.set("errorMsg", getErrorMessage(err));
            return result;
        }

        int rollValue = rd.intTotal;
        bool success = rollValue <= currentSan;

        // 计算理智损失
        std::string lossExpr = success ? successLoss : failureLoss;
        RD lossRd(lossExpr, 100);
        err = lossRd.Roll();

        if (err != 0) {
            result.set("success", success);
            result.set("rollValue", rollValue);
            result.set("sanLoss", 0);
            result.set("newSan", currentSan);
            result.set("errorMsg", "损失表达式错误: " + getErrorMessage(err));
            return result;
        }

        int sanLoss = lossRd.intTotal;

        // 大失败时损失最大值
        if (rollValue >= 96) {
            RD maxLossRd(lossExpr, 100);
            maxLossRd.Max();
            sanLoss = maxLossRd.intTotal;
        }

        int newSan = std::max(0, currentSan - sanLoss);

        result.set("success", success);
        result.set("rollValue", rollValue);
        result.set("sanLoss", sanLoss);
        result.set("newSan", newSan);
        result.set("errorMsg", "");

    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("rollValue", 0);
        result.set("sanLoss", 0);
        result.set("newSan", currentSan);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("success", false);
        result.set("rollValue", 0);
        result.set("sanLoss", 0);
        result.set("newSan", currentSan);
        result.set("errorMsg", "未知异常");
    }

    return result;
}
