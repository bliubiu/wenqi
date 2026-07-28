use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::codec;

/// 节点数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterNode {
    pub id: String,
    pub dynasty: String,
    pub genre: Option<String>,
    pub position: ClusterPosition,
    pub popularity: f64,
}

/// 节点位置
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ClusterPosition {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// 气团
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QiCluster {
    pub id: String,
    pub dimension: String,
    pub key: String,
    pub label: String,
    pub center: ClusterPosition,
    pub density: f64,
    pub color: String,
    pub node_count: usize,
}

/// 朝代色彩映射
const DYNASTY_COLORS: &[(&str, &str)] = &[
    ("PRE_QIN", "#3A4A5C"),
    ("HAN", "#8B7355"),
    ("WEI_JIN", "#6FAE8E"),
    ("TANG", "#D4A24C"),
    ("SONG", "#7BA7D9"),
    ("YUAN", "#B5523E"),
    ("MING", "#C9866B"),
    ("QING", "#8C6FAE"),
    ("MODERN", "#5A8C7A"),
];

/// 体裁色彩映射
const GENRE_COLORS: &[(&str, &str)] = &[
    ("SHI", "#D4A24C"),
    ("CI", "#7BA7D9"),
    ("QU", "#B5523E"),
    ("FU", "#6FAE8E"),
    ("WEN", "#8C6FAE"),
    ("XIAOSHUO", "#5A8C7A"),
];

/// 聚类服务
#[wasm_bindgen]
pub struct ClusterService;

#[wasm_bindgen]
impl ClusterService {
    /// 按维度聚类（JSON 格式）
    #[wasm_bindgen(js_name = clusterBy)]
    pub fn cluster_by(nodes_json: &str, dimension: &str) -> Result<JsValue, JsValue> {
        let nodes: Vec<ClusterNode> = serde_json::from_str(nodes_json)
            .map_err(|e| JsValue::from_str(&format!("解析节点数据失败: {}", e)))?;

        let clusters = match dimension {
            "DYNASTY" => Self::cluster_by_dynasty(&nodes),
            "GENRE" => Self::cluster_by_genre(&nodes),
            _ => return Err(JsValue::from_str("不支持的聚类维度")),
        };

        serde_json::to_string(&clusters)
            .map(JsValue::from)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 按维度聚类（bincode 二进制格式）
    #[wasm_bindgen(js_name = clusterByBinary)]
    pub fn cluster_by_binary(nodes_bytes: &[u8], dimension: &str) -> Result<Vec<u8>, JsValue> {
        let nodes: Vec<ClusterNode> = codec::deserialize_binary(nodes_bytes)
            .map_err(|e| JsValue::from_str(&e))?;

        let clusters = match dimension {
            "DYNASTY" => Self::cluster_by_dynasty(&nodes),
            "GENRE" => Self::cluster_by_genre(&nodes),
            _ => return Err(JsValue::from_str("不支持的聚类维度")),
        };

        codec::serialize_binary(&clusters)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// 按朝代聚类
    fn cluster_by_dynasty(nodes: &[ClusterNode]) -> Vec<QiCluster> {
        let mut groups: HashMap<String, Vec<&ClusterNode>> = HashMap::new();

        for node in nodes {
            groups
                .entry(node.dynasty.clone())
                .or_insert_with(Vec::new)
                .push(node);
        }

        groups
            .into_iter()
            .map(|(key, group)| {
                let center = Self::compute_center(&group);
                let density = Self::compute_density(&group);
                let color = DYNASTY_COLORS
                    .iter()
                    .find(|(k, _)| *k == key)
                    .map(|(_, c)| c.to_string())
                    .unwrap_or_else(|| "#888888".to_string());

                QiCluster {
                    id: format!("dynasty_{}", key),
                    dimension: "DYNASTY".to_string(),
                    key: key.clone(),
                    label: Self::dynasty_label(&key),
                    center,
                    density,
                    color,
                    node_count: group.len(),
                }
            })
            .collect()
    }

    /// 按体裁聚类
    fn cluster_by_genre(nodes: &[ClusterNode]) -> Vec<QiCluster> {
        let mut groups: HashMap<String, Vec<&ClusterNode>> = HashMap::new();

        for node in nodes {
            if let Some(ref genre) = node.genre {
                groups
                    .entry(genre.clone())
                    .or_insert_with(Vec::new)
                    .push(node);
            }
        }

        groups
            .into_iter()
            .map(|(key, group)| {
                let center = Self::compute_center(&group);
                let density = Self::compute_density(&group);
                let color = GENRE_COLORS
                    .iter()
                    .find(|(k, _)| *k == key)
                    .map(|(_, c)| c.to_string())
                    .unwrap_or_else(|| "#888888".to_string());

                QiCluster {
                    id: format!("genre_{}", key),
                    dimension: "GENRE".to_string(),
                    key: key.clone(),
                    label: Self::genre_label(&key),
                    center,
                    density,
                    color,
                    node_count: group.len(),
                }
            })
            .collect()
    }

    /// 计算气团中心
    fn compute_center(nodes: &[&ClusterNode]) -> ClusterPosition {
        if nodes.is_empty() {
            return ClusterPosition {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            };
        }

        let sum = nodes.iter().fold((0.0, 0.0, 0.0), |acc, node| {
            (
                acc.0 + node.position.x,
                acc.1 + node.position.y,
                acc.2 + node.position.z,
            )
        });

        let n = nodes.len() as f64;
        ClusterPosition {
            x: sum.0 / n,
            y: sum.1 / n,
            z: sum.2 / n,
        }
    }

    /// 计算气团密度（基于节点数量与平均人气，考虑空间紧凑度）
    fn compute_density(nodes: &[&ClusterNode]) -> f64 {
        if nodes.is_empty() {
            return 0.0;
        }

        let n = nodes.len() as f64;
        let total_popularity: f64 = nodes.iter().map(|n| n.popularity).sum();
        let avg_popularity = total_popularity / n;

        // 计算空间紧凑度：节点到中心的平均距离倒数
        let center = Self::compute_center(nodes);
        let avg_dist: f64 = nodes.iter()
            .map(|node| {
                let dx = node.position.x - center.x;
                let dy = node.position.y - center.y;
                let dz = node.position.z - center.z;
                (dx * dx + dy * dy + dz * dz).sqrt()
            })
            .sum::<f64>() / n;

        let compactness = if avg_dist > 0.0 { 1.0 / (1.0 + avg_dist) } else { 1.0 };

        // 密度 = 节点数 * 平均人气 * 空间紧凑度
        (n * avg_popularity * compactness / 100.0).min(100.0)
    }

    /// 朝代标签
    fn dynasty_label(code: &str) -> String {
        match code {
            "PRE_QIN" => "先秦".to_string(),
            "HAN" => "汉".to_string(),
            "WEI_JIN" => "魏晋南北朝".to_string(),
            "TANG" => "唐".to_string(),
            "SONG" => "宋".to_string(),
            "YUAN" => "元".to_string(),
            "MING" => "明".to_string(),
            "QING" => "清".to_string(),
            "MODERN" => "近现代".to_string(),
            _ => code.to_string(),
        }
    }

    /// 体裁标签
    fn genre_label(code: &str) -> String {
        match code {
            "SHI" => "诗".to_string(),
            "CI" => "词".to_string(),
            "QU" => "曲".to_string(),
            "FU" => "赋".to_string(),
            "WEN" => "文".to_string(),
            "XIAOSHUO" => "小说".to_string(),
            _ => code.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cluster_by_dynasty_native() {
        let nodes = vec![
            ClusterNode {
                id: "1".to_string(),
                dynasty: "TANG".to_string(),
                genre: None,
                position: ClusterPosition { x: 0.0, y: 0.0, z: 0.0 },
                popularity: 80.0,
            },
            ClusterNode {
                id: "2".to_string(),
                dynasty: "TANG".to_string(),
                genre: None,
                position: ClusterPosition { x: 1.0, y: 1.0, z: 1.0 },
                popularity: 70.0,
            },
            ClusterNode {
                id: "3".to_string(),
                dynasty: "SONG".to_string(),
                genre: None,
                position: ClusterPosition { x: 2.0, y: 2.0, z: 2.0 },
                popularity: 60.0,
            },
        ];

        let clusters = ClusterService::cluster_by_dynasty(&nodes);
        assert_eq!(clusters.len(), 2);
    }

    #[test]
    fn test_cluster_by_genre_native() {
        let nodes = vec![
            ClusterNode {
                id: "1".to_string(),
                dynasty: "TANG".to_string(),
                genre: Some("SHI".to_string()),
                position: ClusterPosition { x: 0.0, y: 0.0, z: 0.0 },
                popularity: 80.0,
            },
            ClusterNode {
                id: "2".to_string(),
                dynasty: "TANG".to_string(),
                genre: Some("CI".to_string()),
                position: ClusterPosition { x: 1.0, y: 1.0, z: 1.0 },
                popularity: 70.0,
            },
        ];

        let clusters = ClusterService::cluster_by_genre(&nodes);
        assert_eq!(clusters.len(), 2);
    }

    #[test]
    fn test_cluster_by_dynasty_empty() {
        let nodes: Vec<ClusterNode> = vec![];
        let clusters = ClusterService::cluster_by_dynasty(&nodes);
        assert!(clusters.is_empty());
    }

    #[test]
    fn test_cluster_by_genre_empty() {
        let nodes: Vec<ClusterNode> = vec![];
        let clusters = ClusterService::cluster_by_genre(&nodes);
        assert!(clusters.is_empty());
    }

    #[test]
    fn test_cluster_by_genre_none_genre_ignored() {
        let nodes = vec![
            ClusterNode {
                id: "1".to_string(), dynasty: "TANG".to_string(), genre: None,
                position: ClusterPosition { x: 0.0, y: 0.0, z: 0.0 }, popularity: 80.0,
            },
        ];
        let clusters = ClusterService::cluster_by_genre(&nodes);
        assert!(clusters.is_empty());
    }

    #[test]
    fn test_cluster_color_for_known_dynasty() {
        let nodes = vec![
            ClusterNode {
                id: "1".to_string(), dynasty: "TANG".to_string(), genre: None,
                position: ClusterPosition { x: 0.0, y: 0.0, z: 0.0 }, popularity: 50.0,
            },
        ];
        let clusters = ClusterService::cluster_by_dynasty(&nodes);
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].color, "#D4A24C");
        assert_eq!(clusters[0].label, "唐");
    }

    #[test]
    fn test_cluster_color_unknown_dynasty() {
        let nodes = vec![
            ClusterNode {
                id: "1".to_string(), dynasty: "FOREIGN".to_string(), genre: None,
                position: ClusterPosition { x: 0.0, y: 0.0, z: 0.0 }, popularity: 50.0,
            },
        ];
        let clusters = ClusterService::cluster_by_dynasty(&nodes);
        assert_eq!(clusters[0].color, "#888888");
        assert_eq!(clusters[0].label, "FOREIGN");
    }

    #[test]
    fn test_compute_center_empty() {
        let nodes: Vec<&ClusterNode> = vec![];
        let center = ClusterService::compute_center(&nodes);
        assert_eq!(center.x, 0.0);
        assert_eq!(center.y, 0.0);
        assert_eq!(center.z, 0.0);
    }

    #[test]
    fn test_compute_center_multiple_nodes() {
        let nodes = vec![
            ClusterNode {
                id: "1".to_string(), dynasty: "TANG".to_string(), genre: None,
                position: ClusterPosition { x: 1.0, y: 2.0, z: 3.0 }, popularity: 50.0,
            },
            ClusterNode {
                id: "2".to_string(), dynasty: "TANG".to_string(), genre: None,
                position: ClusterPosition { x: 3.0, y: 4.0, z: 5.0 }, popularity: 50.0,
            },
        ];
        let refs: Vec<&ClusterNode> = nodes.iter().collect();
        let center = ClusterService::compute_center(&refs);
        assert!((center.x - 2.0).abs() < 0.001);
        assert!((center.y - 3.0).abs() < 0.001);
        assert!((center.z - 4.0).abs() < 0.001);
    }

    #[test]
    fn test_compute_density_empty() {
        let nodes: Vec<&ClusterNode> = vec![];
        let density = ClusterService::compute_density(&nodes);
        assert_eq!(density, 0.0);
    }

    #[test]
    fn test_compute_density_same_position() {
        let nodes = vec![
            ClusterNode {
                id: "1".to_string(), dynasty: "TANG".to_string(), genre: None,
                position: ClusterPosition { x: 0.0, y: 0.0, z: 0.0 }, popularity: 100.0,
            },
            ClusterNode {
                id: "2".to_string(), dynasty: "TANG".to_string(), genre: None,
                position: ClusterPosition { x: 0.0, y: 0.0, z: 0.0 }, popularity: 100.0,
            },
        ];
        let refs: Vec<&ClusterNode> = nodes.iter().collect();
        let density = ClusterService::compute_density(&refs);
        // compactness = 1 (avg_dist = 0), density = 2 * 100 * 1 / 100 = 2
        assert!((density - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_dynasty_labels_all_codes() {
        assert_eq!(ClusterService::dynasty_label("PRE_QIN"), "先秦");
        assert_eq!(ClusterService::dynasty_label("HAN"), "汉");
        assert_eq!(ClusterService::dynasty_label("WEI_JIN"), "魏晋南北朝");
        assert_eq!(ClusterService::dynasty_label("TANG"), "唐");
        assert_eq!(ClusterService::dynasty_label("SONG"), "宋");
        assert_eq!(ClusterService::dynasty_label("YUAN"), "元");
        assert_eq!(ClusterService::dynasty_label("MING"), "明");
        assert_eq!(ClusterService::dynasty_label("QING"), "清");
        assert_eq!(ClusterService::dynasty_label("MODERN"), "近现代");
        assert_eq!(ClusterService::dynasty_label("UNKNOWN"), "UNKNOWN");
    }

    #[test]
    fn test_genre_labels_all_codes() {
        assert_eq!(ClusterService::genre_label("SHI"), "诗");
        assert_eq!(ClusterService::genre_label("CI"), "词");
        assert_eq!(ClusterService::genre_label("QU"), "曲");
        assert_eq!(ClusterService::genre_label("FU"), "赋");
        assert_eq!(ClusterService::genre_label("WEN"), "文");
        assert_eq!(ClusterService::genre_label("XIAOSHUO"), "小说");
        assert_eq!(ClusterService::genre_label("OTHER"), "OTHER");
    }
}
