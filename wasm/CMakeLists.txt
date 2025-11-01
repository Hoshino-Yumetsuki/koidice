cmake_minimum_required(VERSION 3.15)
project(DiceWasm)

# WASM 不支持动态库，全局禁用
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

# 设置C++标准
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Emscripten特定设置
if(EMSCRIPTEN)
    set(CMAKE_EXECUTABLE_SUFFIX ".js")

    # 添加Emscripten编译选项
    set(EMSCRIPTEN_FLAGS
        --bind
        "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']"
        "-sEXPORTED_FUNCTIONS=['_malloc','_free']"
        -sALLOW_MEMORY_GROWTH=1
        -sMODULARIZE=1
        "-sEXPORT_NAME='createDiceModule'"
        -sENVIRONMENT=web,node
        -sNO_DISABLE_EXCEPTION_CATCHING
        -sNO_EXIT_RUNTIME=1
        -sINITIAL_MEMORY=33554432
        -sERROR_ON_UNDEFINED_SYMBOLS=0
        --no-entry
    )

    # 优化选项
    if(CMAKE_BUILD_TYPE STREQUAL "Release")
        list(APPEND EMSCRIPTEN_FLAGS -O3 -flto)
    else()
        list(APPEND EMSCRIPTEN_FLAGS -O0 -g -gsource-map)
    endif()
endif()

# 包含目录
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/../Dice/Dice
    ${CMAKE_CURRENT_SOURCE_DIR}/../Dice/quickjspp
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include/yaml-cpp/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include/tinyxml2
    ${CMAKE_CURRENT_SOURCE_DIR}/include/libgit2/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include/libzip/lib
    ${CMAKE_CURRENT_SOURCE_DIR}/include/curl/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include/lua
    ${CMAKE_CURRENT_SOURCE_DIR}/include/zlib
)

# 收集核心源文件 (排除平台相关和不需要的模块)
set(DICE_CORE_SOURCES
    # 核心掷骰
    ../Dice/Dice/RD.cpp
    ../Dice/Dice/RandomGenerator.cpp
    ../Dice/Dice/DiceSession.cpp

    # 属性和变量
    ../Dice/Dice/DiceAttrVar.cpp
    ../Dice/Dice/strExtern.cpp

    # 规则系统
    ../Dice/Dice/GetRule.cpp

    # 牌堆和角色卡
    ../Dice/Dice/CardDeck.cpp
    ../Dice/Dice/CharacterCard.cpp

    # 格式化
    ../Dice/Dice/DiceFormatter.cpp
    ../Dice/Dice/MsgFormat.cpp

    # JSON处理
    ../Dice/Dice/Jsonio.cpp

    # 文件操作 (简化版)
    ../Dice/Dice/DiceFile.cpp

    # 牌堆系统
    ../Dice/Dice/CardDeck.cpp
    
    # 全局变量（包含规则数据）
    ../Dice/Dice/GlobalVar.cpp
)

# WASM接口源文件
set(WASM_SOURCES
    src/dice_wasm_bindings.cpp
    src/dice_roll.cpp
    src/dice_character.cpp
    src/dice_insanity.cpp
    src/dice_initiative.cpp
    src/dice_deck.cpp
    src/dice_rule.cpp
)

# 创建WASM库
add_executable(dice ${DICE_CORE_SOURCES} ${WASM_SOURCES})

# 设置编译定义
target_compile_definitions(dice PRIVATE
    DICE_WASM_BUILD
    CONFIG_BIGNUM
    _SILENCE_CXX17_CODECVT_HEADER_DEPRECATION_WARNING
)

# 不链接外部依赖库 - 使用 stub 文件

# 应用Emscripten标志
if(EMSCRIPTEN)
    target_link_options(dice PRIVATE ${EMSCRIPTEN_FLAGS} -Wl,--allow-undefined)
    target_compile_options(dice PRIVATE -fexceptions)

    # 设置输出路径
    set_target_properties(dice PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../lib"
        OUTPUT_NAME "dice"
    )
endif()

# 安装规则
install(TARGETS dice
    RUNTIME DESTINATION ${CMAKE_CURRENT_SOURCE_DIR}/../lib
)
