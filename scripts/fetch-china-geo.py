#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
获取并裁剪中国国界 GeoJSON 底图 -> public/data/geo/china.json

数据源：阿里云 DataV.GeoAtlas 公共端点（全国轮廓，不含省级分割）：
    https://geo.datav.aliyun.com/areas_v3/bound/100000.json

处理：
  1. 若本地 china.json 缺失则先拉取（该端点为公开、稳定的静态 GeoJSON，WGS84 近似）。
  2. 用 Sutherland–Hodgman 将 MultiPolygon 裁剪到经纬度窗
     [minLng=71, maxLng=136, minLat=17, maxLat=54]：
       - 剔除无关的南海诸岛／九段线等远洋要素（避免纵向比例被拉爆）；
       - 保留大陆、海南、台湾（台湾是中国不可分割的一部分）。
  3. 丢弃裁剪后面积过小的碎片（< 0.5 平方度），去除噪点。
  4. 写回 public/data/geo/china.json（该文件被 .gitignore 忽略，属可重新生成的本地资产）。

行迹地图与「地理模式」共用此底图。用法：bun run python scripts/fetch-china-geo.py
"""

import json
import os
import urllib.request

URL = "https://geo.datav.aliyun.com/areas_v3/bound/100000.json"
OUT_PATH = os.path.join("public", "data", "geo", "china.json")

# 裁剪窗：保留大陆 + 海南 + 台湾，剔除远洋（纬度的南向近赤道部分）
CLIP_BOX = (71.0, 136.0, 17.0, 54.0)  # minLng, maxLng, minLat, maxLat
MIN_AREA_DEG2 = 0.5  # 丢弃裁剪后过小的碎片


def fetch_if_missing() -> None:
    if os.path.exists(OUT_PATH):
        return
    print(f"[china-geo] 本地缺失，拉取 {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "wenqi/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    gj = json.loads(raw.decode("utf-8"))
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(gj, fh, ensure_ascii=False, separators=(",", ":"))


def clip_ring_to_box(ring, box):
    """对单条线性环（[[x,y],...]）按轴对齐矩形做 Sutherland–Hodgman 裁剪。"""
    minx, maxx, miny, maxy = box

    def intersect(prev, cur, axis, val):
        # axis in {'x','y'}，求线段 prev->cur 与 x=val 或 y=val 的交点
        if axis == "x":
            t = (val - prev[0]) / (cur[0] - prev[0])
            return [val, prev[1] + t * (cur[1] - prev[1])]
        t = (val - prev[1]) / (cur[1] - prev[1])
        return [prev[0] + t * (cur[0] - prev[0]), val]

    def clip_edge(points, inside, axis, val):
        if not points:
            return points
        out = []
        n = len(points)
        for i in range(n):
            cur = points[i]
            prev = points[i - 1]
            cur_in = inside(cur)
            prev_in = inside(prev)
            if cur_in:
                if not prev_in:
                    out.append(intersect(prev, cur, axis, val))
                out.append(cur)
            elif prev_in:
                out.append(intersect(prev, cur, axis, val))
        return out

    out = list(ring)
    out = clip_edge(out, lambda p: p[0] >= minx, "x", minx)
    out = clip_edge(out, lambda p: p[0] <= maxx, "x", maxx)
    out = clip_edge(out, lambda p: p[1] >= miny, "y", miny)
    out = clip_edge(out, lambda p: p[1] <= maxy, "y", maxy)
    return out


def ring_area(ring):
    s = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def clip_rings(rings):
    out = []
    for ring in rings:
        c = clip_ring_to_box(ring, CLIP_BOX)
        if len(c) >= 4 and ring_area(c) >= MIN_AREA_DEG2:
            out.append(c)
    return out


def process_geometry(geom):
    gtype = geom.get("type")
    coords = geom.get("coordinates")
    if gtype == "Polygon":
        rings = clip_rings(coords)
        return ("Polygon", rings) if len(rings) >= 1 else None
    if gtype == "MultiPolygon":
        polys = []
        for poly in coords:
            rings = clip_rings(poly)
            if len(rings) >= 1:
                polys.append(rings)
        return ("MultiPolygon", polys) if polys else None
    return None


def main() -> None:
    fetch_if_missing()
    with open(OUT_PATH, "r", encoding="utf-8") as fh:
        gj = json.load(fh)

    features = []
    for f in gj.get("features", []):
        g = f.get("geometry") or {}
        res = process_geometry(g)
        if res:
            nf = dict(f)
            nf["geometry"] = {"type": res[0], "coordinates": res[1]}
            features.append(nf)

    out_gj = {"type": "FeatureCollection", "features": features}
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(out_gj, fh, ensure_ascii=False, separators=(",", ":"))

    sizes = [
        len(f["geometry"]["coordinates"])
        for f in features
        if f["geometry"]["type"] == "MultiPolygon"
    ]
    print(f"[china-geo] 已裁剪写回 {OUT_PATH}")
    print(f"[china-geo] 要素数: {len(features)}；各要素多边形数: {sizes}")


if __name__ == "__main__":
    main()
