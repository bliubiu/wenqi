use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// JSON 字符串 → bincode 编码
/// JS 端先用 JSON.stringify 序列化为字符串，再传入此函数转为二进制 bytes。
/// bincode 将 JSON 字符串视为不透明的 String 处理（不支持 serde_json::Value 的 deserialize_any）
#[wasm_bindgen(js_name = bincodeEncode)]
pub fn bincode_encode(json_str: &str) -> Result<Vec<u8>, JsValue> {
    bincode::serialize(&json_str.to_string())
        .map_err(|e| JsValue::from_str(&format!("bincodeEncode 序列化失败: {}", e)))
}

/// bincode 字节 → JSON 字符串解码
/// JS 端收到字符串后自行 JSON.parse 还原对象
#[wasm_bindgen(js_name = bincodeDecode)]
pub fn bincode_decode(bytes: &[u8]) -> Result<String, JsValue> {
    let json_str: String = bincode::deserialize(bytes)
        .map_err(|e| JsValue::from_str(&format!("bincodeDecode 反序列化失败: {}", e)))?;
    Ok(json_str)
}

/// 将类型 T 序列化为 bincode 字节（内部辅助函数）
pub fn serialize_binary<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    bincode::serialize(value).map_err(|e| format!("bincode 序列化失败: {}", e))
}

/// 从 bincode 字节反序列化为类型 T（内部辅助函数）
pub fn deserialize_binary<'a, T: Deserialize<'a>>(bytes: &'a [u8]) -> Result<T, String> {
    bincode::deserialize(bytes).map_err(|e| format!("bincode 反序列化失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;


    /// 用内部辅助函数测试 bincode 编解码（绕过 #[wasm_bindgen] 限制）
    fn test_encode_typed<T: serde::Serialize>(value: &T) -> Vec<u8> {
        serialize_binary(value).unwrap()
    }

    fn test_decode_typed<T: serde::de::DeserializeOwned>(bytes: &[u8]) -> T {
        deserialize_binary(bytes).unwrap()
    }

    #[test]
    fn test_bincode_roundtrip_typed_struct() {
        #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
        struct Poet {
            name: String,
            dynasty: String,
            talent: f64,
            popularity: f64,
            luck: f64,
        }

        let original = Poet {
            name: "李白".into(),
            dynasty: "TANG".into(),
            talent: 95.5,
            popularity: 90.0,
            luck: 85.0,
        };

        let bytes = test_encode_typed(&original);
        let decoded: Poet = test_decode_typed(&bytes);
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_bincode_roundtrip_string() {
        let original = "{\"name\":\"李白\",\"works\":[\"静夜思\",\"将进酒\"]}".to_string();
        let bytes = serialize_binary(&original).unwrap();
        let decoded: String = deserialize_binary(&bytes).unwrap();
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_bincode_empty_string() {
        let original = "".to_string();
        let bytes = serialize_binary(&original).unwrap();
        let decoded: String = deserialize_binary(&bytes).unwrap();
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_bincode_large_array() {
        let arr: Vec<i32> = (0..1000).collect();
        let bytes = test_encode_typed(&arr);
        let decoded: Vec<i32> = test_decode_typed(&bytes);
        assert_eq!(arr, decoded);
    }

    #[test]
    fn test_bincode_decode_invalid_bytes() {
        let result: Result<String, String> = deserialize_binary(&[0, 1, 2, 3, 4, 5]);
        assert!(result.is_err());
    }

    #[test]
    fn test_bincode_encode_any_string_passes_through() {
        // bincode 把字符串当作不透明数据，不校验其内容是否为合法 JSON
        let result = serialize_binary(&"这不是 JSON，但能正常编码".to_string());
        assert!(result.is_ok());
        let decoded: String = deserialize_binary(&result.unwrap()).unwrap();
        assert_eq!(decoded, "这不是 JSON，但能正常编码");
    }

    #[test]
    fn test_bincode_roundtrip_concrete_types() {
        // 用具体类型验证 bincode 编解码（不涉及 serde_json::Value）
        #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
        struct Config {
            limit: u32,
            scope: String,
            dynasty: Option<String>,
            genre: Option<String>,
        }

        let original = Config {
            limit: 20,
            scope: "ALL".into(),
            dynasty: Some("TANG".into()),
            genre: None,
        };

        let bytes = test_encode_typed(&original);
        let decoded: Config = test_decode_typed(&bytes);
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_typed_serialize_deserialize_roundtrip() {
        #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
        struct SearchResult {
            items: Vec<SearchItem>,
            total: usize,
        }

        #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
        struct SearchItem {
            node_id: String,
            score: f64,
            highlight: String,
        }

        let original = SearchResult {
            items: vec![
                SearchItem { node_id: "poet_001".into(), score: 0.95, highlight: "<em>李白</em>".into() },
                SearchItem { node_id: "poet_002".into(), score: 0.85, highlight: "<em>杜甫</em>".into() },
            ],
            total: 2,
        };

        let bytes = test_encode_typed(&original);
        let decoded: SearchResult = test_decode_typed(&bytes);
        assert_eq!(original, decoded);
    }
}
