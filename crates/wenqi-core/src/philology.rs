use js_sys::Array;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// 汉字区间（与 JS 侧 `\u4e00-\u9fff` 口径一致）
const CJK_START: char = '\u{4e00}';
const CJK_END: char = '\u{9fff}';

/// 韵部归组输入：作品文本
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkText {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub text: String,
}

/// 韵部归组输出：韵脚尾字与出现次数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RhymeGroup {
    pub ending: String,
    pub count: usize,
}

/// 提取正文中的汉字（去标点、空白与非汉字字符）
fn collect_cjk(text: &str) -> String {
    text.chars()
        .filter(|c| (CJK_START..=CJK_END).contains(c))
        .collect()
}

/// n-gram 提取：汉字串滑窗、去重、上限截断
fn extract_grams_from_cjk(cjk: &str, gram_len: usize, max_grams: usize) -> Vec<String> {
    if gram_len == 0 || max_grams == 0 {
        return Vec::new();
    }
    let chars: Vec<char> = cjk.chars().collect();
    if chars.len() < gram_len {
        return Vec::new();
    }
    let mut seen = HashMap::with_capacity(max_grams);
    let mut grams = Vec::with_capacity(max_grams);
    for i in 0..=chars.len() - gram_len {
        if grams.len() >= max_grams {
            break;
        }
        let gram: String = chars[i..i + gram_len].iter().collect();
        if seen.insert(gram.clone(), ()).is_none() {
            grams.push(gram);
        }
    }
    grams
}

fn extract_grams_impl(text: &str, gram_len: usize, max_grams: usize) -> Vec<String> {
    extract_grams_from_cjk(&collect_cjk(text), gram_len, max_grams)
}

/// 按标点/空白切分诗行，取每行末尾汉字（单字段不计）
fn foot_chars(text: &str) -> Vec<char> {
    let mut feet = Vec::new();
    let mut segment: Vec<char> = Vec::new();
    for ch in text.chars() {
        if (CJK_START..=CJK_END).contains(&ch) {
            segment.push(ch);
        } else {
            if segment.len() >= 2 {
                feet.push(*segment.last().unwrap());
            }
            segment.clear();
        }
    }
    if segment.len() >= 2 {
        feet.push(*segment.last().unwrap());
    }
    feet
}

/// 韵脚尾字：诗行尾字中出现次数最多者（同频按首次出现顺序）
fn rhyme_foot_impl(text: &str) -> String {
    let feet = foot_chars(text);
    if feet.is_empty() {
        return String::new();
    }
    let mut order: Vec<char> = Vec::new();
    let mut counts: HashMap<char, usize> = HashMap::new();
    for foot in feet {
        let entry = counts.entry(foot).or_insert(0);
        if *entry == 0 {
            order.push(foot);
        }
        *entry += 1;
    }
    let mut best = order[0];
    let mut best_count = counts[&best];
    for foot in &order[1..] {
        let count = counts[foot];
        if count > best_count {
            best = *foot;
            best_count = count;
        }
    }
    best.to_string()
}

/// 韵部归组：按每件作品的韵脚尾字分组统计，次数降序、同频按尾字排序
fn group_by_rhyme_impl(works: &[WorkText]) -> Vec<RhymeGroup> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for work in works {
        let foot = rhyme_foot_impl(&work.text);
        if foot.is_empty() {
            continue;
        }
        *counts.entry(foot).or_insert(0) += 1;
    }
    let mut groups: Vec<RhymeGroup> = counts
        .into_iter()
        .map(|(ending, count)| RhymeGroup { ending, count })
        .collect();
    groups.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.ending.cmp(&b.ending)));
    groups
}

/// 文献学计算服务：n-gram 提取与韵脚归组
#[wasm_bindgen]
pub struct PhilologyService;

#[wasm_bindgen]
impl PhilologyService {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PhilologyService {
        PhilologyService
    }

    /// 提取正文 n-gram（返回字符串数组）
    #[wasm_bindgen(js_name = extractGrams)]
    pub fn extract_grams(&self, text: &str, gram_len: usize, max_grams: usize) -> JsValue {
        let grams = extract_grams_impl(text, gram_len, max_grams);
        let arr = Array::new_with_length(grams.len() as u32);
        for (i, gram) in grams.iter().enumerate() {
            arr.set(i as u32, JsValue::from_str(gram));
        }
        arr.into()
    }

    /// 韵脚尾字（取诗行尾字众数）
    #[wasm_bindgen(js_name = rhymeFoot)]
    pub fn rhyme_foot(&self, text: &str) -> String {
        rhyme_foot_impl(text)
    }

    /// 韵部归组（JSON 输入输出）：[{"id","text"}] → [{"ending","count"}]
    #[wasm_bindgen(js_name = groupByRhyme)]
    pub fn group_by_rhyme(&self, works_json: &str) -> Result<String, JsValue> {
        let works: Vec<WorkText> = serde_json::from_str(works_json)
            .map_err(|e| JsValue::from_str(&format!("解析作品数据失败: {}", e)))?;
        serde_json::to_string(&group_by_rhyme_impl(&works))
            .map_err(|e| JsValue::from_str(&format!("序列化韵部数据失败: {}", e)))
    }
}

impl Default for PhilologyService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_grams_filters_punctuation() {
        let grams = extract_grams_impl("床前明月光，疑是地上霜。", 5, 600);
        assert!(grams.contains(&"床前明月光".to_string()));
        assert!(!grams.iter().any(|g| g.contains('，')));
    }

    #[test]
    fn test_extract_grams_dedup_and_limit() {
        let grams = extract_grams_impl("明月明月明月", 2, 3);
        assert_eq!(grams.len(), 2);
        assert_eq!(grams[0], "明月");
        assert_eq!(grams[1], "月明");
        assert!(extract_grams_impl("春眠", 5, 600).is_empty());
        assert!(extract_grams_impl("", 5, 600).is_empty());
    }

    #[test]
    fn test_rhyme_foot_picks_mode() {
        // 光/霜/月/乡 各出现一次，同频取首次出现者
        assert_eq!(rhyme_foot_impl("床前明月光，疑是地上霜。举头望明月，低头思故乡。"), "光");
        // 无两字以上诗行视为无韵脚
        assert_eq!(rhyme_foot_impl("春眠不觉晓，处处闻啼鸟。"), "晓");
        assert_eq!(rhyme_foot_impl(""), "");
    }

    #[test]
    fn test_group_by_rhyme_sorts_by_count() {
        let works = vec![
            WorkText { id: "1".into(), text: "床前明月光，疑是地上霜。".into() },
            WorkText { id: "2".into(), text: "日照香炉生紫烟，遥看瀑布挂前川。".into() },
            WorkText { id: "3".into(), text: "朝辞白帝彩云间，千里江陵一日还。".into() },
        ];
        let groups = group_by_rhyme_impl(&works);
        assert_eq!(groups.len(), 3);
        // 次数相同按尾字排序（光 < 烟 < 间）
        assert_eq!(groups[0].ending, "光");
        assert_eq!(groups[0].count, 1);
        assert_eq!(groups[2].ending, "间");
    }
}
