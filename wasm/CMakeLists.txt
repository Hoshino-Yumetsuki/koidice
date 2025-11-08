cmake_minimum_required(VERSION 3.15)
project(DiceWasm)

# Set CMake policies
if(POLICY CMP0177)
    cmake_policy(SET CMP0177 NEW)
endif()

# WASM does not support shared libraries, disable globally
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ============================================
# Version Generation: Read from package.json
# ============================================
set(PACKAGE_JSON_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../package.json")
set(VERSION_HEADER_IN "${CMAKE_CURRENT_SOURCE_DIR}/src/version.h.in")
set(VERSION_HEADER_OUT "${CMAKE_CURRENT_SOURCE_DIR}/src/version.h")

# Read package.json and extract version
file(READ ${PACKAGE_JSON_PATH} PACKAGE_JSON_CONTENT)

# Use relaxed regex to match version number
string(REGEX MATCH "\"version\"[ \t\r\n]*:[ \t\r\n]*\"([^\"]+)\"" _ "${PACKAGE_JSON_CONTENT}")
set(DICE_VERSION "${CMAKE_MATCH_1}")

if(NOT DICE_VERSION OR DICE_VERSION STREQUAL "")
    message(WARNING "Failed to read version from package.json, using default version 0.0.0")
    set(DICE_VERSION "0.0.0")
else()
    message(STATUS "Detected version: ${DICE_VERSION}")
endif()

# Generate version header using configure_file
configure_file(
    ${VERSION_HEADER_IN}
    ${VERSION_HEADER_OUT}
    @ONLY
)

message(STATUS "Generated version header: ${VERSION_HEADER_OUT}")

# Emscripten specific settings
if(EMSCRIPTEN)
    set(CMAKE_EXECUTABLE_SUFFIX ".js")

    # Emscripten link flags
    set(EMSCRIPTEN_LINK_FLAGS
        --bind
        -s WASM=1
        -s ALLOW_MEMORY_GROWTH=1
        "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']"
        "-s EXPORTED_FUNCTIONS=['_malloc','_free']"
        -s MODULARIZE=1
        "-s EXPORT_NAME='createDiceModule'"
        -s EXPORT_ES6=1
        -s ENVIRONMENT=web,node
        -s NO_DISABLE_EXCEPTION_CATCHING
        -s NO_EXIT_RUNTIME=1
        -s INITIAL_MEMORY=33554432
        -s ERROR_ON_UNDEFINED_SYMBOLS=0
        --no-entry
        -Wl,--allow-undefined
    )

    # Optimization options
    if(CMAKE_BUILD_TYPE STREQUAL "Release")
        list(APPEND EMSCRIPTEN_LINK_FLAGS -O3 -flto)
    else()
        list(APPEND EMSCRIPTEN_LINK_FLAGS -O0 -g -gsource-map)
    endif()

    # Convert list to string
    string(REPLACE ";" " " EMSCRIPTEN_LINK_FLAGS_STR "${EMSCRIPTEN_LINK_FLAGS}")
endif()

# ============================================
# Lua 5.4 Integration
# ============================================
file(GLOB LUA_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/include/lua/*.c")
# Exclude standalone interpreters and test files
list(FILTER LUA_SOURCES EXCLUDE REGEX ".*/lua\\.c$")
list(FILTER LUA_SOURCES EXCLUDE REGEX ".*/luac\\.c$")
list(FILTER LUA_SOURCES EXCLUDE REGEX ".*/onelua\\.c$")  # Single-file amalgamation (causes duplicates)
list(FILTER LUA_SOURCES EXCLUDE REGEX ".*/ltests\\.c$")  # Test file

# ============================================
# QuickJS Integration
# ============================================
# Note: quickjs-libc.c is excluded because it contains POSIX-specific code
# that is not compatible with WASM (environ, sighandler_t, etc.)
set(QUICKJS_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/include/QuickJS/quickjs.c
    ${CMAKE_CURRENT_SOURCE_DIR}/include/QuickJS/libbf.c
    ${CMAKE_CURRENT_SOURCE_DIR}/include/QuickJS/libregexp.c
    ${CMAKE_CURRENT_SOURCE_DIR}/include/QuickJS/libunicode.c
    ${CMAKE_CURRENT_SOURCE_DIR}/include/QuickJS/cutils.c
)

# ============================================
# yaml-cpp Integration
# ============================================
# Disable yaml-cpp tests, tools, and shared libs for WASM
set(YAML_CPP_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(YAML_CPP_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(YAML_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(YAML_CPP_BUILD_CONTRIB ON CACHE BOOL "" FORCE)
set(YAML_CPP_INSTALL OFF CACHE BOOL "" FORCE)

# Add yaml-cpp as subdirectory
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/include/yaml-cpp EXCLUDE_FROM_ALL)

# Include directories
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
    ${CMAKE_CURRENT_SOURCE_DIR}/include/QuickJS
    ${CMAKE_CURRENT_SOURCE_DIR}/include/zlib
)

# Collect core source files (exclude platform-specific and unnecessary modules)
set(DICE_CORE_SOURCES
    # Core dice rolling
    ../Dice/Dice/RD.cpp
    ../Dice/Dice/RandomGenerator.cpp
    ../Dice/Dice/DiceSession.cpp

    # Attributes and variables
    ../Dice/Dice/DiceAttrVar.cpp
    ../Dice/Dice/strExtern.cpp

    # Rule system
    ../Dice/Dice/GetRule.cpp

    # Deck and character cards
    ../Dice/Dice/CardDeck.cpp
    ../Dice/Dice/CharacterCard.cpp

    # Formatting
    ../Dice/Dice/DiceFormatter.cpp
    ../Dice/Dice/MsgFormat.cpp

    # JSON processing
    ../Dice/Dice/Jsonio.cpp

    # File operations (simplified)
    ../Dice/Dice/DiceFile.cpp

    # Deck system
    ../Dice/Dice/CardDeck.cpp

    # Global variables (including rule data)
    ../Dice/Dice/GlobalVar.cpp
)

# WASM interface source files - 新的模块化结构
set(WASM_SOURCES
    # Core - 核心命令处理
    src/core/utils.cpp
    src/core/command_processor.cpp
    src/core/roll_handler.cpp
    src/core/check_handler.cpp

    # Features - 功能模块（新结构）
    src/features/character.cpp
    src/features/character_parser.cpp
    src/features/insanity.cpp
    src/features/initiative.cpp
    src/features/deck.cpp
    src/features/rule.cpp
    src/dice_character_parse.cpp  # 保留旧文件（如果还需要）

    # Extensions - 扩展系统
    src/extensions/extension_manager.cpp
    src/extensions/lua_support.cpp
    src/extensions/js_support.cpp

    # Bindings - WASM绑定层
    src/bindings/wasm_bindings.cpp
)

# Create WASM library
add_executable(dice ${DICE_CORE_SOURCES} ${WASM_SOURCES} ${LUA_SOURCES} ${QUICKJS_SOURCES})

# Set compile definitions
target_compile_definitions(dice PRIVATE
    DICE_WASM_BUILD
    CONFIG_BIGNUM
    _SILENCE_CXX17_CODECVT_HEADER_DEPRECATION_WARNING
    # Lua definitions
    LUA_USE_POSIX
    LUA_32BITS
    # QuickJS definitions
    CONFIG_VERSION="2021-03-27"
    JS_STRICT_NAN_BOXING
)

# Link yaml-cpp library
target_link_libraries(dice PRIVATE yaml-cpp)

# Apply Emscripten flags
if(EMSCRIPTEN)
    # Set link flags and output path
    set_target_properties(dice PROPERTIES
        LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS_STR}"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../lib"
        OUTPUT_NAME "dice"
    )

    # Set compile options
    target_compile_options(dice PRIVATE -fexceptions)

    # Output build information
    message(STATUS "=== Dice WASM Build Configuration ===")
    message(STATUS "Project Root: ${CMAKE_CURRENT_SOURCE_DIR}/..")
    message(STATUS "WASM Directory: ${CMAKE_CURRENT_SOURCE_DIR}")
    message(STATUS "Build Directory: ${CMAKE_BINARY_DIR}")
    message(STATUS "Output Directory: ${CMAKE_CURRENT_SOURCE_DIR}/../lib")
    message(STATUS "Build Type: ${CMAKE_BUILD_TYPE}")
    message(STATUS "Version: ${DICE_VERSION}")
    message(STATUS "======================================")
endif()

# Install rules
install(TARGETS dice
    RUNTIME DESTINATION ${CMAKE_CURRENT_SOURCE_DIR}/../lib
)

# ============================================
# Custom Target: Clean All
# ============================================
add_custom_target(clean-all
    COMMAND ${CMAKE_COMMAND} -E remove_directory ${CMAKE_BINARY_DIR}
    COMMAND ${CMAKE_COMMAND} -E echo "Build directory cleaned"
    COMMENT "Clean all build artifacts"
)

# ============================================
# Post-Build: Check Output Files
# ============================================
add_custom_command(TARGET dice POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E echo "=== Checking Output Files ==="
    COMMAND ${CMAKE_COMMAND} -E echo "Output Directory: ${CMAKE_CURRENT_SOURCE_DIR}/../lib"
    COMMENT "Build completed, checking output files"
)
