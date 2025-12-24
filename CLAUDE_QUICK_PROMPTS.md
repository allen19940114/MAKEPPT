# Claude AI 快速启动提示词

> 每次与 Claude Code 开始新对话时，复制以下内容作为第一条消息：

---

## 完整版（首次使用或需要完整说明时）

```
你是一个按照预定义功能清单开发的 AI Agent。请严格遵循以下规则：

## 项目文件
- CLAUDE.md: 项目说明（必读）
- feature_list.json: 功能清单（只能改状态，不能改定义）
- progress.md: 进度日志（每次修改代码后必须更新）
- init.sh: 启动脚本

## 工作流程
1. 读取 progress.md 和 feature_list.json 了解当前状态
2. 选择下一个 implemented: false 的功能（按 priority 顺序）
3. 实现功能 → 更新 progress.md
4. 运行测试: npm test && npm run test:e2e
5. 测试通过 → 更新 feature_list.json 状态 → git commit
6. 继续下一个功能

## 权限边界
✅ 可以修改: implemented, implementation_notes, implemented_at, test_steps.*.passed
❌ 不能修改: id, name, priority, description, test_steps.*.description
❌ 禁止: 跳过测试、同时开发多个功能、prisma migrate reset

## 测试规则
- 代码测试: npm test（你直接执行）
- 浏览器测试: npm run test:e2e（Puppeteer 自动化）
- 所有测试通过才能标记 implemented: true

## Git 规则
- 每个功能完成后立即提交: git add . && git commit -m "feat: FXXX 功能名"
- 失败可回滚: git reset --hard <commit>

---

现在请执行:
cat progress.md && cat feature_list.json && git log --oneline -5

然后告诉我:
1. 当前进度
2. 下一个功能
3. 需要通过的测试
```

---

## 简洁版（日常使用）

```
请按照 CLAUDE.md 的规则继续开发。

先执行:
cat progress.md
cat feature_list.json | jq '.features[] | select(.implemented==false) | {id,name,priority}' | head -20

然后:
1. 告诉我当前进度和下一个功能
2. 开始实现
3. 实现后更新 progress.md
4. 运行 npm test && npm run test:e2e
5. 测试通过后更新 feature_list.json 并 git commit
```

---

## 超简洁版（快速继续）

```
继续开发。读取 progress.md 和 feature_list.json，选择下一个未完成功能，实现 → 测试 → 更新状态 → 提交。
```

---

## 状态检查版（查看进度）

```
请检查项目状态:
1. cat progress.md | tail -30
2. cat feature_list.json | jq '{total: .features | length, done: [.features[] | select(.implemented==true)] | length}'
3. git log --oneline -5

总结当前进度和剩余工作。
```

---

## 问题修复版（测试失败时）

```
测试失败了。请:
1. 分析错误信息
2. 修复代码
3. 更新 progress.md 记录问题和解决方案
4. 重新运行测试
5. 如果仍然失败，考虑 git reset --hard 回滚到上一个成功状态
```
