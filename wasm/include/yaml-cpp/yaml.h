/**
 * yaml-cpp stub for WASM build
 * 在 WASM 环境中不使用 YAML 功能
 */
#pragma once
#include <optional>
#include <string>

namespace YAML {
    class Node {
    private:
        static Node _dummy;
        
    public:
        void* m_pNode = nullptr;
        
        // 键值对成员（引用到dummy对象）
        Node& first = _dummy;
        Node& second = _dummy;

        Node() = default;
        Node(const Node&) = default;
        Node(Node&&) = default;
        
        // 自定义赋值运算符（忽略引用成员）
        Node& operator=(const Node&) { return *this; }
        Node& operator=(Node&&) { return *this; }
        
        bool IsScalar() const { return false; }
        bool IsMap() const { return false; }
        bool IsSequence() const { return false; }
        
        std::string Scalar() const { return ""; }

        Node operator[](const std::string&) const { return Node(); }
        Node operator[](int) const { return Node(); }

        Node begin() const { return Node(); }
        Node end() const { return Node(); }

        template<typename T>
        Node& operator=(const T&) { return *this; }

        // 转换为 bool 用于条件判断
        explicit operator bool() const { return false; }

        // 迭代器支持
        bool operator!=(const Node&) const { return false; }
        bool operator==(const Node&) const { return true; }
        Node& operator++() { return *this; }
        Node& operator*() { return *this; }
    };
    
    inline Node Node::_dummy;

    template<typename T>
    struct convert {
        static bool decode(const Node&, T&) { return false; }
    };

    template<typename T, typename U = T>
    struct as_if {
        explicit as_if(const Node& node_) : node(node_) {}
        const Node& node;
        U operator()() const { return U(); }
    };

    // 支持 yaml-cpp/node/node.h 的包含
    namespace detail {
        class node {};
    }
}
