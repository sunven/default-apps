# 02: 常用文件类型与协议目录

**What to build:** 用户可以从文件类型和 URL 协议两个入口浏览常用关联，查询实际默认与候选，辨认同扩展名的不同类型，并在解析或查询失败时获得准确说明。

**Blocked by:** [01: 正式窗口与 PDF 默认查询](01-product-window-pdf-query.md).

**Status:** ready-for-agent

- [ ] 初始输入覆盖 PDF、纯文本、RTF、Markdown、JPEG、PNG、GIF、TIFF、HEIC、SVG、HTML、JSON，以及 http、https、mailto、webcal；采用已确认种子表中的扩展名别名，不假定归一化后恰好 16 行。（CAT-2、QUERY-1）
- [ ] 关联身份为 kind 加已解析 UTType identifier 或规范 scheme；同一类型的多个扩展名合并标签与来源，不同类型共享扩展名时分行展示类型身份及各自默认。扩展名与 MIME 标签不产生独立默认值。（CAT-2）
- [ ] 常用项经过正式解析流程；未解析项显示原因并禁止修改，不虚构系统类型。提供后续文件识别入口的明确说明，实际选择器由 05 接入。（CAT-3、QUERY-2）
- [ ] 文件类型与协议入口均可选中关联、查看真实默认和候选详情、手动重查；http 与 https 始终是两个独立关联。（QUERY-1）
- [ ] 当前默认、系统候选与关联来源分别呈现；查询成功无默认、候选为空、未解析、查询失败分别表达，失败保留最后有效观察及重查入口。（QUERY-2）
- [ ] 查询结果沿用具体副本路径，候选列表不受未来应用扫描范围限制；不同副本能在详情中辨认，不从排序推导默认。（CAT-4）
- [ ] 用确定性数据验证 jpg／jpeg 合并、多类型歧义、来源合并、协议规范化和查询状态；在正式窗口只读核对 PDF、JPEG、http、https、mailto 及当前可解析常用项。记录未解析项的真实结果，不改变日常默认。

依据：[实施入口](../spec.md)、[目录与候选决议](../../default-apps-v1/issues/03-association-catalog.md#answer)、[种子与验收矩阵](../../default-apps-v1/assets/acceptance-criteria.md)。
