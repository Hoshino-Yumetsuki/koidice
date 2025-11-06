#include "insanity.h"
#include "../core/utils.h"
#include "../../../Dice/Dice/RDConstant.h"
#include "../../../Dice/Dice/RD.h"
#include <algorithm>

using namespace emscripten;

namespace koidice {

// 计算成功等级（COC7规则）
// 返回值: 0-大失败, 1-失败, 2-成功, 3-困难成功, 4-极难成功, 5-大成功
static int calculateSuccessLevel(int rollValue, int skillValue, int rule = 1) {
    // 大成功判定
    if (rollValue <= 5 && rollValue <= skillValue) {
        return 5; // 大成功
    }
    
    // 大失败判定
    if (rollValue == 100 || (rollValue > 95 && rollValue > skillValue)) {
        return 0; // 大失败
    }
    
    // 失败
    if (rollValue > skillValue) {
        return 1; // 失败
    }
    
    // 成功等级判定
    int hardThreshold = skillValue / 2;
    int extremeThreshold = skillValue / 5;
    
    if (rollValue <= extremeThreshold) {
        return 4; // 极难成功
    } else if (rollValue <= hardThreshold) {
        return 3; // 困难成功
    } else {
        return 2; // 成功
    }
}

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
        if (currentSan <= 0) {
            result.set("rollValue", 0);
            result.set("successLevel", 0);
            result.set("sanLoss", 0);
            result.set("lossDetail", "");
            result.set("newSan", currentSan);
            result.set("errorCode", -1);
            result.set("errorMsg", "SAN值无效，必须大于0");
            return result;
        }

        // 进行1d100检定
        RD rd("1d100", 100);
        int_errno err = rd.Roll();

        if (err != 0) {
            result.set("rollValue", 0);
            result.set("successLevel", 0);
            result.set("sanLoss", 0);
            result.set("lossDetail", "");
            result.set("newSan", currentSan);
            result.set("errorCode", err);
            result.set("errorMsg", getErrorMessage(err));
            return result;
        }

        int rollValue = rd.intTotal;

        // 计算成功等级
        int successLevel = calculateSuccessLevel(rollValue, currentSan, 1);

        // 根据成功等级计算理智损失
        int sanLoss = 0;
        std::string lossDetail;
        std::string lossExpr;

        if (successLevel == 0) {
            // 大失败 - 取失败损失的最大值
            lossExpr = failureLoss;
            RD maxLossRd(lossExpr, 100);
            maxLossRd.Max();
            sanLoss = maxLossRd.intTotal;
            lossDetail = "Max{" + failureLoss + "}=" + std::to_string(sanLoss);
        } else if (successLevel == 1) {
            // 失败 - 掷失败损失骰
            lossExpr = failureLoss;
            RD lossRd(lossExpr, 100);
            err = lossRd.Roll();
            if (err != 0) {
                result.set("rollValue", rollValue);
                result.set("successLevel", successLevel);
                result.set("sanLoss", 0);
                result.set("lossDetail", "");
                result.set("newSan", currentSan);
                result.set("errorCode", err);
                result.set("errorMsg", "损失表达式错误: " + getErrorMessage(err));
                return result;
            }
            sanLoss = lossRd.intTotal;
            lossDetail = lossRd.FormShortString();
        } else {
            // 成功 (包括困难成功、极难成功、大成功) - 掷成功损失骰
            lossExpr = successLoss;
            RD lossRd(lossExpr, 100);
            err = lossRd.Roll();
            if (err != 0) {
                result.set("rollValue", rollValue);
                result.set("successLevel", successLevel);
                result.set("sanLoss", 0);
                result.set("lossDetail", "");
                result.set("newSan", currentSan);
                result.set("errorCode", err);
                result.set("errorMsg", "损失表达式错误: " + getErrorMessage(err));
                return result;
            }
            sanLoss = lossRd.intTotal;
            lossDetail = lossRd.FormShortString();
        }

        int newSan = std::max(0, currentSan - sanLoss);

        result.set("rollValue", rollValue);
        result.set("successLevel", successLevel);
        result.set("sanLoss", sanLoss);
        result.set("lossDetail", lossDetail);
        result.set("newSan", newSan);
        result.set("errorCode", 0);
        result.set("errorMsg", "");

    } catch (const std::exception& e) {
        result.set("rollValue", 0);
        result.set("successLevel", 0);
        result.set("sanLoss", 0);
        result.set("lossDetail", "");
        result.set("newSan", currentSan);
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("rollValue", 0);
        result.set("successLevel", 0);
        result.set("sanLoss", 0);
        result.set("lossDetail", "");
        result.set("newSan", currentSan);
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

} // namespace koidice
