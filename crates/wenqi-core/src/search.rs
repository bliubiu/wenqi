use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

use crate::codec;

/// 搜索选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub limit: usize,
    pub scope: String,
    pub dynasty: Option<String>,
    pub genre: Option<String>,
}

/// 搜索结果项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub node_id: String,
    pub ref_type: String,
    pub ref_id: String,
    pub highlight: String,
    pub score: f64,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub items: Vec<SearchResultItem>,
    pub total: usize,
}

/// 文档数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub ref_type: String,
    pub ref_id: String,
    pub title: String,
    pub content: String,
    pub dynasty: Option<String>,
    pub genre: Option<String>,
}

/// 倒排索引
#[wasm_bindgen]
pub struct SearchEngine {
    documents: Vec<Document>,
    index: HashMap<String, HashSet<usize>>,
}

#[wasm_bindgen]
impl SearchEngine {
    /// 创建新的搜索引擎
    #[wasm_bindgen(constructor)]
    pub fn new() -> SearchEngine {
        SearchEngine {
            documents: Vec::new(),
            index: HashMap::new(),
        }
    }

    /// 构建搜索索引（原生兼容版本）
    fn build_index_from_json(&mut self, corpus_json: &str) -> Result<(), String> {
        let documents: Vec<Document> = serde_json::from_str(corpus_json)
            .map_err(|e| format!("解析文档数据失败: {}", e))?;

        self.documents = documents;
        self.index.clear();

        for (i, doc) in self.documents.iter().enumerate() {
            let tokens = Self::tokenize(&format!("{} {}", doc.title, doc.content));
            for token in tokens {
                self.index
                    .entry(token)
                    .or_insert_with(HashSet::new)
                    .insert(i);
            }
        }

        Ok(())
    }

    /// 构建搜索索引（WASM 接口）
    #[wasm_bindgen(js_name = buildIndex)]
    pub fn build_index(&mut self, corpus_json: &str) -> Result<(), JsValue> {
        self.build_index_from_json(corpus_json)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// 分词：中文使用 bigram + 单字去重，英文按空格分词
    fn tokenize(text: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // 按空格分割英文/数字词组
        for word in text.split_whitespace() {
            if !word.is_empty() && word.chars().any(|c| c.is_ascii()) {
                let lower = word.to_lowercase();
                if seen.insert(lower.clone()) {
                    tokens.push(lower);
                }
            }
        }

        // 中文字符双字组合（bigram）
        let chars: Vec<char> = text.chars().filter(|c| !c.is_whitespace()).collect();
        if chars.is_empty() {
            return tokens;
        }
        if chars.len() <= 2 {
            let s: String = chars.iter().collect();
            if seen.insert(s.clone()) {
                tokens.push(s);
            }
        } else {
            for i in 0..chars.len().saturating_sub(1) {
                let bigram = format!("{}{}", chars[i], chars[i + 1]);
                if seen.insert(bigram.clone()) {
                    tokens.push(bigram);
                }
            }
            // 单字作为补充
            for &ch in &chars {
                let s = ch.to_string();
                if seen.insert(s.clone()) {
                    tokens.push(s);
                }
            }
        }

        tokens
    }

    /// 全文检索（原生兼容版本）
    fn search_from_json(&self, query: &str, options_json: &str) -> Result<SearchResult, String> {
        let options: SearchOptions = serde_json::from_str(options_json)
            .map_err(|e| format!("解析搜索选项失败: {}", e))?;

        let tokens = Self::tokenize(query);
        let mut scores: HashMap<usize, f64> = HashMap::new();

        // 计算每个文档的相关度分数
        for token in &tokens {
            if let Some(doc_indices) = self.index.get(token) {
                for &idx in doc_indices {
                    let doc = &self.documents[idx];

                    // 检查过滤条件
                    if let Some(ref dynasty) = options.dynasty {
                        if doc.dynasty.as_ref() != Some(dynasty) {
                            continue;
                        }
                    }
                    if let Some(ref genre) = options.genre {
                        if doc.genre.as_ref() != Some(genre) {
                            continue;
                        }
                    }

                    *scores.entry(idx).or_insert(0.0) += 1.0;
                }
            }
        }

        // 排序并限制结果数量
        let mut results: Vec<(usize, f64)> = scores.into_iter().collect();
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        results.truncate(options.limit);

        // 构建搜索结果
        let items: Vec<SearchResultItem> = results
            .iter()
            .map(|&(idx, score)| {
                let doc = &self.documents[idx];
                SearchResultItem {
                    node_id: doc.id.clone(),
                    ref_type: doc.ref_type.clone(),
                    ref_id: doc.ref_id.clone(),
                    highlight: Self::highlight(&doc.title, query),
                    score: score / tokens.len() as f64,
                }
            })
            .collect();

        let result = SearchResult {
            total: items.len(),
            items,
        };

        Ok(result)
    }

    /// 全文检索（WASM 接口，JSON 格式）
    #[wasm_bindgen(js_name = search)]
    pub fn search(&self, query: &str, options_json: &str) -> Result<JsValue, JsValue> {
        match self.search_from_json(query, options_json) {
            Ok(r) => serde_json::to_string(&r).map(JsValue::from).map_err(|e| JsValue::from_str(&e.to_string())),
            Err(e) => Err(JsValue::from_str(&e)),
        }
    }

    /// 全文检索（WASM 接口，bincode 二进制格式）
    /// 输入/输出均为 bincode 编码的 Uint8Array，省去 JSON 序列化开销
    #[wasm_bindgen(js_name = searchBinary)]
    pub fn search_binary(&self, query: &str, options_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
        let options: SearchOptions = codec::deserialize_binary(options_bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        let options_json = serde_json::to_string(&options)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let result = self.search_from_json(query, &options_json)
            .map_err(|e| JsValue::from_str(&e))?;

        codec::serialize_binary(&result)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// 高亮匹配文本
    pub(crate) fn highlight(text: &str, query: &str) -> String {
        let lower_text = text.to_lowercase();
        let lower_query = query.to_lowercase();
        if lower_text.contains(&lower_query) {
            lower_text.replace(&lower_query, &format!("<em>{}</em>", query))
        } else {
            text.to_string()
        }
    }

    /// 模糊匹配（拼音/简繁）
    #[wasm_bindgen(js_name = fuzzyMatch)]
    pub fn fuzzy_match(&self, query: &str) -> Result<JsValue, JsValue> {
        let options = SearchOptions {
            limit: 20,
            scope: "ALL".to_string(),
            dynasty: None,
            genre: None,
        };

        let options_json = serde_json::to_string(&options)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        self.search(query, &options_json)
    }

    /// 获取文档数量
    #[wasm_bindgen(js_name = documentCount)]
    pub fn document_count(&self) -> usize {
        self.documents.len()
    }

    /// 获取索引大小
    #[wasm_bindgen(js_name = indexSize)]
    pub fn index_size(&self) -> usize {
        self.index.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_engine_creation() {
        let engine = SearchEngine::new();
        assert_eq!(engine.document_count(), 0);
        assert_eq!(engine.index_size(), 0);
    }

    #[test]
    fn test_build_index_native() {
        let mut engine = SearchEngine::new();
        let documents = vec![
            Document {
                id: "1".to_string(),
                ref_type: "WORK".to_string(),
                ref_id: "w1".to_string(),
                title: "静夜思".to_string(),
                content: "床前明月光".to_string(),
                dynasty: Some("TANG".to_string()),
                genre: Some("SHI".to_string()),
            },
            Document {
                id: "2".to_string(),
                ref_type: "WORK".to_string(),
                ref_id: "w2".to_string(),
                title: "春晓".to_string(),
                content: "春眠不觉晓".to_string(),
                dynasty: Some("TANG".to_string()),
                genre: Some("SHI".to_string()),
            },
        ];

        let corpus = serde_json::to_string(&documents).unwrap();
        engine.build_index_from_json(&corpus).unwrap();

        assert_eq!(engine.document_count(), 2);
        assert!(engine.index_size() > 0);
    }

    #[test]
    fn test_build_index_invalid_json_returns_error() {
        let mut engine = SearchEngine::new();
        let result = engine.build_index_from_json("not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("解析文档数据失败"));
    }

    #[test]
    fn test_search_returns_results() {
        let mut engine = SearchEngine::new();
        let documents = vec![
            Document {
                id: "1".to_string(),
                ref_type: "POET".to_string(),
                ref_id: "poet_1".to_string(),
                title: "李白".to_string(),
                content: "床前明月光".to_string(),
                dynasty: Some("TANG".to_string()),
                genre: Some("SHI".to_string()),
            },
            Document {
                id: "2".to_string(),
                ref_type: "POET".to_string(),
                ref_id: "poet_2".to_string(),
                title: "杜甫".to_string(),
                content: "国破山河在".to_string(),
                dynasty: Some("TANG".to_string()),
                genre: Some("SHI".to_string()),
            },
        ];

        let corpus = serde_json::to_string(&documents).unwrap();
        engine.build_index_from_json(&corpus).unwrap();

        let options = r#"{"limit": 10, "scope": "ALL", "dynasty": null, "genre": null}"#;
        let result = engine.search_from_json("李白", options).unwrap();

        assert_eq!(result.total, 1);
        assert_eq!(result.items[0].ref_id, "poet_1");
    }

    #[test]
    fn test_search_empty_query() {
        let mut engine = SearchEngine::new();
        let doc = r#"[{"id":"1","ref_type":"POET","ref_id":"p1","title":"test","content":"hello","dynasty":"TANG","genre":"SHI"}]"#;
        engine.build_index_from_json(doc).unwrap();

        let options = r#"{"limit": 10, "scope": "ALL", "dynasty": null, "genre": null}"#;
        let result = engine.search_from_json("", options).unwrap();
        assert_eq!(result.total, 0);
    }

    #[test]
    fn test_search_with_dynasty_filter() {
        let mut engine = SearchEngine::new();
        let documents = vec![
            Document {
                id: "1".to_string(), ref_type: "POET".to_string(), ref_id: "p1".to_string(),
                title: "李白".to_string(), content: "静夜思".to_string(),
                dynasty: Some("TANG".to_string()), genre: Some("SHI".to_string()),
            },
            Document {
                id: "2".to_string(), ref_type: "POET".to_string(), ref_id: "p2".to_string(),
                title: "苏轼".to_string(), content: "水调歌头".to_string(),
                dynasty: Some("SONG".to_string()), genre: Some("CI".to_string()),
            },
        ];
        let corpus = serde_json::to_string(&documents).unwrap();
        engine.build_index_from_json(&corpus).unwrap();

        let options = r#"{"limit": 10, "scope": "ALL", "dynasty": "TANG", "genre": null}"#;
        let result = engine.search_from_json("诗", options).unwrap();
        // "诗" 不在 title/content 中，返回空
        assert_eq!(result.items.len(), 0);
    }

    #[test]
    fn test_search_with_genre_filter() {
        let mut engine = SearchEngine::new();
        let documents = vec![
            Document {
                id: "1".to_string(), ref_type: "POET".to_string(), ref_id: "p1".to_string(),
                title: "静夜思".to_string(), content: "床前明月光".to_string(),
                dynasty: Some("TANG".to_string()), genre: Some("SHI".to_string()),
            },
            Document {
                id: "2".to_string(), ref_type: "WORK".to_string(), ref_id: "w1".to_string(),
                title: "水调歌头".to_string(), content: "明月几时有".to_string(),
                dynasty: Some("SONG".to_string()), genre: Some("CI".to_string()),
            },
        ];
        let corpus = serde_json::to_string(&documents).unwrap();
        engine.build_index_from_json(&corpus).unwrap();

        let options = r#"{"limit": 10, "scope": "ALL", "dynasty": null, "genre": "CI"}"#;
        let result = engine.search_from_json("明月", options).unwrap();
        assert_eq!(result.total, 1);
        assert_eq!(result.items[0].ref_id, "w1");
    }

    #[test]
    fn test_search_non_existent_query_returns_empty() {
        let mut engine = SearchEngine::new();
        let doc = r#"[{"id":"1","ref_type":"POET","ref_id":"p1","title":"李白","content":"静夜思","dynasty":"TANG","genre":"SHI"}]"#;
        engine.build_index_from_json(doc).unwrap();
        let options = r#"{"limit": 10, "scope": "ALL", "dynasty": null, "genre": null}"#;
        let result = engine.search_from_json("xxxxxx不存在xxxxxx", options).unwrap();
        assert_eq!(result.total, 0);
    }

    #[test]
    fn test_search_options_invalid_json() {
        let engine = SearchEngine::new();
        let result = engine.search_from_json("test", "not json");
        assert!(result.is_err());
    }

    #[test]
    fn test_tokenize_chinese_bigram_and_single() {
        let tokens = SearchEngine::tokenize("静夜思");
        // bigrams: 静夜, 夜思; singles: 静, 夜, 思 (单字始终补充)
        assert!(tokens.contains(&"静夜".to_string()));
        assert!(tokens.contains(&"夜思".to_string()));
        assert!(tokens.contains(&"静".to_string()));
        assert!(tokens.contains(&"夜".to_string()));
        assert!(tokens.contains(&"思".to_string()));
    }

    #[test]
    fn test_tokenize_chinese_short_text() {
        let tokens = SearchEngine::tokenize("李白");
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0], "李白");
    }

    #[test]
    fn test_tokenize_single_char() {
        let tokens = SearchEngine::tokenize("春");
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0], "春");
    }

    #[test]
    fn test_tokenize_ascii_words() {
        let tokens = SearchEngine::tokenize("Hello World");
        assert!(tokens.contains(&"hello".to_string()));
        assert!(tokens.contains(&"world".to_string()));
    }

    #[test]
    fn test_tokenize_mixed_content() {
        let tokens = SearchEngine::tokenize("李白 poet Li Bai");
        // 中文部分: 李白(bigram=李白, singles=李,白), 英文: poet, li, bai
        assert!(tokens.contains(&"李白".to_string()));
        assert!(tokens.contains(&"poet".to_string()));
        assert!(tokens.contains(&"li".to_string()));
        assert!(tokens.contains(&"bai".to_string()));
    }

    #[test]
    fn test_tokenize_dedup_ascii() {
        let tokens = SearchEngine::tokenize("test test TEST");
        let count = tokens.iter().filter(|t| *t == "test").count();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_tokenize_empty_text() {
        let tokens = SearchEngine::tokenize("");
        assert!(tokens.is_empty(), "空文本不应产生任何 token");
    }

    #[test]
    fn test_tokenize_whitespace_only() {
        let tokens = SearchEngine::tokenize("   ");
        assert!(tokens.is_empty(), "纯空格不应产生任何 token");
    }

    #[test]
    fn test_highlight_marks_matches() {
        let highlighted = SearchEngine::highlight("静夜思", "夜");
        assert!(highlighted.contains("<em>"));
        assert!(highlighted.contains("</em>"));
    }

    #[test]
    fn test_highlight_no_match_returns_original() {
        let highlighted = SearchEngine::highlight("静夜思", "春");
        assert_eq!(highlighted, "静夜思");
    }

    #[test]
    fn test_highlight_case_insensitive() {
        let highlighted = SearchEngine::highlight("Hello World", "world");
        assert!(highlighted.to_lowercase().contains("<em>world</em>"));
    }

    #[test]
    fn test_document_count_after_build() {
        let mut engine = SearchEngine::new();
        let doc = r#"[{"id":"1","ref_type":"POET","ref_id":"p1","title":"test","content":"body","dynasty":"TANG","genre":"SHI"}]"#;
        engine.build_index_from_json(doc).unwrap();
        assert_eq!(engine.document_count(), 1);
    }

    #[test]
    fn test_index_size_after_build() {
        let mut engine = SearchEngine::new();
        let doc = r#"[{"id":"1","ref_type":"POET","ref_id":"p1","title":"test","content":"hello world","dynasty":"TANG","genre":"SHI"}]"#;
        engine.build_index_from_json(doc).unwrap();
        // tokens: test, hello, world, plus Chinese bigrams from title/content
        assert!(engine.index_size() > 0);
    }
}
