---
name: miaoshou-tiktok-trending-pick
description: "Miaoshou ERP market leaderboard + TikTok insight candidate SKU picker for Japan TikTok Shop. Drives the ego-browser session through erp.91miaoshou.com, scores viral potential (GMV, rating, sales velocity, shop rating), and outputs a candidate list ready for 1688 same-source sourcing. Use when the user asks for 妙手选品、Trending Pick、TikTok 爆款挑选、TikTok 市场榜单筛选."
metadata:
  category: miaoshou-tiktok
  emoji: 🎯
  requires:
    - ego-browser
    - miaoshou-authenticated-session
---

# Miaoshou → TikTok Trending Pick 🎯

Drives an authenticated Miaoshou ERP browser session to surface TikTok Shop candidate SKUs from the market leaderboard (`/tiktok/analytics/bestselling/product`) and TikTok insight (`/common/selecting_products_tiktok`), scored for viral potential and ready for 1688 sourcing.

## Inputs

| Parameter        | Type   | Default          | Notes                                                                                  |
| ----------------- | ------ | ---------------- | -------------------------------------------------------------------------------------- |
| `country`         | enum   | `JP`             | JP / KR / SG / MY / TH / VN / PH / ID / US / GB                                       |
| `category`        | string | _(all)_          | Miaoshou 1st-level category filter                                                     |
| `gmvMinUsd`       | number | `50000`          | Skip low-GMV rows                                                                      |
| `ratingMin`       | number | `4.5`            | Skip under-performing listings                                                        |
| `sortBy`          | enum   | `gmv`            | `gmv` / `sales` / `rating` / `trend`                                                  |
| `maxCandidates`   | number | `20`             | Stop after this many rows (page-aware)                                                 |
| `egoBrowserTaskId`| number | _(reuse latest)_ | Pass the task-space id from `useOrCreateTaskSpace(...)` to keep login state             |

## Workflow

```mermaid
flowchart LR
  A[Open ego-browser task] --> B[Navigate /tiktok/analytics/bestselling/product]
  B --> C[Set country/category + sort=gmv]
  C --> D[Snapshot table rows until maxCandidates]
  D --> E[Score: GMV*0.4 + rating*0.3 + salesVelocity*0.3]
  E --> F[Cross-check /common/selecting_products_tiktok]
  F --> G[Output JSON: candidates]
```

1. **Reuse or create task space** via ego-browser: `useOrCreateTaskSpace(taskId)`. If absent, prompt the user to log into `https://erp.91miaoshou.com` and supply the resulting task-space id.
2. **Navigate** to the leaderboard with filters pre-applied (country, category, sort, page size 50).
3. **Extract** per row: `productId`, `title`, `shopName`, `categoryL1/L2`, `gmvUsd`, `productRating`, `sales30d`, `shopRating`. Iterate pages until `maxCandidates` is reached or all rows match the threshold.
4. **Score** with `score = 0.4*log(gmvUsd) + 0.3*productRating*20 + 0.3*log(sales30d+1)`. Drop rows below `ratingMin`.
5. **Cross-check** with the dedicated TikTok insight page (`/common/selecting_products_tiktok`) to confirm the leaderboard row is still listed; drop ghost rows.
6. **Emit** a JSON array. Each entry is a drop-in input for `miaoshou-1688-same-source`.

## Output

```json
[
  {
    "productId": "1737429783344874791",
    "title": "エクスプローラー 折りたたみリクライニングチェア",
    "shopName": "Dailxm SHOP",
    "category": "家具>アウトドア>チェア",
    "gmvUsd": 530700,
    "productRating": 4.69,
    "sales30d": 412,
    "shopRating": 4.7,
    "score": 87.4,
    "leadboardUrl": "https://erp.91miaoshou.com/tiktok/analytics/bestselling/product?..."
  }
]
```

## Failure Behavior

| Symptom                                                  | Likely cause                                  | Recovery                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `useOrCreateTaskSpace` returns no task                    | User not logged in to Miaoshou                | Open `https://erp.91miaoshou.com` in `ego-browser`, complete login + 2FA, re-run the skill.                             |
| Leaderboard rows but GMV = `--`                          | Currency filter mismatch                       | Drop the filter, re-paginate, re-score.                                                                                 |
| Empty page (0 rows)                                      | Category too narrow                           | Widen `category` to all; lower `gmvMinUsd`.                                                                            |
| Insight page shows `暂无数据`                            | Country not supported                         | Pick `JP` or another authorized country; confirm shop is authorized at `/auth/partner/tiktokBusiness`.               |
| `console error: 拒绝访问` from Miaoshou                 | Session cookie expired                        | Re-login; the skill will re-run on the next turn.                                                                       |

## Required Cookies & Permissions

- Logged-in Miaoshou ERP session in the supplied ego-browser task space.
- Permission codes: `tiktokHotSale` and `collectBoxFetchItem`.
- Outbound network to `erp.91miaoshou.com`, `aibuy.1688.com`, `detail.1688.com`.

## Pair With

- `miaoshou-1688-same-source` — feeds each candidate into 1688 search.
- `tiktok-shop-product-research` — provides scoring rubric cross-checks.
- `tiktok-shop-trending-products` — pulls market trend context.

## Example Invocation

```
Pick 10 Japan TikTok Shop candidates with GMV > 80k USD and rating > 4.6, ranked by viral score.
Reuse my ego-browser task space id 23.
```
