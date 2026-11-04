# Data Hub · 视觉方案

航天数据资产门户的四个视觉方案，可以在页面底部的切换条里来回切换。打开后默认是方案 D「数据舱」的暗色模式，左下角可以切到浅色。

在线体验：<https://fanmihua.github.io/data-hub-demo/>

> 这些都是视觉方案的探索稿，不是能用的业务系统，各方案也还在继续打磨。页面上的数据全部是虚构的，机构名为「演示研究院」。

## 四个方案

| 方案 | 地址 | 形态 | 看点 |
| --- | --- | --- | --- |
| **D 数据舱** | `#/d` | 一屏应用（AI Chat BI） | 欢迎页提问 → 问答生成看板 → 资产列表 → 可编辑的驾驶舱看板 |
| A 白昼测控 | `#/a` | 滚动网站 | 工程细线、蓝图网格、点阵地球和轨道 |
| B 极光智能 | `#/b` | 滚动网站 | 会呼吸的光球、问答式检索，回答逐段生成 |
| C 轨道叙事 | `#/c` | 滚动网站 | 滚动讲完一年的经费流向，大字、大数、大图表 |

方案 D 的几个界面：

- `#/d`：欢迎页
- `#/d/chat`：问答
- `#/d/assets`：资产列表
- `#/d/board/operations`：经营概览看板
- `#/d/board/contracts`：合同与付款看板
- `#/d/board/expenses`：报账与支出看板

## 风格与数据都能改

- 「风格与数据」面板（底部切换条和 D 的左侧栏都能打开）可以切换明暗、主题色、动效强度、密度，也能直接粘贴或导入自己的数据 JSON。改动只保存在你自己的浏览器里。
- 默认值在 `public/config/theme.json`（风格）和 `public/config/data.json`（数据，金额单位为元）。
- 只对当前页面生效的测试参数：`?theme=light`、`?fx=off`、`?accent=signal-green`（也可以写 6 位色值，如 `?accent=0B8A9E`）。例如 `#/d?theme=light`。

## 本地运行

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev      # http://127.0.0.1:4181
npm run check    # 自检数据和看板逻辑
npm run build    # 构建结果在 dist/，任何静态服务器都能直接托管
```

推送到 `main` 之后，GitHub Actions 会自动构建，并更新 GitHub Pages。

## 技术

React 19、Vite 和 TypeScript。地球、轨道、光球、图表、桑基图这些效果都是用 Canvas、WebGL、SVG 和 CSS 手写的，没有用图表库。

## 许可

代码采用 MIT 许可。`public/fonts/` 下的字体子集来自阿里巴巴普惠体和阿里妈妈数黑体，版权归阿里巴巴集团所有，按这两款字体的免费商用许可使用。
