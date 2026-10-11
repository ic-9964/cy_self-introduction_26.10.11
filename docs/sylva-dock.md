# Sylva 导航组件

导航从 `D:/2026大二上-前端开发/threeui-main/threeui-main/public/landing-pages/inner-green-3d.html` 提取，保留原版弹簧、追光色标/遮罩、入场节奏和花粉运动参数。只依赖浏览器原生 API，没有 Three.js、森林场景、SVG 图标或 Logo。

## 接入与状态

加载 `sylva-dock.css`、`sylva-dock.js`，使用以下结构。每项保留正常的链接和导航语义，组件不会阻止链接默认行为。

```html
<sylva-dock class="dock-wrap">
  <div class="dock-viewport">
    <nav class="dock" data-spec aria-label="主导航">
      <a class="dock-item" data-spec href="#about" aria-current="page">关于</a>
      <a class="dock-item" data-spec href="#projects">科研</a>
    </nav>
  </div>
</sylva-dock>
```

现有 `app.js` 继续处理栏目、hash、历史记录和内容焦点。组件监听 `aria-current`，将唯一选中项同步为 `.is-active`；邻近状态只使用 `data-near`。键盘聚焦独立管理，实际指针移动后才恢复指针控制。

按后续交互要求，鼠标实际悬停的按钮也使用浅色底和深色文字；移开后恢复普通/邻近外观。悬停不改变当前栏目，点击后浅色选中态跟随当前路由。此临时悬停样式仅在支持精细指针悬停的设备启用，避免触屏残留。

外层 wrapper 负责居中，内层 dock 负责视差。`pointermove` 只记录坐标并唤醒动画帧，测量及动画在帧内处理；静止后停止 RAF。组件卸载会撤销监听器、断开 Observer、取消动画和 RAF、移除粒子 Canvas。异步字体和入场回调受该次挂载的 AbortSignal 约束。

## 对原版的兼容适配

- 原生 Web Component 适配当前静态 HTML/CSS/JavaScript 项目，无额外构建依赖。
- 静止按钮高度从 36px 增至 44px，比例单位为 `44/36`；中文沿用现有字体，字号保持 16px。七项入场延迟为 120/180/230/280/330/380/430ms。
- 窄屏导航内部横向滚动，预留 36px 下方空间供按钮放大；页面不横向溢出。
- 花粉使用独立透明 Canvas2D，按 `0.38*u` 将原版世界坐标投影到 CSS 像素；保留 52 粒、1.6 秒、620 粒上限及原版阻力、上浮、摆动、淡出。Canvas 分辨率 DPR 上限为 2。
- 触屏关闭邻近、追光、视差，保留点击与花粉；减少动态效果时关闭导航放大、视差、入场、追光和花粉。
- 外壳沿用透明渐变材质，不使用 backdrop-filter。现有海景、景深和正文样式保持原样。

## 2026-10-10 验证

在本地服务 `http://127.0.0.1:8080/?view=coastal` 上使用 Playwright + Headless Microsoft Edge 验证。

- `node tools/check-page.mjs`：本地引用、锚点、图片 alt 检查通过。
- `node --check sylva-dock.js`：语法检查通过。
- `node tools/check-navigation.mjs`：七个独立栏目、导航/历史/刷新/直达、作品筛选排序、滚动、键盘、移动端和非法 hash 回归通过。
- `node tools/check-sylva-dock.mjs`：邻近项连续放大、静止指针稳定、外壳高度、字号、无重叠、边缘追光、唯一选中态、路由/历史、52 粒反馈及回收、键盘控制权、320px 触屏、减少动态效果（含入场期间切换）、空闲帧停止、卸载及入场期间重新挂载通过。
- 独立审查在 320/600/601/620/768px 验证键盘放大后无页面横向溢出。

浏览器脚本需要可用的 Playwright 模块；可通过 `PLAYWRIGHT_MODULE` 指定路径，`BROWSER_CHANNEL=msedge` 指定 Edge。
