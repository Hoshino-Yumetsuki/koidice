/**
 * tinyxml2 stub for WASM build
 * 在 WASM 环境中不使用 XML 功能
 */
#pragma once

namespace tinyxml2 {
    enum XMLError {
        XML_SUCCESS = 0
    };
    
    class XMLElement {
    public:
        const char* Attribute(const char*) const { return nullptr; }
        const char* GetText() const { return nullptr; }
        const char* Name() const { return ""; }
        XMLElement* NextSiblingElement() const { return nullptr; }
        XMLElement* FirstChildElement() const { return nullptr; }
    };
    
    class XMLDocument {
    public:
        XMLError LoadFile(const char*) { return XML_SUCCESS; }
        XMLElement* FirstChildElement() const { return nullptr; }
        const char* ErrorStr() const { return ""; }
    };
}
