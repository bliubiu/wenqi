use wasm_bindgen::prelude::*;

// 模块声明
pub mod scoring;
pub mod index;
pub mod search;
pub mod clustering;
pub mod codec;

// 当 panic 时输出错误信息到控制台
pub fn set_panic_hook() {
    console_error_panic_hook::set_once();
}

// WASM 模块初始化
#[wasm_bindgen(start)]
pub fn init() {
    set_panic_hook();
}

// 版本信息
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// 算法版本
#[wasm_bindgen]
pub fn algorithm_version() -> String {
    "v1.0".to_string()
}

// 测试模块
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!version().is_empty());
    }

    #[test]
    fn test_algorithm_version() {
        assert_eq!(algorithm_version(), "v1.0");
    }
}
