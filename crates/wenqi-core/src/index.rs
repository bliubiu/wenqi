use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// 节点位置
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// 节点数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeData {
    pub id: String,
    pub position: NodePosition,
}

/// KD-Tree 节点
struct KdNode {
    data: NodeData,
    left: Option<Box<KdNode>>,
    right: Option<Box<KdNode>>,
    axis: usize,
}

/// 空间索引
#[wasm_bindgen]
pub struct SpatialIndex {
    nodes: Vec<NodeData>,
    root: Option<Box<KdNode>>,
}

#[wasm_bindgen]
impl SpatialIndex {
    /// 创建新的空间索引
    #[wasm_bindgen(constructor)]
    pub fn new() -> SpatialIndex {
        SpatialIndex {
            nodes: Vec::new(),
            root: None,
        }
    }

    /// 构建索引（原生兼容版本，返回错误字符串而非 JsValue）
    fn build_index_from_json(&mut self, nodes_json: &str) -> Result<(), String> {
        let nodes: Vec<NodeData> = serde_json::from_str(nodes_json)
            .map_err(|e| format!("解析节点数据失败: {}", e))?;

        self.nodes = nodes;
        self.root = if self.nodes.is_empty() {
            None
        } else {
            Some(Self::build_kdtree(self.nodes.clone(), 0))
        };

        Ok(())
    }

    /// 构建索引（WASM 接口）
    #[wasm_bindgen(js_name = buildIndex)]
    pub fn build_index(&mut self, nodes_json: &str) -> Result<(), JsValue> {
        self.build_index_from_json(nodes_json)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// 构建 KD-Tree
    fn build_kdtree(nodes: Vec<NodeData>, depth: usize) -> Box<KdNode> {
        if nodes.is_empty() {
            return Box::new(KdNode {
                data: NodeData {
                    id: String::new(),
                    position: NodePosition { x: 0.0, y: 0.0, z: 0.0 },
                },
                left: None,
                right: None,
                axis: depth % 3,
            });
        }

        if nodes.len() == 1 {
            let node = nodes.into_iter().next().unwrap();
            return Box::new(KdNode {
                data: node,
                left: None,
                right: None,
                axis: depth % 3,
            });
        }

        let axis = depth % 3;
        let mut sorted = nodes;
        sorted.sort_by(|a, b| {
            let val_a = match axis {
                0 => a.position.x,
                1 => a.position.y,
                _ => a.position.z,
            };
            let val_b = match axis {
                0 => b.position.x,
                1 => b.position.y,
                _ => b.position.z,
            };
            val_a.partial_cmp(&val_b).unwrap()
        });

        let mid = sorted.len() / 2;
        let right_part = sorted.split_off(mid);
        let left_nodes = sorted;

        let median = right_part[0].clone();

        Box::new(KdNode {
            data: median,
            left: if left_nodes.is_empty() {
                None
            } else {
                Some(Self::build_kdtree(left_nodes, depth + 1))
            },
            right: if right_part.len() <= 1 {
                None
            } else {
                Some(Self::build_kdtree(right_part[1..].to_vec(), depth + 1))
            },
            axis,
        })
    }

    /// 查询半径内的节点（返回 ID 列表，可用于 WASM 和原生测试）
    fn query_nearby_ids(&self, x: f64, y: f64, z: f64, radius: f64) -> Vec<String> {
        let target = NodePosition { x, y, z };
        let mut result = Vec::new();

        if let Some(ref root) = self.root {
            Self::range_search(root, target, radius, &mut result);
        }

        result
    }

    /// 查询半径内的节点（WASM 接口）
    #[wasm_bindgen(js_name = queryNearby)]
    pub fn query_nearby(&self, x: f64, y: f64, z: f64, radius: f64) -> Result<JsValue, JsValue> {
        let result = self.query_nearby_ids(x, y, z, radius);
        serde_json::to_string(&result)
            .map(JsValue::from)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 范围搜索
    fn range_search(node: &KdNode, target: NodePosition, radius: f64, result: &mut Vec<String>) {
        let dist = Self::distance(&node.data.position, &target);

        if dist <= radius {
            result.push(node.data.id.clone());
        }

        let axis = node.axis;
        let diff = match axis {
            0 => target.x - node.data.position.x,
            1 => target.y - node.data.position.y,
            _ => target.z - node.data.position.z,
        };

        let (near, far) = if diff < 0.0 {
            (&node.left, &node.right)
        } else {
            (&node.right, &node.left)
        };

        if let Some(ref near) = near {
            Self::range_search(near, target, radius, result);
        }

        if diff.abs() <= radius {
            if let Some(ref far) = far {
                Self::range_search(far, target, radius, result);
            }
        }
    }

    /// K 近邻查询（返回 ID 列表，可用于 WASM 和原生测试）
    fn query_knn_ids(&self, x: f64, y: f64, z: f64, k: usize) -> Vec<String> {
        if k == 0 { return Vec::new(); }
        let target = NodePosition { x, y, z };
        let mut heap: Vec<(f64, String)> = Vec::new();

        if let Some(ref root) = self.root {
            Self::knn_search(root, target, k, &mut heap);
        }

        heap.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        heap.into_iter().map(|(_, id)| id).collect()
    }

    /// K 近邻查询（WASM 接口）
    #[wasm_bindgen(js_name = queryKnn)]
    pub fn query_knn(&self, x: f64, y: f64, z: f64, k: usize) -> Result<JsValue, JsValue> {
        let result = self.query_knn_ids(x, y, z, k);
        serde_json::to_string(&result)
            .map(JsValue::from)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// KNN 搜索
    fn knn_search(node: &KdNode, target: NodePosition, k: usize, heap: &mut Vec<(f64, String)>) {
        let dist = Self::distance(&node.data.position, &target);

        if heap.len() < k {
            heap.push((dist, node.data.id.clone()));
            heap.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else if dist < heap[0].0 {
            heap[0] = (dist, node.data.id.clone());
            heap.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        }

        let axis = node.axis;
        let diff = match axis {
            0 => target.x - node.data.position.x,
            1 => target.y - node.data.position.y,
            _ => target.z - node.data.position.z,
        };

        let (near, far) = if diff < 0.0 {
            (&node.left, &node.right)
        } else {
            (&node.right, &node.left)
        };

        if let Some(ref near) = near {
            Self::knn_search(near, target, k, heap);
        }

        let worst_dist = if heap.len() >= k { heap[0].0 } else { f64::INFINITY };
        if diff.abs() < worst_dist || heap.len() < k {
            if let Some(ref far) = far {
                Self::knn_search(far, target, k, heap);
            }
        }
    }

    /// 计算两点距离
    fn distance(a: &NodePosition, b: &NodePosition) -> f64 {
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    /// 获取节点数量
    #[wasm_bindgen(js_name = nodeCount)]
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spatial_index_creation() {
        let index = SpatialIndex::new();
        assert_eq!(index.node_count(), 0);
    }

    #[test]
    fn test_build_index() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "1", "position": {"x": 0.0, "y": 0.0, "z": 0.0}},
            {"id": "2", "position": {"x": 1.0, "y": 1.0, "z": 1.0}},
            {"id": "3", "position": {"x": 2.0, "y": 2.0, "z": 2.0}}
        ]"#;

        assert!(index.build_index_from_json(nodes).is_ok());
        assert_eq!(index.node_count(), 3);
    }

    #[test]
    fn test_build_empty_index() {
        let mut index = SpatialIndex::new();
        let result = index.build_index_from_json("[]");
        assert!(result.is_ok());
        assert_eq!(index.node_count(), 0);
    }

    #[test]
    fn test_build_invalid_json() {
        let mut index = SpatialIndex::new();
        let result = index.build_index_from_json("invalid json");
        assert!(result.is_err());
    }

    #[test]
    fn test_build_single_node() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "only", "position": {"x": 5.0, "y": -3.0, "z": 2.0}}
        ]"#;
        index.build_index_from_json(nodes).unwrap();
        assert_eq!(index.node_count(), 1);
        let ids = index.query_nearby_ids(5.0, -3.0, 2.0, 0.01);
        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0], "only");
    }

    #[test]
    fn test_query_nearby() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "near_1", "position": {"x": 0.0, "y": 0.0, "z": 0.0}},
            {"id": "near_2", "position": {"x": 1.0, "y": 0.0, "z": 0.0}},
            {"id": "far_1", "position": {"x": 100.0, "y": 100.0, "z": 100.0}}
        ]"#;
        index.build_index_from_json(nodes).unwrap();

        let ids = index.query_nearby_ids(0.0, 0.0, 0.0, 2.0);
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"near_1".to_string()));
        assert!(ids.contains(&"near_2".to_string()));
        assert!(!ids.contains(&"far_1".to_string()));
    }

    #[test]
    fn test_query_nearby_empty_index() {
        let index = SpatialIndex::new();
        let ids = index.query_nearby_ids(0.0, 0.0, 0.0, 100.0);
        assert!(ids.is_empty());
    }

    #[test]
    fn test_query_nearby_exact_hit() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "a", "position": {"x": 0.0, "y": 0.0, "z": 0.0}},
            {"id": "b", "position": {"x": 3.0, "y": 4.0, "z": 0.0}},
            {"id": "c", "position": {"x": 1.0, "y": 1.0, "z": 1.0}}
        ]"#;
        index.build_index_from_json(nodes).unwrap();

        // distance from (0,0,0) to (3,4,0) = 5
        let ids = index.query_nearby_ids(0.0, 0.0, 0.0, 5.0);
        assert_eq!(ids.len(), 3);
    }

    #[test]
    fn test_query_knn() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "a", "position": {"x": 0.0, "y": 0.0, "z": 0.0}},
            {"id": "b", "position": {"x": 1.0, "y": 0.0, "z": 0.0}},
            {"id": "c", "position": {"x": 10.0, "y": 0.0, "z": 0.0}},
            {"id": "d", "position": {"x": 20.0, "y": 0.0, "z": 0.0}}
        ]"#;
        index.build_index_from_json(nodes).unwrap();

        let ids = index.query_knn_ids(0.0, 0.0, 0.0, 2);
        assert_eq!(ids.len(), 2);
        assert_eq!(ids[0], "a");
        assert_eq!(ids[1], "b");
    }

    #[test]
    fn test_query_knn_empty_index() {
        let index = SpatialIndex::new();
        let ids = index.query_knn_ids(0.0, 0.0, 0.0, 5);
        assert!(ids.is_empty());
    }

    #[test]
    fn test_query_knn_k_larger_than_node_count() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "a", "position": {"x": 0.0, "y": 0.0, "z": 0.0}},
            {"id": "b", "position": {"x": 1.0, "y": 0.0, "z": 0.0}}
        ]"#;
        index.build_index_from_json(nodes).unwrap();

        let ids = index.query_knn_ids(0.0, 0.0, 0.0, 10);
        assert_eq!(ids.len(), 2); // 只能返回 2 个
    }

    #[test]
    fn test_query_knn_k_zero_returns_empty() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "a", "position": {"x": 0.0, "y": 0.0, "z": 0.0}}
        ]"#;
        index.build_index_from_json(nodes).unwrap();
        let ids = index.query_knn_ids(0.0, 0.0, 0.0, 0);
        assert!(ids.is_empty());
    }

    #[test]
    fn test_node_count_after_build() {
        let mut index = SpatialIndex::new();
        let nodes = r#"[
            {"id": "1", "position": {"x": 0.0, "y": 0.0, "z": 0.0}}
        ]"#;
        index.build_index_from_json(nodes).unwrap();
        assert_eq!(index.node_count(), 1);
    }

    #[test]
    fn test_distance_calculation() {
        let a = NodePosition { x: 0.0, y: 0.0, z: 0.0 };
        let b = NodePosition { x: 3.0, y: 4.0, z: 0.0 };
        let d = SpatialIndex::distance(&a, &b);
        assert!((d - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_distance_same_point() {
        let a = NodePosition { x: 1.0, y: 2.0, z: 3.0 };
        let d = SpatialIndex::distance(&a, &a);
        assert_eq!(d, 0.0);
    }
}
