---
name: miaoshou-tiktok-listing-editor
description: "Edits a Miaoshou TikTok listing to be Japan-ready: Japanese title, Japanese description (HTML), category (resync to bypass invite-only branches), country of origin, package size, weight, brand. Drives the ego-browser editor with full DOM-level interactions including rich-text iframe writes. Use when the user asks 编辑商品、Japanese listing、日文文案、Japan category 设置、listing 本地化."
metadata:
  category: miaoshou-tiktok
  emoji: 📝
  requires:
    - ego-browser
    - miaoshou-authenticated-session
    - miaoshou-1688-same-source (upstream)
---

# Miaoshou TikTok Listing Editor 📝

Drives the Miaoshou common-collection-box editor **and** the TikTok collect-box editor to produce a Japan-ready listing: Japanese title, Japanese HTML description, accessible category, country of origin, package dimensions, weight, brand. Performs category resync to escape "invite-only" branches and writes the rich-text body by directly mutating the iframe `document.body.innerHTML` (the in-DOM textarea is a virtualized editor and text-input via DOM helpers alone drops the value).

## Inputs

| Parameter         | Type   | Default                                 | Notes                                                                  |
| ------------------ | ------ | --------------------------------------- | ---------------------------------------------------------------------- |
| `rowId`            | string | required                                | The `commonCollectBoxDetailId` returned by `miaoshou-1688-same-source` |
| `titleJa`          | string | required                                | ≤255 chars; use `tiktok-shop-listing-optimization` to draft            |
| `descriptionJa`    | string | required                                | HTML body, see template below                                          |
| `countryOfOrigin`  | string | `中国大陆`                              | Pick from the dropdown list (中国大陆 / 日本 / 韓国 / …)               |
| `categoryId`       | string | _auto-detect, fallback `挂饰 (吊り飾り)`_ | Search the cascader by Japanese term, click the suggestion           |
| `weightKg`         | number | `0.03`                                  |                                                                        |
| `packageSizeCm`    | array  | `[15,10,8]`                             | `[length, width, height]`                                              |
| `brand`            | string | `无品牌`                                |                                                                        |
| `egoBrowserTaskId` | number | required                                |                                                                        |


## Required Skills

Before invoking this skill, the agent **must** detect missing dependencies and prompt
the user to install them. Do **not** auto-install silently.

| Skill | Why it is required | Install command |
| --- | --- | --- |
| `ego-browser` | Drives the Miaoshou ERP browser session | `npx skills add ego-browser -g` |
| | `ego-browser` | drives the Miaoshou browser session | `npx skills add ego-browser -g` |
| `miaoshou-1688-same-source` | upstream: supplies `offerId` + public-box row id | `npx skills add peipeijiang/miaoshou-tiktok-shop-skills --skill miaoshou-1688-same-source -g` |
| `tiktok-shop-listing-optimization` | drafts the Japanese title + description | `npx skills add nexscope-ai/eCommerce-Skills --skill tiktok-shop-listing-optimization -g` |
| `tiktok-shop-compliance` | pre-checks forbidden words + category whitelist | `npx skills add nexscope-ai/eCommerce-Skills --skill tiktok-shop-compliance -g` | | see below | see below |

### Detection step (run first, every time)

```bash
set -e
required_skills="ego-browser miaoshou-1688-same-source tiktok-shop-listing-optimization tiktok-shop-compliance"
missing=""
for s in $required_skills; do
  for d in "$HOME/.codex/skills/$s" "$HOME/.agents/skills/$s"; do
    if [ -d "$d" ]; then missing="$missing"; break; fi
    missing="$missing $s"
    break
  done
done
if [ -n "$missing" ]; then
  echo "MISSING_DEPENDENCIES:$missing"
fi
```

If `MISSING_DEPENDENCIES:` prints, **stop**, then ask the user:

> Required skill(s) are not installed: `<list>`. The flow cannot run without them.
> Recommended install commands:
> ```
> <commands, one per line>
> ```
> Install now? (y/n)

If the user approves, run the commands verbatim. If not, exit and report the missing
dependencies as the result. Never proceed with the workflow on missing skills.


### Install all missing dependencies at once

```bash
npx skills add ego-browser -g
npx skills add peipeijiang/miaoshou-tiktok-shop-skills --skill miaoshou-1688-same-source -g
npx skills add nexscope-ai/eCommerce-Skills --skill tiktok-shop-listing-optimization -g
npx skills add nexscope-ai/eCommerce-Skills --skill tiktok-shop-compliance -g
```

After installing, the user must reload Codex (or run `npx skills experimental_sync -y`)
so the SKILL.md files are picked up.

## Workflow

```mermaid
flowchart TB
  A[Receive rowId + content] --> B[Open common_collect_box/items + search]
  B --> C[Click 编辑 -> Edit dialog]
  C --> D[Set title via fillInput]
  D --> E[Write description HTML into iframe body]
  E --> F[Set category: search + click suggestion]
  F --> G[Click 重新同步类目]
  G --> H{Invited-only category?}
  H -->|yes| I[Switch to 挂饰 (吊り飾り)]
  H -->|no| J[Keep category]
  I --> J
  J --> K[Set country of origin]
  K --> L[Set weight + package size]
  L --> M[Set brand = 无品牌]
  M --> N[Click 保存修改 -> 保存成功]
  N --> O[Navigate /tiktok/collect_box/items]
  O --> P[Click 编辑 -> TikTok dialog]
  P --> Q[Repeat title + description + category sync]
  Q --> R[Click 保存并发布]
```

## Description HTML Template

```html
<p>食品モチーフのMiniぬいぐるみキーホルダー。バッグやポーチに付けて楽しめる軽量チャームです。</p>
<p>サイズ：約7～16cm<br>素材：ポリエステル、PP綿<br>カラー・デザインは選択したバリエーションをご確認ください。</p>
<p>※本商品は食べられません。小さな部品を含むため、乳幼児の手の届かない場所で使用してください。</p>
```

## Failure Behavior

| Symptom                                                         | Likely cause                                       | Recovery                                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Title `textbox` accepts input but save fails                    | Title contains forbidden word                         | Run `/tiktok/item/detect` first; replace the offending token with a synonym.                                           |
| Iframe body write ignored                                       | Miaoshou uses a virtualized editor                 | Write `iframe.contentDocument.body.innerHTML`, then dispatch `new InputEvent('input', {bubbles:true})` and `new Event('change', {bubbles:true})`. |
| `请选择类目` after select                                        | Category is disabled                               | Click `重新同步类目` to refresh the attribute map; if still blocked, pick a different category.                     |
| `当前类目非主营类目或仅限邀请` after save                    | Category is invite-only                            | Pick a category not on the invite-only list (e.g. `挂饰 (吊り飾り)`, `スマホストラップ・チャーム`).                    |
| `包裹尺寸不能为空`                                             | Package size was not flushed                       | Use `fillInput` for `length / width / height` then click 保存再次 (focus loss triggers validation).                    |
| `产品信息有误，请检查` after save                            | One required field empty                            | Re-run the workflow; check `原产地`, `材质`, `年齢に関する警告` are set.                                              |
| `访问该类目的权限` after save                                | Shop lacks that category                           | Authorize the shop for that category in TikTok Seller Center, then retry.                                              |

## Required Cookies & Permissions

- Miaoshou ERP session in the supplied ego-browser task space.
- Permission code: `collectBoxList`, plus the listing-edit permission for the target shop.
- Outbound network to `erp.91miaoshou.com` and `tiktok-static-c{1..4}.chengji-inc.com`.

## Pair With

- `miaoshou-1688-same-source` — upstream.
- `tiktok-shop-listing-optimization` — drafts the Japanese title + description.
- `tiktok-shop-compliance` — flags restricted words and category issues.
- `miaoshou-tiktok-publish` — downstream.

## Example Invocation

```
For row 3986003071, set the Japanese title to "かわいい食品道具 ぬいぐるみキーホルダー バッグチャーム"
and the Japanese description from the template. Set country of origin to 中国大陆, weight 0.03kg,
package 15×10×8 cm, brand 无品牌, and category 挂饰 (吊り飾り). Then click 保存修改 and confirm
the save succeeded.
```
