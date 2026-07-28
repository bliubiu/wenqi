use wenqi_core::*;
use wenqi_core::index::SpatialIndex;
use wenqi_core::search::{SearchEngine, SearchResult};
use wenqi_core::scoring::ScoringService;
use wenqi_core::clustering::{ClusterService, QiCluster};
use wasm_bindgen_test::*;
use serde_json;

// ─── lib.rs 顶层导出 ─────────────────────────────────

#[wasm_bindgen_test]
fn wasm_version_not_empty() {
    let v = version();
    assert!(!v.is_empty(), "version() 不应为空");
}

#[wasm_bindgen_test]
fn wasm_algorithm_version() {
    assert_eq!(algorithm_version(), "v1.0");
}

// ─── SpatialIndex ────────────────────────────────────

#[wasm_bindgen_test]
fn wasm_spatial_index_build_and_query() {
    let mut index = SpatialIndex::new();
    let nodes = r#"[
        {"id": "a", "position": {"x": 0.0, "y": 0.0, "z": 0.0}},
        {"id": "b", "position": {"x": 1.0, "y": 0.0, "z": 0.0}},
        {"id": "c", "position": {"x": 100.0, "y": 100.0, "z": 100.0}}
    ]"#;

    index.build_index(nodes).unwrap();
    assert_eq!(index.node_count(), 3);

    // 半径查询
    let nearby = index.query_nearby(0.0, 0.0, 0.0, 2.0).unwrap();
    let nearby_ids: Vec<String> = serde_json::from_str(&nearby.as_string().unwrap()).unwrap();
    assert_eq!(nearby_ids.len(), 2);
    assert!(nearby_ids.contains(&"a".to_string()));
    assert!(nearby_ids.contains(&"b".to_string()));

    // KNN 查询
    let knn = index.query_knn(0.0, 0.0, 0.0, 2).unwrap();
    let knn_ids: Vec<String> = serde_json::from_str(&knn.as_string().unwrap()).unwrap();
    assert_eq!(knn_ids, vec!["a".to_string(), "b".to_string()]);
}

#[wasm_bindgen_test]
fn wasm_spatial_index_empty() {
    let mut index = SpatialIndex::new();
    index.build_index("[]").unwrap();
    assert_eq!(index.node_count(), 0);

    let result = index.query_nearby(0.0, 0.0, 0.0, 10.0).unwrap();
    let ids: Vec<String> = serde_json::from_str(&result.as_string().unwrap()).unwrap();
    assert!(ids.is_empty());
}

#[wasm_bindgen_test]
fn wasm_spatial_index_build_invalid_json() {
    let mut index = SpatialIndex::new();
    let result = index.build_index("not json");
    assert!(result.is_err());
}

// ─── SearchEngine ────────────────────────────────────

#[wasm_bindgen_test]
fn wasm_search_engine_build_and_search() {
    let mut engine = SearchEngine::new();
    let corpus = r#"[
        {"id":"1","ref_type":"POET","ref_id":"p1","title":"李白","content":"床前明月光","dynasty":"TANG","genre":"SHI"},
        {"id":"2","ref_type":"POET","ref_id":"p2","title":"杜甫","content":"国破山河在","dynasty":"TANG","genre":"SHI"}
    ]"#;

    engine.build_index(corpus).unwrap();
    assert_eq!(engine.document_count(), 2);
    assert!(engine.index_size() > 0);

    let options = r#"{"limit":10,"scope":"ALL","dynasty":null,"genre":null}"#;
    let result = engine.search("李白", options).unwrap();
    let search_result: SearchResult = serde_json::from_str(&result.as_string().unwrap()).unwrap();
    assert_eq!(search_result.total, 1);
    assert_eq!(search_result.items[0].ref_id, "p1");
}

#[wasm_bindgen_test]
fn wasm_search_fuzzy_match() {
    let mut engine = SearchEngine::new();
    let corpus = r#"[
        {"id":"1","ref_type":"POET","ref_id":"p1","title":"李白","content":"静夜思","dynasty":"TANG","genre":"SHI"}
    ]"#;
    engine.build_index(corpus).unwrap();

    let result = engine.fuzzy_match("李白").unwrap();
    let search_result: SearchResult = serde_json::from_str(&result.as_string().unwrap()).unwrap();
    assert_eq!(search_result.items[0].ref_id, "p1");
}

#[wasm_bindgen_test]
fn wasm_search_build_invalid_json() {
    let mut engine = SearchEngine::new();
    let result = engine.build_index("not json");
    assert!(result.is_err());
}

// ─── ScoringService ──────────────────────────────────

#[wasm_bindgen_test]
fn wasm_scoring_score_poet() {
    let service = ScoringService::new();
    let poet_json = r#"{"id":"poet_1","name":"李白","dynasty":"TANG","biography":"唐代诗人","work_count":10}"#;
    let works_json = r#"[{"id":"w1","title":"静夜思","poet_id":"poet_1","poet_name":"李白","dynasty":"TANG","genre":"SHI","text":"床前明月光"}]"#;

    let result = service.score_poet(poet_json, works_json).unwrap();
    let result_str = result.as_string().unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result_str).unwrap();

    assert_eq!(parsed["poet_id"], "poet_1");
    assert!(parsed["three_qi"]["talent"]["value"].as_f64().unwrap() >= 0.0);
    assert!(parsed["three_qi"]["popularity"]["value"].as_f64().unwrap() >= 0.0);
    assert!(parsed["three_qi"]["luck"]["value"].as_f64().unwrap() >= -50.0);
}

#[wasm_bindgen_test]
fn wasm_scoring_score_batch() {
    let service = ScoringService::new();
    let poets_json = r#"[
        {"id":"p1","name":"李白","dynasty":"TANG","biography":"唐代诗人","work_count":10},
        {"id":"p2","name":"杜甫","dynasty":"TANG","biography":"诗圣","work_count":50}
    ]"#;
    let works_json = r#"[
        {"id":"w1","title":"静夜思","poet_id":"p1","poet_name":"李白","dynasty":"TANG","genre":"SHI","text":"床前明月光"},
        {"id":"w2","title":"春望","poet_id":"p2","poet_name":"杜甫","dynasty":"TANG","genre":"SHI","text":"国破山河在"}
    ]"#;

    let result = service.score_batch(poets_json, works_json).unwrap();
    let results: Vec<serde_json::Value> = serde_json::from_str(&result.as_string().unwrap()).unwrap();
    assert_eq!(results.len(), 2);
}

#[wasm_bindgen_test]
fn wasm_scoring_invalid_input() {
    let service = ScoringService::new();

    let err = service.score_poet("not json", "[]");
    assert!(err.is_err());

    let err2 = service.score_batch("not json", "[]");
    assert!(err2.is_err());
}

#[wasm_bindgen_test]
fn wasm_scoring_algorithm_version() {
    let service = ScoringService::new();
    assert_eq!(service.algorithm_version(), "v1.0");
}

// ─── ClusterService ──────────────────────────────────

#[wasm_bindgen_test]
fn wasm_cluster_by_dynasty() {
    let nodes = r#"[
        {"id":"1","dynasty":"TANG","genre":null,"position":{"x":0,"y":0,"z":0},"popularity":80},
        {"id":"2","dynasty":"TANG","genre":null,"position":{"x":1,"y":1,"z":1},"popularity":70},
        {"id":"3","dynasty":"SONG","genre":null,"position":{"x":2,"y":2,"z":2},"popularity":60}
    ]"#;

    let result = ClusterService::cluster_by(nodes, "DYNASTY").unwrap();
    let clusters: Vec<QiCluster> = serde_json::from_str(&result.as_string().unwrap()).unwrap();
    assert_eq!(clusters.len(), 2);
}

#[wasm_bindgen_test]
fn wasm_cluster_by_genre() {
    let nodes = r#"[
        {"id":"1","dynasty":"TANG","genre":"SHI","position":{"x":0,"y":0,"z":0},"popularity":80},
        {"id":"2","dynasty":"TANG","genre":"CI","position":{"x":1,"y":1,"z":1},"popularity":70}
    ]"#;

    let result = ClusterService::cluster_by(nodes, "GENRE").unwrap();
    let clusters: Vec<QiCluster> = serde_json::from_str(&result.as_string().unwrap()).unwrap();
    assert_eq!(clusters.len(), 2);
}

#[wasm_bindgen_test]
fn wasm_cluster_invalid_dimension() {
    let result = ClusterService::cluster_by("[]", "INVALID");
    assert!(result.is_err());
}

#[wasm_bindgen_test]
fn wasm_cluster_invalid_json() {
    let result = ClusterService::cluster_by("not json", "DYNASTY");
    assert!(result.is_err());
}
