/**
 * DDAPI stub for WASM build
 * Dice! 的平台 API 在 WASM 中不可用
 */
#pragma once

#include <string>
#include <cstdint>

// DD 命名空间 stub
namespace DD {
    inline int64_t getLoginID() { return 0; }
    inline bool isGroupAdmin(int64_t, int64_t, bool) { return false; }
    
    inline auto getGroupMemberList(int64_t) { 
        struct EmptyList {
            struct Iterator {
                bool operator!=(const Iterator&) const { return false; }
                Iterator& operator++() { return *this; }
                int operator*() const { return 0; }
            };
            bool empty() const { return true; }
            Iterator begin() const { return Iterator(); }
            Iterator end() const { return Iterator(); }
        };
        return EmptyList(); 
    }
}
