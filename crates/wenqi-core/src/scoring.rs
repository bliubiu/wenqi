use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::codec;

/// 才气评分
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentScore {
    pub value: f64,
    pub algorithm_version: String,
    pub factors: TalentFactors,
}

/// 才气评分因子
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentFactors {
    pub lexical_uniqueness: f64,
    pub imagery_novelty: f64,
    pub genre_innovation: f64,
}

/// 人气评分
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PopularityScore {
    pub value: f64,
    pub algorithm_version: String,
    pub factors: PopularityFactors,
}

/// 人气评分因子
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PopularityFactors {
    pub citation_count: u32,
    pub textbook_count: u32,
    pub search_heat: f64,
}

/// 运气评分
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LuckScore {
    pub value: f64,
    pub algorithm_version: String,
    pub factors: LuckFactors,
}

/// 运气评分因子
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LuckFactors {
    pub political_environment: f64,
    pub rediscovery_events: f64,
}

/// 三气合一
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeQi {
    pub talent: TalentScore,
    pub popularity: PopularityScore,
    pub luck: LuckScore,
    pub algorithm_version: String,
}

/// 诗人数据（用于评分）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoetForScoring {
    pub id: String,
    pub name: String,
    pub dynasty: String,
    pub biography: String,
    pub work_count: u32,
}

/// 作品数据（用于评分）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkForScoring {
    pub id: String,
    pub title: String,
    pub poet_id: String,
    pub poet_name: String,
    pub dynasty: String,
    pub genre: String,
    pub text: String,
}

/// 评分结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreResult {
    pub poet_id: String,
    pub poet_name: String,
    pub three_qi: ThreeQi,
}

/// 评分服务
#[wasm_bindgen]
pub struct ScoringService {
    algorithm_version: String,
}

#[wasm_bindgen]
impl ScoringService {
    /// 创建评分服务
    #[wasm_bindgen(constructor)]
    pub fn new() -> ScoringService {
        ScoringService {
            algorithm_version: "v1.1".to_string(),
        }
    }

    /// 计算单个诗人的三气评分（JSON 格式）
    #[wasm_bindgen(js_name = scorePoet)]
    pub fn score_poet(&self, poet_json: &str, works_json: &str) -> Result<JsValue, JsValue> {
        let poet: PoetForScoring = serde_json::from_str(poet_json)
            .map_err(|e| JsValue::from_str(&format!("解析诗人数据失败: {}", e)))?;

        let works: Vec<WorkForScoring> = serde_json::from_str(works_json)
            .map_err(|e| JsValue::from_str(&format!("解析作品数据失败: {}", e)))?;

        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let three_qi = self.calculate_three_qi(&poet, &works_refs);

        let result = ScoreResult {
            poet_id: poet.id.clone(),
            poet_name: poet.name.clone(),
            three_qi,
        };

        serde_json::to_string(&result)
            .map(JsValue::from)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 计算单个诗人的三气评分（bincode 二进制格式）
    #[wasm_bindgen(js_name = scorePoetBinary)]
    pub fn score_poet_binary(&self, poet_bytes: &[u8], works_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
        let poet: PoetForScoring = codec::deserialize_binary(poet_bytes)
            .map_err(|e| JsValue::from_str(&e))?;
        let works: Vec<WorkForScoring> = codec::deserialize_binary(works_bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let three_qi = self.calculate_three_qi(&poet, &works_refs);

        let result = ScoreResult {
            poet_id: poet.id.clone(),
            poet_name: poet.name.clone(),
            three_qi,
        };

        codec::serialize_binary(&result)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// 批量计算诗人三气评分（JSON 格式）
    #[wasm_bindgen(js_name = scoreBatch)]
    pub fn score_batch(
        &self,
        poets_json: &str,
        works_json: &str,
    ) -> Result<JsValue, JsValue> {
        let poets: Vec<PoetForScoring> = serde_json::from_str(poets_json)
            .map_err(|e| JsValue::from_str(&format!("解析诗人数据失败: {}", e)))?;

        let all_works: Vec<WorkForScoring> = serde_json::from_str(works_json)
            .map_err(|e| JsValue::from_str(&format!("解析作品数据失败: {}", e)))?;

        // 按诗人ID分组作品
        let mut works_by_poet: HashMap<String, Vec<&WorkForScoring>> = HashMap::new();
        for work in &all_works {
            works_by_poet
                .entry(work.poet_id.clone())
                .or_insert_with(Vec::new)
                .push(work);
        }

        let mut results: Vec<ScoreResult> = Vec::new();

        for poet in &poets {
            let works: Vec<&WorkForScoring> = works_by_poet.get(&poet.id).map(|v| v.iter().map(|w| *w).collect()).unwrap_or_default();
            let three_qi = self.calculate_three_qi(poet, &works);

            results.push(ScoreResult {
                poet_id: poet.id.clone(),
                poet_name: poet.name.clone(),
                three_qi,
            });
        }

        serde_json::to_string(&results)
            .map(JsValue::from)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 批量计算诗人三气评分（bincode 二进制格式）
    /// 适合大数据量传输：输入/输出均为 bincode 编码的 Uint8Array
    #[wasm_bindgen(js_name = scoreBatchBinary)]
    pub fn score_batch_binary(
        &self,
        poets_bytes: &[u8],
        works_bytes: &[u8],
    ) -> Result<Vec<u8>, JsValue> {
        let poets: Vec<PoetForScoring> = codec::deserialize_binary(poets_bytes)
            .map_err(|e| JsValue::from_str(&e))?;
        let all_works: Vec<WorkForScoring> = codec::deserialize_binary(works_bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        let mut works_by_poet: HashMap<String, Vec<&WorkForScoring>> = HashMap::new();
        for work in &all_works {
            works_by_poet
                .entry(work.poet_id.clone())
                .or_insert_with(Vec::new)
                .push(work);
        }

        let mut results: Vec<ScoreResult> = Vec::new();
        for poet in &poets {
            let works: Vec<&WorkForScoring> = works_by_poet.get(&poet.id).map(|v| v.iter().map(|w| *w).collect()).unwrap_or_default();
            let three_qi = self.calculate_three_qi(poet, &works);
            results.push(ScoreResult {
                poet_id: poet.id.clone(),
                poet_name: poet.name.clone(),
                three_qi,
            });
        }

        codec::serialize_binary(&results)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// 计算三气合一
    fn calculate_three_qi(&self, poet: &PoetForScoring, works: &[&WorkForScoring]) -> ThreeQi {
        let talent = self.calculate_talent(poet, works);
        let popularity = self.calculate_popularity(poet, works);
        let luck = self.calculate_luck(poet);

        ThreeQi {
            talent,
            popularity,
            luck,
            algorithm_version: self.algorithm_version.clone(),
        }
    }

    /// 计算才气评分
    fn calculate_talent(&self, _poet: &PoetForScoring, works: &[&WorkForScoring]) -> TalentScore {
        // 用词独特性：基于作品文本的词汇丰富度
        let lexical_uniqueness = self.calculate_lexical_uniqueness(works);

        // 意象新颖度：基于低频词的使用
        let imagery_novelty = self.calculate_imagery_novelty(works);

        // 体裁创新：基于体裁多样性
        let genre_innovation = self.calculate_genre_innovation(works);

        // 加权计算总分
        let value = (lexical_uniqueness * 0.4
            + imagery_novelty * 0.4
            + genre_innovation * 0.2)
            .round()
            .clamp(0.0, 100.0);

        TalentScore {
            value,
            algorithm_version: self.algorithm_version.clone(),
            factors: TalentFactors {
                lexical_uniqueness,
                imagery_novelty,
                genre_innovation,
            },
        }
    }

    /// 计算用词独特性
    fn calculate_lexical_uniqueness(&self, works: &[&WorkForScoring]) -> f64 {
        if works.is_empty() {
            return 0.0;
        }

        // 统计所有作品的字符数和唯一字符数
        let mut total_chars = 0;
        let mut unique_chars = std::collections::HashSet::new();

        for work in works {
            for ch in work.text.chars() {
                if !ch.is_whitespace() && !ch.is_ascii_punctuation()
                    && !matches!(ch, '，' | '。' | '、' | '！' | '？' | '；' | '：' | '“' | '”' | '‘' | '’' | '《' | '》' | '—' | '…' | '·')
                {
                    total_chars += 1;
                    unique_chars.insert(ch);
                }
            }
        }

        if total_chars == 0 {
            return 0.0;
        }

        // 唯一字符比例越高，独特性越高
        let ratio = unique_chars.len() as f64 / total_chars as f64;
        (ratio * 100.0).min(100.0)
    }

    /// 计算意象新颖度
    fn calculate_imagery_novelty(&self, works: &[&WorkForScoring]) -> f64 {
        if works.is_empty() {
            return 0.0;
        }

        // 统计双字符组合（bigram）的频率
        let mut bigram_counts: HashMap<String, u32> = HashMap::new();
        let mut total_bigrams = 0;

        for work in works {
            let chars: Vec<char> = work.text.chars().collect();
            for i in 0..chars.len().saturating_sub(1) {
                if !chars[i].is_whitespace() && !chars[i + 1].is_whitespace() {
                    let bigram = format!("{}{}", chars[i], chars[i + 1]);
                    *bigram_counts.entry(bigram).or_insert(0) += 1;
                    total_bigrams += 1;
                }
            }
        }

        if total_bigrams == 0 {
            return 0.0;
        }

        // 计算低频bigram的比例（出现次数<=2的视为低频）
        let low_freq_count: u32 = bigram_counts
            .values()
            .filter(|&&count| count <= 2)
            .sum();

        let novelty_ratio = low_freq_count as f64 / total_bigrams as f64;
        (novelty_ratio * 100.0).min(100.0)
    }

    /// 计算体裁创新
    fn calculate_genre_innovation(&self, works: &[&WorkForScoring]) -> f64 {
        if works.is_empty() {
            return 0.0;
        }

        // 统计使用的体裁数量
        let mut genres = std::collections::HashSet::new();
        for work in works {
            genres.insert(&work.genre);
        }

        // 体裁越多，创新分数越高
        let genre_count = genres.len() as f64;
        (genre_count * 20.0).min(100.0)
    }

    /// 计算人气评分
    /// 因子：朝代影响力系数（唐=1.5，宋=1.3，现代=1.2，其他=1.0）
    fn calculate_popularity(&self, poet: &PoetForScoring, works: &[&WorkForScoring]) -> PopularityScore {
        let work_count = works.len() as u32;

        let dynasty_multiplier: f64 = match poet.dynasty.as_str() {
            "TANG" => 1.5,
            "SONG" => 1.3,
            "MODERN" => 1.2,
            _ => 1.0,
        };

        let citation_count = (work_count as f64 * dynasty_multiplier).round() as u32;
        let textbook_count = (work_count as f64 * 0.05) as u32;
        let search_heat = (poet.biography.len() as f64 / 20.0).min(100.0);

        let raw = citation_count as f64 * 0.5
            + textbook_count as f64 * 0.3
            + search_heat * 0.2;

        let value = raw.min(100.0).round();

        PopularityScore {
            value,
            algorithm_version: self.algorithm_version.clone(),
            factors: PopularityFactors {
                citation_count,
                textbook_count,
                search_heat,
            },
        }
    }

    /// 计算运气评分
    fn calculate_luck(&self, poet: &PoetForScoring) -> LuckScore {
        let political_environment = match poet.dynasty.as_str() {
            "TANG" => 15.0,
            "SONG" => 10.0,
            "WEI_JIN" => 8.0,
            "HAN" => 8.0,
            "PRE_QIN" => 5.0,
            "FIVE_DYNASTIES" => 3.0,
            "YUAN" => -5.0,
            "MING" => 5.0,
            "QING" => 2.0,
            "MODERN" => -3.0,
            _ => 0.0,
        };

        let rediscovery_events = (poet.work_count as f64 / 20.0).clamp(-25.0, 25.0);

        let value = (political_environment + rediscovery_events)
            .clamp(-50.0, 50.0)
            .round();

        LuckScore {
            value,
            algorithm_version: self.algorithm_version.clone(),
            factors: LuckFactors {
                political_environment,
                rediscovery_events,
            },
        }
    }

    /// 获取算法版本
    #[wasm_bindgen(js_name = algorithmVersion)]
    pub fn algorithm_version(&self) -> String {
        self.algorithm_version.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scoring_service_creation() {
        let service = ScoringService::new();
        assert_eq!(service.algorithm_version(), "v1.1");
    }

    #[test]
    fn test_calculate_talent() {
        let service = ScoringService::new();

        let poet = PoetForScoring {
            id: "poet_1".to_string(),
            name: "李白".to_string(),
            dynasty: "TANG".to_string(),
            biography: "唐代著名诗人".to_string(),
            work_count: 100,
        };

        let works = vec![
            WorkForScoring {
                id: "work_1".to_string(),
                title: "静夜思".to_string(),
                poet_id: "poet_1".to_string(),
                poet_name: "李白".to_string(),
                dynasty: "TANG".to_string(),
                genre: "SHI".to_string(),
                text: "床前明月光，疑是地上霜。举头望明月，低头思故乡。".to_string(),
            }
        ];

        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let talent = service.calculate_talent(&poet, &works_refs);
        assert!(talent.value >= 0.0 && talent.value <= 100.0);
    }

    #[test]
    fn test_calculate_popularity() {
        let service = ScoringService::new();

        let poet = PoetForScoring {
            id: "poet_1".to_string(),
            name: "李白".to_string(),
            dynasty: "TANG".to_string(),
            biography: "唐代著名诗人".to_string(),
            work_count: 100,
        };

        let works = vec![
            WorkForScoring {
                id: "work_1".to_string(),
                title: "静夜思".to_string(),
                poet_id: "poet_1".to_string(),
                poet_name: "李白".to_string(),
                dynasty: "TANG".to_string(),
                genre: "SHI".to_string(),
                text: "床前明月光".to_string(),
            }
        ];

        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let popularity = service.calculate_popularity(&poet, &works_refs);
        assert!(popularity.value >= 0.0 && popularity.value <= 100.0);
    }

    #[test]
    fn test_calculate_luck() {
        let service = ScoringService::new();

        let poet = PoetForScoring {
            id: "poet_1".to_string(),
            name: "李白".to_string(),
            dynasty: "TANG".to_string(),
            biography: "唐代著名诗人".to_string(),
            work_count: 100,
        };

        let luck = service.calculate_luck(&poet);
        assert!(luck.value >= -50.0 && luck.value <= 50.0);
    }

    #[test]
    fn test_talent_empty_works_returns_zero() {
        let service = ScoringService::new();
        let poet = PoetForScoring {
            id: "poet_1".to_string(), name: "佚名".to_string(),
            dynasty: "TANG".to_string(), biography: "".to_string(), work_count: 0,
        };
        let works_refs: Vec<&WorkForScoring> = vec![];
        let talent = service.calculate_talent(&poet, &works_refs);
        assert_eq!(talent.value, 0.0);
        assert_eq!(talent.factors.lexical_uniqueness, 0.0);
        assert_eq!(talent.factors.imagery_novelty, 0.0);
        assert_eq!(talent.factors.genre_innovation, 0.0);
    }

    #[test]
    fn test_popularity_empty_works() {
        let service = ScoringService::new();
        let poet = PoetForScoring {
            id: "poet_1".to_string(), name: "佚名".to_string(),
            dynasty: "TANG".to_string(), biography: "".to_string(), work_count: 0,
        };
        let works_refs: Vec<&WorkForScoring> = vec![];
        let popularity = service.calculate_popularity(&poet, &works_refs);
        assert!(popularity.value >= 0.0);
    }

    #[test]
    fn test_luck_edge_dynasties() {
        let service = ScoringService::new();
        for dynasty in &["PRE_QIN", "TANG", "SONG", "YUAN", "WEI_JIN", "MING", "QING", "MODERN", "UNKNOWN"] {
            let poet = PoetForScoring {
                id: "poet_1".to_string(), name: "诗人".to_string(),
                dynasty: dynasty.to_string(), biography: "".to_string(), work_count: 10,
            };
            let luck = service.calculate_luck(&poet);
            assert!(luck.value >= -50.0 && luck.value <= 50.0,
                "朝代 {} 的运气评分 {} 超出范围", dynasty, luck.value);
        }
    }

    #[test]
    fn test_lexical_uniqueness_varied_text() {
        let service = ScoringService::new();
        let works = vec![
            WorkForScoring {
                id: "w1".to_string(), title: "诗".to_string(), poet_id: "p1".to_string(),
                poet_name: "诗人".to_string(), dynasty: "TANG".to_string(), genre: "SHI".to_string(),
                text: "天地玄黄宇宙洪荒".to_string(), // 8 unique chars, 8 total
            }
        ];
        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let uniqueness = service.calculate_lexical_uniqueness(&works_refs);
        // 8/8 = 1.0 → 100
        assert!((uniqueness - 100.0).abs() < 0.01);
    }

    #[test]
    fn test_lexical_uniqueness_repeated_text() {
        let service = ScoringService::new();
        let works = vec![
            WorkForScoring {
                id: "w1".to_string(), title: "诗".to_string(), poet_id: "p1".to_string(),
                poet_name: "诗人".to_string(), dynasty: "TANG".to_string(), genre: "SHI".to_string(),
                text: "aaa".to_string(), // 3 total, 1 unique → 33.33
            }
        ];
        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let uniqueness = service.calculate_lexical_uniqueness(&works_refs);
        assert!((uniqueness - 33.33).abs() < 0.1);
    }

    #[test]
    fn test_imagery_novelty_known_bigrams() {
        let service = ScoringService::new();
        let works = vec![
            WorkForScoring {
                id: "w1".to_string(), title: "诗".to_string(), poet_id: "p1".to_string(),
                poet_name: "诗人".to_string(), dynasty: "TANG".to_string(), genre: "SHI".to_string(),
                text: "明月明月明月".to_string(), // 重复 bigrams: 明月 × 4, 月明 × 2, 明月 × 1...
            }
        ];
        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let novelty = service.calculate_imagery_novelty(&works_refs);
        assert!(novelty >= 0.0 && novelty <= 100.0);
    }

    #[test]
    fn test_imagery_novelty_empty_works() {
        let service = ScoringService::new();
        let works_refs: Vec<&WorkForScoring> = vec![];
        let novelty = service.calculate_imagery_novelty(&works_refs);
        assert_eq!(novelty, 0.0);
    }

    #[test]
    fn test_genre_innovation_multiple_genres() {
        let service = ScoringService::new();
        let works = vec![
            WorkForScoring {
                id: "w1".to_string(), title: "诗".to_string(), poet_id: "p1".to_string(),
                poet_name: "诗人".to_string(), dynasty: "TANG".to_string(), genre: "SHI".to_string(),
                text: "内容".to_string(),
            },
            WorkForScoring {
                id: "w2".to_string(), title: "词".to_string(), poet_id: "p1".to_string(),
                poet_name: "诗人".to_string(), dynasty: "SONG".to_string(), genre: "CI".to_string(),
                text: "内容".to_string(),
            },
            WorkForScoring {
                id: "w3".to_string(), title: "赋".to_string(), poet_id: "p1".to_string(),
                poet_name: "诗人".to_string(), dynasty: "TANG".to_string(), genre: "FU".to_string(),
                text: "内容".to_string(),
            },
        ];
        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let innovation = service.calculate_genre_innovation(&works_refs);
        // 3 genres × 20 = 60
        assert!((innovation - 60.0).abs() < 0.01);
    }

    #[test]
    fn test_genre_innovation_single_genre() {
        let service = ScoringService::new();
        let works = vec![
            WorkForScoring {
                id: "w1".to_string(), title: "诗".to_string(), poet_id: "p1".to_string(),
                poet_name: "诗人".to_string(), dynasty: "TANG".to_string(), genre: "SHI".to_string(),
                text: "内容".to_string(),
            },
        ];
        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let innovation = service.calculate_genre_innovation(&works_refs);
        assert!((innovation - 20.0).abs() < 0.01);
    }

    #[test]
    fn test_luck_modern_dynasty_negative() {
        let service = ScoringService::new();
        let poet = PoetForScoring {
            id: "p1".to_string(), name: "现代诗人".to_string(),
            dynasty: "MODERN".to_string(), biography: "".to_string(), work_count: 1,
        };
        let luck = service.calculate_luck(&poet);
        assert!(luck.value < 0.0);
    }

    #[test]
    fn test_popularity_score_components() {
        let service = ScoringService::new();
        let poet = PoetForScoring {
            id: "p1".to_string(), name: "大诗人".to_string(),
            dynasty: "TANG".to_string(), biography: "A".repeat(100).to_string(), work_count: 100,
        };
        let works = vec![
            WorkForScoring {
                id: "w1".to_string(), title: "诗".to_string(), poet_id: "p1".to_string(),
                poet_name: "大诗人".to_string(), dynasty: "TANG".to_string(), genre: "SHI".to_string(),
                text: "内容".to_string(),
            },
        ];
        let works_refs: Vec<&WorkForScoring> = works.iter().collect();
        let popularity = service.calculate_popularity(&poet, &works_refs);
        assert!(popularity.factors.citation_count > 0);
        assert!(popularity.factors.search_heat > 0.0);
    }
}
