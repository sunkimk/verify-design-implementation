# Workbench maintenance

Read the section affected by the task. These are approved product behaviors, not instructions to rebuild every feature on each change.

## Intake and pairing

- Batch-first: one pair is a batch of one; a plausible lone pair can proceed without the batch dialog. Ambiguous/multiple pairs are reviewed before paid model calls. Match visually as well as by filename; confidence needs both plausibility and separation from alternatives.
- Use design/implementation upload zones and the existing Figma path. Do not resurrect a parallel intake or a second UI. Do not intercept paste into editable fields.
- Intake is one layer with two permanent slots. Figma is a source for the design slot only — a screenshot is still required either way — so it belongs to that slot as a small outlined button under its hint, opening the Frame/token form in a popover. It must not be a dialog-level tab: as tabs they implied the whole dialog had two modes, rendered the screenshot zone twice against one piece of state, and switching them made that zone vanish and reappear while the dialog grew from 410px to 640px. With the popover the screenshot slot never moves and the dialog height does not change.
- A form popover opens on its trigger and is dismissed deliberately — by its own close button, Escape, or a click outside. Do not toggle on the trigger: a pointer dispatch that fires the handler twice would close it again immediately. Escape must stop propagation, or the dialog behind it closes too and takes the reviewer's already-picked material with it.
- The pairing modal opens on whichever tab actually holds pairs. Exception-first only pays off when exceptions exist: defaulting to 待配对 unconditionally meant a fully matched batch opened on "没有待配对项", an empty list that reads as a failed import at the moment the reviewer wants to see their material. Fall back to 已配对 (then 全部) when nothing needs triage, and stop adjusting once the reviewer picks a tab themselves — including when their chosen tab later empties out, since yanking them away mid-action is worse than an empty list they navigated to.
- Project name starts empty, not with a placeholder that looks like real data. Display and input both fall back to 未命名项目; importing sets the name from the design filename.
- Pairing modal: close at the title's far right; counted 全部/待配对/已配对/已忽略 tabs and 新增一组 above the list; run summary and start action below. Pending includes uncertain/broken pairs; ignored entries have their own recovery tab and also remain visible in all. State and similarity sit between the two single source previews.
- File selectors show names, with searchable candidates and adjacent large hover/focus preview. Hover does not select. Keep floating previews inside the viewport and above scroll clipping. The footer's run scope is independent of the active filter and states uncertain/skipped counts.
- Keep complete screen pairs. Re-pair results in place; invalidate only the pairs changed, not the whole run. Removal is per screen. Do not silently lose data while adding sources or leaving restored records.
- One screenshot may serve several designs. Picking it for one pair must not take it from another: the same screen is legitimately compared twice — an iOS design against both the iOS and the Android build, or one build screenshot against two design revisions. Automatic matching still prefers unused screenshots, so duplicates only ever come from an explicit pick. (This replaces the earlier rule that a reassignment released the screenshot from its previous pair.)
- The pairing row's comparison preview is a viewer: the two images and a close action, nothing else. Confirming lives on the row, so it is not duplicated inside a dialog the reviewer opened only to look. Size it to be read rather than to fill the screen, and keep margin around the artwork.
- Batch detection is sequential, cancellable and streams per-screen results; an isolated failure retains other screens. A single-screen retry must not archive over a multi-screen record or recompute the whole-round diff.

## Canvas and controls

- Full-bleed pannable canvas, floating panels; opening panels does not reflow artwork. Left rail stays available. History hover opens transiently. Intake opens only by clicking +, U or canvas double-click in a centered modal.
- Pointer is default; Space temporarily pans. Do not bring back a mandatory tool-mode choice. Zoom anchors to pointer gestures or viewport center for toolbar actions, through the shared zoom path. Keep slack around images and disable native image drag.
- Fit-to-canvas respects floating panels and waits for stable image geometry on restore. One centering path owns positioning; avoid competing effects or fixed-delay measurements.
- Keep toolbar stable across modes. Overlay opacity lives in a popover. Controls inside the pointer-events:none dock explicitly accept pointer events. Verify real hit testing, not DOM programmatic clicks.
- Root-layer overlays must not be clipped by canvas stacking contexts. Minimap follows pan/zoom and supports navigation. U/L/I/H shortcuts retain their existing meanings, excluding editing targets.
- Selecting a marker reveals its issue and region without moving the whole document. Smallest containing annotation wins overlapping hit tests; each side is independently draggable/resizable. Unselected markers recede but remain red.

## Issues, history and exports

- Preserve the approved editable issue-card layout. One normalized type is used by cards and filters. Explanatory textareas start at 60px, scroll internally and can be resized vertically by the reviewer; do not auto-grow or show an expand-full-text action. Allow rail resizing. Do not replace the layout with a title-only inspector unless requested.
- Active means included: no inclusion checkboxes or bulk opt-in. Ignore archives complete editable evidence; restore retains it. Active IDs remain contiguous; retain archived IDs as references.
- All completed reviews are archived locally with developer-facing HTML. Save edits back to the same record; undo/redo groups a gesture and re-baselines when the session is replaced. Existing history is never silently rewritten for a schema migration.
- Distinguish history-based new-round review from a completed-run overwrite. The latter needs a concrete warning about discarded findings/edits; do not make destructive reset the specification of every review round.
- Empty/loading/failed/blocked/clean states explain what happened. The overview stays reachable outside the scrolling tabs, with coverage-led state and appropriate repair/retry actions. Counts and similarity do not grant sign-off.
- Preserve raw-image/crop parity across canvas, HTML and PDF. HTML embeds evidence, with full-image evidence collapsed. PDF starts with uncropped source images, then issue crops. One source of bounds owns all views.
- Export all active issues; under a filter distinguish displayed count and export count. Keep metadata consistent across page and exports.

## Fragile implementation details

- Use individual HugeIcons imports; inspect actual build behavior before diagnosing slowness.
- Build generates workbench.html. The bridge reads it on requests; prompt constants load at server startup.
- Preserve equal-axis scaling, original pixels, measured-overlap stitching and banded long-image review. Stitch only confidently consecutive shots, excluding fixed chrome; reject uncertain seams rather than guessing. Keep fixtures outside shipped assets.
- Keep live provider progress honest: it may estimate toward a ceiling but must not claim completion before results. Keep both evidence images visible during detection with compact progress badges inside each processing evidence frame and a subtle pointer-transparent sweep. Stop effects on completion/cancellation; reduced motion uses a static highlight. Avoid redundant error banners.
- Existing local praise-generation controls stay local and clearly non-AI; they do not suppress issues or count as findings. No new model call for decorative copy.

For changes here, select related cases in [validation checklist](../docs/VALIDATION_CHECKLIST.md). Geometry, export and storage changes need stronger regression coverage than label or spacing changes.

Matching reasons appear in the central score tooltip on hover/focus. Keep file replacement on each image hover/focus overlay; do not duplicate replacement buttons or reason banners below the pair. Missing-image upload targets remain available.

Draft pairing supports stable empty rows: 新增一组 appends and focuses a new row. Each side can be uploaded, selected or unassigned independently; canceling selection preserves the other side and leaves the source in the pool. This draft-only behavior does not relax complete-pair requirements for committed review screens.

Uncertain plausible draft pairs have an explicit 确认配对 action in the card and comparison preview. Confirmation moves them to ready and can be undone. Explicit source selection confirms the target when both sides are present; indirectly displaced pairs lose confirmation, and clearing a side invalidates confirmation; incomplete/implausible pairs cannot be confirmed through this action. Pair confirmation is not acceptance sign-off.

File picker menus contain filenames/search only. Hovering or focusing an option reveals a separate root-layer large image panel to the right (left if needed), sized independently of the menu and bounded by the viewport. Do not put the image inside the menu columns.

Candidate large previews are transient: show on option hover/focus, hide on option mouseleave/blur, query change or closing the picker. Do not leave the last preview visible after the pointer leaves the option.

Both source pickers recommend the five highest structural-similarity candidates relative to the opposite selected image, descending, with percentages at the right. Remaining candidates retain source order without scores. Without opposite-side evidence, retain order and hide all scores. Search filters these ranked results; similarity is not acceptance sign-off.

Intake has close/backdrop/Escape dismissal, focus containment, upload and Figma paths, and keeps partially selected sources on dismissal. It closes when pairing opens.

Plausible pairs at displayed structural similarity >=90% auto-confirm, independent of runner-up margin. Explicitly revoked confirmation remains pending. Sort visible draft groups by similarity descending with stable ties and missing-image groups last. Preserve plausibility checks before automatic confirmation.

Pairing dialog width and height are capped at 800px with 24px padding and viewport bounds. Omit the redundant alternative-count hint beneath implementation selectors.

Start detection counts and submits only complete ready non-ignored pairs. Pending, incompatible and missing-source pairs never count toward the CTA or enter the run. Single-pair intake bypasses confirmation only when that pair is ready; otherwise keep the pairing dialog reachable.

Do not place ongoing detection progress over the screen-switching tabs. Anchor progress badges within each processing image; keep top toasts for ordinary notices/errors.

Incomparable evidence uses the same numbered issue markers and editable issue cards as other findings, including selection, movement, resizing, ignoring and export. Preserve the blocker kind to describe the evidence limitation, but do not introduce a dedicated pairing-frame label, overlay or card variant. The issue itself explains that the two screens differ.

Processing badges are centered within each evidence image, as compact translucent-black toasts with white status text and percentage on one line. Preserve pointer transparency and sweep effects.

History rows open the saved review by clicking the record. Do not show a separate 复验 action in the history list; the removed shortcut did not directly open a review canvas.


## 多页面画布与导出
- 多组默认同屏排列，组名/顶部页签为定位锚点；聚焦当前只调整同一画布视角，叠加模式进入当前组。
- 单选时右侧问题清单属于 activeScreen；多选时按选中组分区阅读，显示各组问题归属，单选后继续编辑。
- 页面导出独立选择当前/全部，以及合并文件/逐页 ZIP；支持 HTML、PDF。每页使用自身 sources、reports，忽略项不导出；未检测、失败、无问题页面保留状态。
- 多页 HTML 的目录和问题锚点须包含页面标识，ZIP 文件名带序号防止同名覆盖。
- 验证重点：跨组切换/编辑隔离、长图不重叠、合并目录、逐页证据归属。布局与 ZIP 基础检查：`node tests/test_multi_page.mjs`。

- 点击组容器空白、组名或图片仅选中组，保留画布位置与缩放；显式导航/聚焦按钮才定位视图。右栏组名单行省略，与标题垂直对齐。

- 导出仅保留底部右侧单一入口：格式菜单（HTML/PDF）后进入素材预览与范围/文件组织配置。PDF标题不得用 fillText maxWidth 横向压缩，项目名正常换行；完整界面预览适当留白。问题字段共用列宽，复刻要求底色不得改变字段缩进。

- 导出菜单支持 PNG/PDF/HTML/JSON/Markdown。PNG 每组概览及每个问题各一张并打包 ZIP；JSON/Markdown 保留问题与原图坐标，素材仅记录文件名/尺寸，不嵌入原图。
- 问题卡片提供复制剪贴板，写入 text/plain、text/html 与 image/png；内容为当前问题及其两侧证据，目标应用自行选择可用格式。失败不得提示成功。

- 配对缩略图悬停/聚焦显示预览、重新上传、取消配对三个图标；点击预览才打开大图。取消配对清空当前侧并保留另一侧与素材池。

- 配对弹窗 800×800 上限，24px 内边距，小屏保留视口边缘；去掉头部素材数量和底部检测范围说明，CTA 继续显示已配对组数。列表使用细滚动条，不预留额外内容沟槽。上传区标题/说明整体居中、间距4px。

- 配对筛选采用按内容宽度排列的下划线文字标签。手动指定完整两侧时标记已指定并归入已配对，保留当前筛选；相似度仅作参考。悬停图片浮层层级高于配对遮罩，确保操作可点击。

- 配对组图片不再自动悬停大图；悬停/键盘聚焦仅出现预览、重新上传、取消配对三个图标。预览显式点击打开，关闭按钮/遮罩/Escape关闭。文件下拉选项的悬停大图不变。

- 检测中每组仅右上角一处状态与百分比，不显示组序号，不在两图中央重复显示。图片扫光保留；单组聚焦也在右上显示。

- 选中组使用固定视觉尺寸的图标操作栏，提示更换设计稿、更换实现图和删除该组。仅锁定正在检测的组；尚未处理组允许修改，队列读取最新素材并跳过删除项。

- 保存按钮在不可用时仍可悬停/聚焦，提示真实原因（保存中、检测中、素材不完整、无新修改）。新会话可手动保存，已有记录更新原ID；保存错误可重试。

- 多组画布保留各组图片节点；不可根据选中状态或不可靠的变换后交叉观察结果卸载图片，否则会出现选中才显示、切组消失。选中组操作栏为纯图标，悬停提示含义。

- 删除多页面组不自动缩放或定位；剩余组和末尾唯一新增入口按三列重新排列，不保留删除位置占位。

- 聚焦当前只调整同一无限画布的视角，不切换为单组布局，聚焦后仍自由平移。上传数量仅保留角标；避免副说明和提示重复。总览合并阻塞筛选，卡片提供具体原因。点击组外部收起操作栏。

- Ctrl/Cmd+A 在非输入区域全选组；Shift+点击/拖动增减或框选。多选时右栏按组阅读问题，问题标题定位对应组；输入区域保留文本全选。选中组可作为导出范围。
- 检测期间仅锁定正在运行的组，未检测组可编辑/删除。队列逐组读取最新替换、等待当前图片加载并跳过删除项，保持稳定组ID。
- 设计稿/实现图类型标签常驻，文件名单独省略。更换素材按钮图标区分且使用按钮级提示，上传input不覆盖按钮。

- 画布按下不立即捕获指针；移动至少5px后才进入平移，普通点击继续交给组。pointerup/cancel/窗口失焦均清理平移状态。

- 多选清单沿用单选卡片的元信息、徽标、RegionComparison、Input/IssueTextarea、操作及坐标样式。只增加静态组标题，不使用会覆盖卡片的吸顶标题。编辑/忽略/复制/预览按所属组取数据。

- HTML导出目录为一套组→问题的可折叠树。组名仅切换展开，子问题跳转正文；保留组概览入口及空组状态，哈希定位自动展开对应组，不因滚动强行打开用户折叠的组。

- 配对底部仅导入图片与开始检测共享已配对组范围；仅导入不调用AI，保持未检测。
- 新增组引导仅末尾一个，与组一起按三列排列；删除不留原位引导。新增弹窗复用上传弹窗的标题、关闭、间距和右侧底部操作布局。

- 单组重新验收使用按钮附近的非模态小确认浮层，无全屏遮罩；空间足够时置于按钮上方，否则在下方，点击外部/Escape收起并允许外部操作继续。顶部不展示ZY标识。

- 顶部组导航整条移除，不迁移总览/查看全部/聚焦按钮或G快捷入口；通过现有画布缩放、平移、组选中和问题定位操作。

- 单组验收进行时可继续加入其他组，按点击顺序串行消费动态队列；组头显示排队中（序号），选中组的验收按钮变为取消排队。取消不清空旧结果，重复点击不重复加入；已有报告仍需轻量确认后入队。全局中止后恢复未开始组状态。

  验证：三组模拟 UI 中先运行 S01，追加 S02/S03 显示排位 1/2，取消 S03 后总数由 3 降至 2；服务只收到 S01/S02 两次调用。队列单测覆盖动态追加、去重、取消重排、重新加入和读取新素材；未调用真实 AI。

- 排队状态右侧直接提供 × 取消按钮，悬停/聚焦提示取消排队；不要求先选中组或打开操作栏，点击不触发画布选组和平移。

  验证（浏览器实测，模拟 bridge，未调用真实 AI）：三组素材下先运行 S01、追加 S02/S03 得到排位 1/2；点未选中组 S02 组头的 × 后，S03 由排队中（2）变为（1），底部总数由 0/3 变为 0/2，S02 保留两张图与旧结果，画布 scrollLeft/scrollTop/缩放与当前选中组全部不变；模拟服务只收到 S01、S03 两次调用，被取消的 S02 从未发出。多选（Cmd+A）状态下点 × 同样不改变多选集合、镜头与缩放，总数正常递减。真实指针悬停时背景由透明变为 rgb(219,234,254) 并弹出「取消排队」提示。
  边界：该 × 只能取消**尚未开始**的组。若当前组刚好在点击前完成、队列已推进到目标组，`cancel` 按设计返回空、UI 不变化、该组照常执行——这不是缺陷，但排查时容易误判为取消失败，判据是底部总数没有递减。
  未验证：Enter/Space 键盘激活未能在本次自动化环境中确认。对照实验：向页面新建一个裸 `<button>`、聚焦、按 Enter，元素确实收到 `key: "Enter"` 的 keydown，但浏览器没有派生 click（0 次）。即这个环境不执行「Enter 激活按钮」这一浏览器默认行为；自定义 keydown 处理器是正常的（问题标题的 Enter 提交已实测生效）。所以这条属工具限制而非组件问题：按钮本身是 `type="button"`、可 Tab 到达（文档内第 6 个可聚焦元素）、并有 `:focus-visible` 描边。注意用 `Enter` 而不是 `Return` 作键名，后者在本工具下派发出的 keydown `key` 为空字符串，会让任何按键判断都落空。

- 组头 × 位于画布内，随画布缩放：CSS 22px，在三组自适应后的 29% 缩放下实际只有约 6.5px。选中组的浮动操作栏是 portal 到页面的固定尺寸控件，不受缩放影响，且在多选时被隐藏——多选下组头 × 是唯一取消入口。若要提高低缩放下的可点性，需要给该按钮反向缩放或改为页面层控件；当前保持画布内呈现是既有取舍，未改动。

- 问题清单左边缘的宽度拖拽手柄必须完全落在面板内部。手柄原为 `left: -3px; width: 9px`，向画布一侧探出 3px；面板浮在画布之上且手柄为 z-index 4，因此这条看不见的窄带会吞掉落在面板边缘外侧的点击（点了没反应、也没有任何反馈）。现为 `left: 0; width: 10px`，仍可抓取，但只占面板自身内边距。
  注意区分：面板展开后，位于面板下方的画布内容本身就被遮挡（例如最右侧组的组头 ×），那是浮层的正常行为，不是手柄问题——排查时先比较元素与面板左边界的坐标。

- 配对确认弹窗打开时若「待配对」为 0，默认切到「已配对」（其次「全部」）；用户手动选过标签后不再自动调整，即使所选标签随后变空也保持不动。
- 该筛选按“每次导入”复位，不是整个会话：`＋ 新增一组` 会把用户停在「全部」（新加的空行才看得见），自动回落也可能停在「已配对」。这个值若跨导入保留，下一次导入就会开在上次的标签上而不是先给异常项——所以 `batchDrafts` 变空时一并把 `pairFilter` 复位到 `pending`、清掉 `pairTabTouched` 与放弃确认状态。
- 配对页的 Esc 会走「放弃这次配对？」确认，不再一键清空导入（一次误按会丢掉全部拖入的图和手动改配，且无撤销）。标题 × 同样走确认；再按 Esc、点「继续配对」或点蒙层都取消提问。嵌套层（文件选择器、对比预览、图片大图）自己拥有 Esc：它们在子组件里，`stopPropagation` 挡不住这条 window 级监听，只有 DOM 能判断当前真正打开的是哪一层，因此该监听先用 `document.querySelector(".file-picker-popover, .pair-source-popover, .pair-preview, .pair-image-lightbox")` 让位。
  注意：用 `dispatchEvent` 直接在 `window` 上派发 Escape 会跳过 `document` 捕获阶段的监听，看起来像“嵌套层不响应 Esc”。验证这类层级必须用真实按键。
- 检测失败的用户可见文案一律走 `classifyFailure` 的中文 `title`/`advice`，provider 的英文原句只出现在折叠的「技术详情」和 hover 的 `title` 属性里。额度/账单类错误（`out of credits`、`insufficient_quota`、`quota exceeded`）必须排在容量分支**之前**判断：这类原话不含任何容量关键词，此前落进「检测未完成」并建议重试，而重试在充值前必然再失败。登录失效单独一类。Codex 会把同一条操作性错误在两次重试里各打印一遍，`meaningfulError` 因此对 flagged 行去重，否则同一句话首尾相接出现两次。
- 账号级拒绝（`credits`、`auth`）会让整批停下：`runBatch` 的 catch 里分类命中这两类就 `break`，并记下还剩几组没发出。这类错误对后面每一组的结果完全相同，逐个跑完只会得到 N 条一模一样的失败提示，还白等一遍。用局部变量 `abort` 而**不是** `batchCancelRef`：后者会跳过 `recordHistory`，把中止前已经跑成功的那几组一起丢掉档。中止提示走 `queueAbort`，在 toast 里优先级高于单屏失败，并且**不给「重试本屏」按钮**——充值前重试必然再失败，放个按钮就是在邀请用户逐个重试。中止时必须把触发它的那一屏写进 `dismissedFailures`：页面只有一个 `.toast` 元素，所以同一时刻不会真的并排出现两条，但那一屏本身仍然符合单屏失败提示的条件——关掉队列提示、或切到那一屏，就会再冒出一条说同一件事的「S0x 检测失败：…」。这一屏的原因仍在问题清单的失败卡里，信息不丢。被取消的组由循环后的 `pending → idle` 回收，显示为「未检测」。
- 同一个失败（`${screenId}:${error}`）在整个会话里只提示一次。`dismissedFailures` 不再只由用户的 × 写入：`retryScreen` / `retryUnfinished` 在重跑前先把当前失败键记为已读——点了重试就说明已经知道了，再失败成同样的原因时提示没有新信息。换成另一个错误会生成新键，照旧提示。
- 失败提示只有两个出口，且共用同一个键：画布顶部的 toast，和问题清单顶部一条细横幅（原因 + 重试本屏 + ×）。清单里原本还有一整块红色 `.empty-list.is-failed` 卡，把原因、建议和英文原文再讲一遍，正好占住用户准备开始手动记问题的位置；现在清单只留中性空态，说明「为空是因为 AI 没有结果，不代表没有问题」并指向「＋ 新增」。原因的长期落点是总览卡的「技术详情」。
- 批次收尾提示要区分“我们拒绝了这些配对”和“模型/账号失败了”。`completed.length === 0` 原本一律报「没有可检测的界面：图片不匹配，请重新选择」，于是任何一次 503 或额度失败都在让用户去重挑截图。循环里单独计 `mismatched`（`plausiblePair` 拒绝的数量），据此分流文案。
- `issueListState` 的 `failed` 必须让位于真实内容：`activeScreen.status === "failed" && !defectIssues.length`。AI 跑不通不影响人工走查，但失败分支原本无条件胜出，导致手动新增的问题被计入「共 N 项问题」、在画布上画出选框，而清单里仍然只显示「这一屏没有检测成功」——卡片存在却点不到。失败原因改为清单顶部一行 `.issue-list-failed-note`，并明确标注「下面是你手动记录的问题，不是 AI 的检测结果」，避免把人工记录读成检测结果。
- 顶部 toast 的 `z-index` 为 10050，高于所有弹窗遮罩（`.crop-lightbox` 9998、`.intake-modal-backdrop` 9997、图片大图 10030）。弹窗内触发的确认（确认配对、忽略该组）原本被压在遮罩后面，操作唯一的反馈不可见。`.app-shell` 只有 `position: relative` 没有 z-index，不形成层叠上下文，所以 toast 与遮罩同在根层叠上下文里按数值比较。
- 项目名初始为空字符串，顶栏与输入框统一回落到「未命名项目」；不要再用 `design` 之类看起来像真实数据的字面量做初值。
- 多选状态下也显示浮动操作栏（锚定在当前组，且仅当该组确实在选区内）。它是 portal 到页面的固定尺寸控件，不随画布缩放；而组头的取消 × 在画布内，三组自适应到 29% 时只有约 6.5px，多选下曾是唯一入口。操作栏的 `aria-label` 带上组名，避免「删除该组」被读成作用于整个选区。
- 问题标题是最多两行的 textarea，不是单行 input：超长标题原来在面板边缘被直接截断。Enter 提交并失焦而不是插入换行，粘贴进来的换行折叠为空格。
- 每个导出文件名都带本地时间戳 `_YYYYMMDDHHmm`（HTML/PDF/PNG-ZIP/分组 ZIP/合并报告五条下载路径都覆盖），同一轮导出共用一个时间戳；否则第二次导出会直接覆盖第一次。ZIP 内部的单页文件名不加，外层已经带了。
