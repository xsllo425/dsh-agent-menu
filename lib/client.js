window.__ModuleLoader__.load({
	id: "dsh-agent-menu",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * dsh-agent-menu 客户端半端：Codex / WorkBuddy / MiniMax 风格的 Agent 右键菜单。
		 *
		 * 右键选中文字（或无选中时的超链接 / 文件芯片 / 所在段落、代码块）→ 引用进输入框、
		 * 直接发送给 AI、或套用提示模板（解释 / 翻译 / 总结 / 续写 / 代码优化与测试）；
		 * 同时自带复制 / 剪切 / 粘贴 / 全选 / 复制路径 / 打开文件位置 / 用默认应用打开 /
		 * 复制链接地址 / 在浏览器中打开，**不再依赖 dsh-file-menu**。
		 *
		 * 系统剪贴板、资源管理器定位、默认应用打开这三件原生能力走宿主路由 /agent-menu
		 * （lib/index.js，0.2.0 新增）；宿主不在时退回浏览器本地复制。
		 *
		 * 事件模型与安装方式沿用 dsh-file-menu 验证过的做法（踩坑记录见 docs/DEVELOPMENT.md）：
		 *  1. 菜单项激活走 window 捕获阶段的 pointerdown + elementFromPoint 命中，
		 *     不依赖 click 冒泡；激活后吞掉 mouseup/click，避免误触下层界面。
		 *  2. HMR 会重新实例化模块：监听表存 window、代际号自增，旧监听器自我禁用。
		 *  3. 与同类右键菜单插件的共存（重要）：
		 *     - dsh-file-menu 挂 window 捕获、有菜单项时同步 preventDefault + stopPropagation；
		 *     - dsh-round-rightclick 挂 document 捕获、只在会话表面弹圆盘。
		 *     本插件因此**不在事件回调里同步决策**，而是记下上下文后 setTimeout(0) 再决定：
		 *     此时 file-menu 的同步处理已经结束——它弹了菜单我就按需接管，它没弹我就自己弹，
		 *     决策与模块加载顺序无关。round-rightclick 的遮罩层出现时一律让行。
		 *  4. 会话与输入框走 dsh-suggest-actions 同一条官方路：
		 *     `ctx.get("conversation").input.shell(sessionId).actions` 的 setDraft + submit。
		 *     setDraft 是 Lexical 异步更新，submit 前轮询等草稿落定（同一 tick 连调会发空草稿）。
		 *  5. `ctx.get(...)` 是可选查找（动态插件守卫门面），不写进 inject：
		 *     服务缺失时只降级（不出 Agent 菜单项），不会把整个插件 park 掉。
		 */
		var MENU_ID = "dsh-agent-menu-root";
		var TOAST_ID = "dsh-agent-menu-toast";
		var STYLE_ID = "dsh-agent-menu-style";
		var ITEM_CLASS = "dsh-am-item";
		/** dsh-file-menu 的菜单根 id；存在说明它刚为这次右键弹过菜单。 */
		var FILE_MENU_ROOT_ID = "dsh-file-menu-root";
		/** dsh-round-rightclick 的全屏遮罩；存在说明圆盘菜单在显示。 */
		var ROUND_MENU_LAYER = "[data-dsh-rr-layer]";
		/** 提示模板里嵌入正文的上限（引用到输入框不截断）。 */
		var MAX_EMBED = 20000;
		/** setDraft 后等待草稿落定的轮询上限（12 × 25ms，同 dsh-suggest-actions）。 */
		var DRAFT_WAIT_TRIES = 12;
		var DRAFT_WAIT_MS = 25;

		/** 客户端 ctx：只做 `ctx.get("sessions" / "conversation")` 的可选查找。 */
		var pluginCtx = null;
		/** 监听表与代际号都放在 window 上：HMR 重新实例化后仍能拆掉上一代监听。 */
		var LISTENERS_KEY = "__dshAgentMenuListeners";
		var GENERATION_KEY = "__dshAgentMenuGeneration";
		var GENERATION = 0;
		/** 只有最新一代实例的监听器才生效（老实例残留的监听器自我禁用）。 */
		function activeGeneration() {
			try {
				return GENERATION !== 0 && window[GENERATION_KEY] === GENERATION;
			} catch (error) {
				return true;
			}
		}
		/** 客户端半端版本。 */
		var CLIENT_VERSION = "0.6.0";
		/** 宿主路由前綴：lib/index.js 註冊的 {kind:'prefix', path:HOST_PREFIX}。 */
		var HOST_PREFIX = "/agent-menu";
		var FONT =
			'13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
		/**
		 * 菜单底色刻意**不用** `--dsw-specific-menu`：它在深/浅色下分别是
		 * `#303136f0` / `#f8f9faf0`，末位 f0 = 94% 不透明，正文会透出来。
		 * 这里用 `--dsw-alias-bg-layer-2`（解析为 `--dsw-static-neutral-bluish-850`
		 * = `rgb(44,44,46)` / `bluish-00` = `rgb(255,255,255)`，全不透明），
		 * 并在最前面留一个 `--dsh-am-menu-bg` 供用户自行覆盖。
		 */
		var CSS = [
			"#" + MENU_ID + "{position:fixed;z-index:2147483000;min-width:200px;max-width:340px;padding:4px;",
			"border:1px solid var(--dsw-alias-border-l2,#3a3a3d);border-radius:10px;",
			"background:var(--dsh-am-menu-bg,var(--dsw-alias-bg-layer-2,#2c2c2e));",
			"box-shadow:0 10px 30px rgba(0,0,0,.38);font:" + FONT + ";",
			"color:var(--dsw-alias-label-primary,#e8e8ea);user-select:none}",
			"#" + MENU_ID + " ." + ITEM_CLASS + "{display:flex;align-items:center;gap:12px;width:100%;padding:7px 10px;",
			"border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}",
			"#" + MENU_ID + " ." + ITEM_CLASS + ":hover,#" + MENU_ID + " ." + ITEM_CLASS + ":focus-visible{",
			"background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));outline:none}",
			"#" + MENU_ID + " .dsh-am-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			"#" + MENU_ID + " .dsh-am-hint{flex:none;color:var(--dsw-alias-label-tertiary,#8b8b93);font-size:11px}",
			"#" + MENU_ID + " .dsh-am-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.09))}",
			"#" + TOAST_ID + "{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483001;",
			"padding:8px 14px;border-radius:9px;background:var(--dsw-alias-bg-layer-3,#333);",
			"color:var(--dsw-alias-label-primary,#eee);font:" + FONT + ";box-shadow:0 8px 24px rgba(0,0,0,.4);",
			"opacity:0;transition:opacity .18s ease;pointer-events:none;max-width:70vw}",
			"#" + TOAST_ID + ".dsh-am-show{opacity:1}",
			"#" + TOAST_ID + ".dsh-am-error{background:#7f1d1d;color:#fff}",
		].join("");

		/** 文案集中在一处，便于以后接 locale 服务做多语言。 */
		var LANG = {
			quote: "引用到输入框",
			send: "发送给 AI",
			explain: "让 AI 解释这段内容",
			translateToZh: "翻译选区为中文",
			translateToEn: "翻译选区为英文",
			summarize: "总结选区",
			continueWrite: "续写",
			refactorCode: "优化这段代码",
			testsCode: "生成单元测试",
			copy: "复制",
			copyHint: "Ctrl+C",
			cut: "剪切",
			cutHint: "Ctrl+X",
			paste: "粘贴",
			pasteHint: "Ctrl+V",
			selectAll: "全选",
			selectAllHint: "Ctrl+A",
			copyPath: "复制路径",
			reveal: "打开文件位置",
			openWith: "用默认应用打开",
			copyLink: "复制链接地址",
			openLink: "在浏览器中打开",
			quoteBlock: "引用此段到输入框",
			quoteCode: "引用代码到输入框",
			explainBlock: "让 AI 解释此段",
			explainCode: "让 AI 解释这段代码",
			summarizeBlock: "总结此段",
			/** 「复制此段」（非代码段落 / 文件芯片处）——2026-10-14 按用户要求停用。
			 *  键保留，改回一句话即可恢复：把 itemsForBlock 里的 if (code) 还原成
			 *  label: code ? LANG.copyCode : LANG.copyBlock 的无条件 push。 */
			copyBlock: "复制此段",
			copyCode: "复制代码",
			copyAsCodeBlock: "复制为代码块",
			copyWithoutLang: "复制（不带语言标记）",
			copyRelativePath: "复制相对路径",
			copyFileUrl: "复制本地文件链接",
			copyFileName: "复制文件名",
			copyAsMarkdownLink: "复制为 Markdown 链接",
			undo: "撤销",
			redo: "重做",
			copyImage: "复制图像",
			copyImageSrc: "复制图片地址",
			saveImageAs: "另存为…",
			removeImage: "从输入框移除",
			openInEditor: "在编辑器中打开",
			imageFailed: "图片操作失败：",
			imagePathUnknown: "解析不出这张图的本地路径",
			savedTo: "已另存为：",
			noSession: "当前没有活动会话",
			noComposer: "输入框不可用",
			sendFailed: "发送失败：",
			quoted: "已引用到输入框",
			copied: "已复制",
			copyFailed: "复制失败：",
			cutFailed: "剪切失败",
			pasteFailed: "粘贴失败",
			selectAllFailed: "全选失败",
			openLinkFailed: "打开链接失败",
			pathNotExist: "路径不存在：",
			clipboardDenied: "复制失败：剪贴板被拒绝",
			clipboardUnavailable: "复制失败：剪贴板不可用",
			nothingToCopy: "没有可复制的内容",
			actionFailed: "操作失败：",
			promptExplain: "请解释以下内容。用平实的语言讲清核心意思与关键细节：\n\n",
			promptTranslateZh: "请把以下内容翻译成中文，保留原有格式与专有名词：\n\n",
			promptTranslateEn:
				"Please translate the following content into English, preserving the original formatting and terminology:\n\n",
			promptSummarize: "请总结以下内容，用简短的要点列出核心信息：\n\n",
			promptContinue: "请接着以下内容继续写，保持原有风格与思路，直接续写正文：\n\n",
			promptRefactor: "请优化并重构以下代码：说明改动点与理由，并给出完整代码：\n\n",
			promptTests: "请为以下代码编写单元测试，覆盖主要路径与边界情况：\n\n",
		};

		var toastTimer = null;
		/** 当前菜单项（激活时按 data-index 取回）。 */
		var menuItems = [];
		/** 菜单矩形与抑制窗口：激活后吞掉随之而来的 mouseup/click。 */
		var menuRect = null;
		var suppressUntil = 0;
		var suppressRect = null;

		/** 注入样式表（只注入一次）。 */
		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return;
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.dataset.plugin = "dsh-agent-menu";
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		/** 底部提示条。 */
		function toast(message, isError) {
			try {
				var node = document.getElementById(TOAST_ID);
				if (node === null) {
					node = document.createElement("div");
					node.id = TOAST_ID;
					document.body.appendChild(node);
				}
				node.textContent = message;
				node.className = "dsh-am-show" + (isError === true ? " dsh-am-error" : "");
				if (toastTimer !== null) clearTimeout(toastTimer);
				toastTimer = setTimeout(
					function () {
						node.className = "";
						toastTimer = null;
					},
					isError === true ? 3600 : 1800,
				);
			} catch (error) {
				console.warn("[dsh-agent-menu] toast failed:", error);
			}
		}

		/** POST JSON 并归一化结果（只用于调用宿主的 /agent-menu 路由）。 */
		function postJson(url, payload) {
			return fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			}).then(
				function (response) {
					return response
						.json()
						.catch(function () {
							return {};
						})
						.then(function (body) {
							return {
								status: response.status,
								ok: response.ok && body !== null && body.ok !== false,
								error: body === null ? undefined : body.error,
								body: body,
							};
						});
				},
				function (error) {
					return { status: 0, ok: false, error: error.message };
				},
			);
		}

		/** 关闭菜单（清掉所有同 ID 节点，避免重复注册留下的孤儿菜单）。 */
		function closeMenu() {
			var nodes = document.querySelectorAll("#" + MENU_ID);
			for (var index = 0; index < nodes.length; index += 1) {
				var node = nodes[index];
				if (node.parentNode !== null) node.parentNode.removeChild(node);
			}
			menuItems = [];
			menuRect = null;
		}

		/** 执行一个菜单项。 */
		function activateItem(item) {
			if (item === undefined || item === null) return;
			closeMenu();
			try {
				item.run();
			} catch (error) {
				console.warn("[dsh-agent-menu] action failed:", error);
				toast(LANG.actionFailed + (error !== null && error !== undefined ? error.message : "未知错误"), true);
			}
		}

		// ─────────────────────────── 会话与输入框 ───────────────────────────

		/** 当前会话 id（取自客户端 sessions 服务的列表快照 `current`）；取不到返回空串。 */
		function currentSessionId() {
			try {
				if (pluginCtx === null || typeof pluginCtx.get !== "function") return "";
				var sessions = pluginCtx.get("sessions");
				if (sessions === undefined || sessions === null) return "";
				var list = sessions.list;
				if (list === undefined || list === null || typeof list.getSnapshot !== "function") return "";
				var snapshot = list.getSnapshot();
				if (snapshot === undefined || snapshot === null) return "";
				if (typeof snapshot.current === "string") return snapshot.current;
				// DSH 0.2.1-rc.2 的列表快照没有 current 字段：当前打开的会话 = 被主视图持有的那个（retainedBy.mainView > 0）。
				var byIdAll = snapshot.byId;
				if (byIdAll === undefined || byIdAll === null) return "";
				var idsAll = Object.keys(byIdAll);
				for (var q = 0; q < idsAll.length; q += 1) {
					var item = byIdAll[idsAll[q]];
					if (item && item.retainedBy && item.retainedBy.mainView > 0) return idsAll[q];
				}
				return "";
			} catch (error) {
				return "";
			}
		}

		/** 当前会话的输入框 shell（`conversation.input.shell(sessionId)`）；取不到返回 null。 */
		function composerShell(sessionId) {
			if (sessionId === "") return null;
			try {
				if (pluginCtx === null || typeof pluginCtx.get !== "function") return null;
				var conversation = pluginCtx.get("conversation");
				if (conversation === undefined || conversation === null) return null;
				var input = conversation.input;
				if (input === undefined || input === null || typeof input.shell !== "function") return null;
				var shell = input.shell(sessionId);
				return shell === undefined || shell === null ? null : shell;
			} catch (error) {
				return null;
			}
		}

		/** 读输入框当前草稿（state 快照的 draft 字段）；读不到返回空串。 */
		function shellDraft(shell) {
			try {
				var state = shell.state;
				if (state === undefined || state === null || typeof state.getSnapshot !== "function") return "";
				var snapshot = state.getSnapshot();
				if (snapshot === undefined || snapshot === null) return "";
				return typeof snapshot.draft === "string" ? snapshot.draft : "";
			} catch (error) {
				return "";
			}
		}

		/**
		 * setDraft 后轮询等草稿落定再回调。
		 * setDraft 走 Lexical 的异步更新，而 submit 读的是编辑器投影：
		 * 同一 tick 里连着调，提交上去的还是空草稿（dsh-suggest-actions 的血泪教训）。
		 */
		function waitForDraft(shell, expected, then) {
			var tries = 0;
			var tick = function () {
				var draft = shellDraft(shell);
				if (draft === expected || tries >= DRAFT_WAIT_TRIES) {
					then();
					return;
				}
				tries += 1;
				window.setTimeout(tick, DRAFT_WAIT_MS);
			};
			window.setTimeout(tick, 0);
		}

		/** 把文本追加到输入框草稿（不动用户已输入的内容），不发送。 */
		function quoteIntoComposer(text) {
			var shell = composerShell(currentSessionId());
			if (shell === null) {
				toast(LANG.noComposer, true);
				return;
			}
			var actions = shell.actions;
			if (actions === undefined || actions === null || typeof actions.setDraft !== "function") {
				toast(LANG.noComposer, true);
				return;
			}
			var current = shellDraft(shell);
			var next = current === "" ? text : current + "\n\n" + text;
			try {
				actions.setDraft(next);
			} catch (error) {
				toast(LANG.actionFailed + error.message, true);
				return;
			}
			// 顺手聚焦输入框，方便接着补一句话再发。
			try {
				if (shell.editor !== undefined && shell.editor !== null && typeof shell.editor.focus === "function") {
					shell.editor.focus();
				}
			} catch (error) {
				/* 聚焦失败不影响引用 */
			}
			toast(LANG.quoted);
		}

		/** 用用户的身份把一条文本直接发给 AI（写草稿 → 等落定 → 提交）。 */
		function sendAsUser(text) {
			var shell = composerShell(currentSessionId());
			if (shell === null) {
				toast(LANG.noSession, true);
				return;
			}
			var actions = shell.actions;
			if (
				actions === undefined ||
				actions === null ||
				typeof actions.setDraft !== "function" ||
				typeof actions.submit !== "function"
			) {
				toast(LANG.noComposer, true);
				return;
			}
			try {
				actions.setDraft(text);
			} catch (error) {
				toast(LANG.sendFailed + error.message, true);
				return;
			}
			waitForDraft(shell, text, function () {
				try {
					actions.submit();
				} catch (error) {
					console.warn("[dsh-agent-menu] submit failed:", error);
					toast(LANG.sendFailed + error.message, true);
				}
			});
		}

		/** Agent 动作是否可用（有活动会话且输入框 shell 可用）；不可用时菜单里不出现这些项。 */
		function agentActionsAvailable() {
			return composerShell(currentSessionId()) !== null;
		}

		// ─────────────────────────── 复制 ───────────────────────────

		/** 本地复制：execCommand 优先，再退回 Clipboard API。 */
		function localCopy(value) {
			var ok = false;
			try {
				var area = document.createElement("textarea");
				area.value = value;
				area.setAttribute("readonly", "readonly");
				area.style.position = "fixed";
				area.style.top = "-1000px";
				area.style.opacity = "0";
				document.body.appendChild(area);
				area.focus();
				area.select();
				ok = document.execCommand("copy");
				if (area.parentNode !== null) area.parentNode.removeChild(area);
			} catch (error) {
				ok = false;
			}
			if (ok) {
				toast(LANG.copied);
				return;
			}
			try {
				if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === "function") {
					navigator.clipboard.writeText(value).then(
						function () {
							toast(LANG.copied);
						},
						function () {
							toast(LANG.clipboardDenied, true);
						},
					);
					return;
				}
			} catch (error) {
				/* 落到失败提示 */
			}
			toast(LANG.clipboardUnavailable, true);
		}

		/**
		 * 调宿主路由。优先自己的 /agent-menu（0.2.0 起自帶），失敗再借 dsh-file-menu 的
		 * /file-menu（0.1.x 時代的老路徑），再失敗由調用方決定降級——這樣兩個版本
		 * 任意一個在位都能用，也方便卸掉 file-menu 後平滑過渡。
		 */
		function callHost(action, payload) {
			return postJson(HOST_PREFIX + "/" + action, payload).then(function (own) {
				if (own.ok || own.status === 0) return own;
				return postJson("/file-menu/" + action, payload);
			});
		}

		/**
		 * 复制文本。先請宿主寫**系統**剪貼板（Electron 主進程 / PowerShell，比渲染
		 * 進程剪貼板可靠），失敗再退回瀏覽器本地復制。
		 */
		function copyText(text) {
			var value = String(text == null ? "" : text);
			if (value === "") {
				toast(LANG.nothingToCopy, true);
				return;
			}
			callHost("clipboard", { text: value }).then(function (result) {
				if (result.ok) {
					toast(LANG.copied);
					return;
				}
				localCopy(value);
			});
		}

		/** 剪切：只對可編輯區有意義。 */
		function cutInto(editable) {
			try {
				if (editable === null || typeof document.execCommand !== "function") {
					toast(LANG.cutFailed, true);
					return;
				}
				document.execCommand("cut");
			} catch (error) {
				toast(LANG.cutFailed, true);
			}
		}

		/**
		 * 粘貼到可編輯區。execCommand('paste') 在渲染進程幾乎必然被拒（無用戶手勢），
		 * 所以走 Clipboard API 讀取 + insertText 寫入；再不行就提示用 Ctrl+V。
		 */
		function pasteInto(editable) {
			if (editable === null) {
				toast(LANG.pasteFailed, true);
				return;
			}
			try {
				if (editable !== null && typeof editable.focus === "function") editable.focus();
			} catch (error) {
				/* 聚焦失敗不影響後續 insertText */
			}
			try {
				if (navigator.clipboard !== undefined && typeof navigator.clipboard.readText === "function") {
					navigator.clipboard.readText().then(
						function (value) {
							insertTextInto(editable, value);
						},
						function () {
							toast(LANG.pasteFailed, true);
						},
					);
					return;
				}
			} catch (error) {
				/* 落到 execCommand */
			}
			try {
				document.execCommand("paste");
			} catch (error) {
				toast(LANG.pasteFailed, true);
			}
		}

		/** 把文本插到可編輯區的當前光標處。 */
		function insertTextInto(editable, value) {
			try {
				if (editable !== null && typeof document.execCommand === "function") {
					document.execCommand("insertText", false, value);
					return;
				}
			} catch (error) {
				/* 落到手動追加 */
			}
			try {
				if (editable !== null && typeof editable.value === "string") {
					editable.value += value;
					return;
				}
				if (editable !== null && typeof editable.textContent === "string") {
					editable.textContent += value;
				}
			} catch (error) {
				/* 忽略 */
			}
		}

		/** 全選可編輯區。 */
		function selectAllIn(editable) {
			try {
				if (editable !== null && typeof editable.select === "function") {
					editable.select();
					return;
				}
				document.execCommand("selectAll");
			} catch (error) {
				toast(LANG.selectAllFailed, true);
			}
		}

		/** 調用宿主做文件動作（reveal / open），失敗時把宿主回的錯誤顯示出來。 */
		function callFileAction(action, rawPath, base) {
			callHost(action, { path: rawPath, base: base === undefined ? "" : base }).then(function (result) {
				if (result.ok) return;
				var error = result.error === undefined ? "" : result.error;
				if (result.status === 404) toast(LANG.pathNotExist + rawPath, true);
				else if (result.status === 0) toast(LANG.actionFailed + (error === "" ? "宿主路由不可达" : error), true);
				else toast(LANG.actionFailed + error, true);
			});
		}

		// ─────────────────────────── 上下文识别 ───────────────────────────

		/** 找到最近的可编辑元素（输入框交给 dsh-file-menu 的剪贴板菜单，本插件不出 Agent 项）。 */
		function editableOf(target) {
			var node = target;
			var depth = 0;
			while (node !== null && node !== undefined && node.nodeType === 1 && depth < 10) {
				depth += 1;
				var tag = node.tagName;
				if (tag === "INPUT" || tag === "TEXTAREA") {
					var type = String(node.getAttribute("type") || "text").toLowerCase();
					if (type !== "checkbox" && type !== "radio" && type !== "button") return node;
				}
				if (node.isContentEditable === true) return node;
				node = node.parentElement;
			}
			return null;
		}

		/** 取点击位置所在块级元素（段落/列表项/代码块等）的文本。 */
		function textBlockOf(target) {
			var node = target;
			if (node !== null && node.nodeType === 3) node = node.parentElement;
			if (node === null || node === undefined) return "";
			var block =
				typeof node.closest === "function"
					? node.closest("p,li,pre,blockquote,td,th,h1,h2,h3,h4,h5,h6,code,div")
					: null;
			if (block === null) block = node;
			var text = String(block.innerText == null ? block.textContent : block.innerText).trim();
			if (text === "") return "";
			return text.length > MAX_EMBED ? text.slice(0, MAX_EMBED) : text;
		}

		/** 点击目标是否在代码块里（整块 `<pre>` 或行内 `<code>`）。 */
		function inCodeOf(target) {
			var node = target;
			if (node !== null && node.nodeType === 3) node = node.parentElement;
			if (node === null || node === undefined || typeof node.closest !== "function") return false;
			return node.closest("pre, code") !== null;
		}

		/** 找到最近的链接地址（原始 href，不做归一化）；没有返回 null。 */
		function linkOf(target) {
			var node = target;
			var depth = 0;
			while (node !== null && node !== undefined && node.nodeType === 1 && depth < 10) {
				depth += 1;
				if (node.tagName === "A") {
					var href = node.getAttribute("href");
					if (typeof href === "string" && href.trim() !== "") return href;
				}
				node = node.parentElement;
			}
			return null;
		}

		// ── 图片 / 代码块识别（0.3.0 新增）──────────────────────────

		/**
		 * DSH 把所有会话媒体（图片、附件）挂在同一条路由上：
		 *   GET /api/file?path=<encodeURIComponent(绝对路径)>
		 * 宿主文档原文：`SessionMediaReferences` mounts `GET|HEAD /api/file?path=<absolute path>`，
		 * 经 ctx.fs 读，「including temporary paths outside registered workspaces」。
		 * 所以图片的绝对路径**可以直接从 src 解出来**，不用猜、不用扫元素文本。
		 * 解不出就返回空串——调用方据此隐藏「资源管理器打开 / 另存为」，绝不误报。
		 */
		function mediaPathOf(img) {
			if (img === null || img === undefined) return "";
			var src = "";
			try {
				src = String(img.currentSrc || img.getAttribute("src") || "");
			} catch (error) {
				return "";
			}
			if (src === "") return "";
			var match = /[?&]path=([^&#]*)/.exec(src);
			if (match === null) return "";
			var raw = "";
			try {
				raw = decodeURIComponent(match[1]);
			} catch (error) {
				return "";
			}
			return pathCandidate(raw, false);
		}

		/** 图片的完整地址（相对地址补全成绝对），用于「复制图片地址」「新标签页打开」。 */
		function imageSrcOf(img) {
			if (img === null || img === undefined) return "";
			try {
				var src = String(img.currentSrc || img.getAttribute("src") || "");
				if (src === "") return "";
				return new URL(src, location.href).href;
			} catch (error) {
				return "";
			}
		}

		/**
		 * 这张图是不是「内容图」（值得给图片菜单），而不是图标 / 头像 / 装饰。
		 *
		 * 0.5.0 只认对话区里的图，结果输入框草稿缩略图和放大预览层都被漏掉
		 * （用户反馈：那两处右键完全没反应）。现在改成按节点形态认图，不再只看容器：
		 *   · `blob:` / `data:` / `/api/file?path=` / `/dsh-memes/` 这几种地址就是内容图，
		 *     DSH 自己就是拿这几种地址渲染会话图、草稿缩略图、表情图；
		 *   · 另外两个方向偷懒的兜底：图够大（≥32px）或有 alt 文本；
		 *   · 排除侧边栏行（那里右键归官方 ⋮ 菜单）和明显的小图标（<28px 见方）。
		 */
		function isContentImage(img) {
			if (img === null || img === undefined) return false;
			try {
				if (sidebarRowOf(img) !== null) return false;
				var src = String(img.currentSrc || img.getAttribute("src") || "");
				if (src === "") return false;
				if (/^(blob:|data:)/i.test(src)) return true;
				if (/\/api\/file\?path=/.test(src)) return true;
				if (/\/dsh-memes\//.test(src)) return true;
				var naturalWidth = Number(img.naturalWidth || 0);
				var naturalHeight = Number(img.naturalHeight || 0);
				var box = typeof img.getBoundingClientRect === "function" ? img.getBoundingClientRect() : null;
				var width = naturalWidth > 0 ? naturalWidth : box === null ? 0 : box.width;
				var height = naturalHeight > 0 ? naturalHeight : box === null ? 0 : box.height;
				if (width > 0 && height > 0 && width < 28 && height < 28) return false;
				if (width >= 32 || height >= 32) return true;
				return String(img.getAttribute("alt") || "").trim() !== "";
			} catch (error) {
				return false;
			}
		}

		/**
		 * 右键落在放大预览层里吗。
		 *
		 * 官方 `ImageLightbox`（ui-primitives/src/ImageLightbox.tsx）是 createPortal 到
		 * document.body 的 `div[role="dialog"][aria-modal="true"]`，图不在对话区里。
		 * 0.5.0 因为「不在对话区」直接放行，而桌面版又没有原生菜单兜底
		 * （lib/main.js:11998 空 items 不弹），所以右键一点反应都没有。
		 */
		function inImageOverlay(target) {
			var node = target;
			if (node !== null && node !== undefined && node.nodeType === 3) node = node.parentElement;
			if (node === null || node === undefined) return false;
			// ① 官方某些版本把预览层做成 role=dialog / aria-modal。
			try {
				if (typeof node.closest === "function" && node.closest('[role="dialog"], [aria-modal="true"]') !== null) return true;
			} catch (error) {
				/* 查不了就看下一条 */
			}
			// ② 实测（0.6.0 桌面版）预览层是 createPortal 到 body 的裸 div：祖先链只有
			//    IMG < DIV < BODY，既没有 role 也没有 aria-modal。所以再按「是不是挂在 body
			//    底下的浅层门户」认一次——对话区/输入框里的图都深埋在自己根容器里，
			//    走到 body 要十几层，不会误判。
			var depth = 0;
			var walker = node;
			while (walker !== null && walker !== undefined && walker.nodeType === 1 && depth < 6) {
				depth += 1;
				if (walker === document.body) return depth <= 4;
				walker = walker.parentElement;
			}
			return false;
		}

		/**
		 * 这张图是不是在输入框的草稿附件区里。
		 *
		 * 官方附件草稿栏（ui-attachment `AttachmentRail`）是 composer 下方的一条
		 * `div[role="group"]` 横向轨道，缩略图在轨道的 item 里，**不在 contenteditable 内部**，
		 * 所以 0.5.0 的「可编辑框里才有图片菜单」判定把它整片漏掉了。
		 * 这里改成向上找「含 contenteditable 的 composer 外壳」：草稿栏就挂在它里面。
		 */
		function inComposerArea(target) {
			var node = target;
			if (node !== null && node !== undefined && node.nodeType === 3) node = node.parentElement;
			var depth = 0;
			while (node !== null && node !== undefined && node.nodeType === 1 && depth < 20) {
				depth += 1;
				if (node === document.body || node === document.documentElement) return false;
				try {
					// 走到「含对话节点」的容器说明已经是整片右栏，再往外就不再是输入框外壳了。
					if (typeof node.querySelector === "function" && node.querySelector(CHAT_SCOPE) !== null) return false;
					if (typeof node.querySelector === "function" && node.querySelector('[contenteditable="true"]') !== null) return true;
				} catch (error) {
					/* 查不了就当不在 */
				}
				node = node.parentElement;
			}
			return false;
		}

		/** 点击目标本身或最近祖先里的 <img>；没有返回 null。只认 IMG，不认 role="img"。 */
		function imageOf(target) {
			var node = target;
			if (node !== null && node !== undefined && node.nodeType === 3) node = node.parentElement;
			var depth = 0;
			while (node !== null && node !== undefined && node.nodeType === 1 && depth < 8) {
				depth += 1;
				if (node.tagName === "IMG") return node;
				node = node.parentElement;
			}
			return null;
		}

		/**
		 * 代码块：返回 { node, text, lang }；点击不在 `<pre>` 里返回 null。
		 * 语言标记优先取 class（language-xxx / lang-xxx），其次 data-lang / data-language。
		 */
		function codeBlockOf(target) {
			var node = target;
			if (node !== null && node !== undefined && node.nodeType === 3) node = node.parentElement;
			if (node === null || node === undefined || typeof node.closest !== "function") return null;
			var pre = node.closest("pre");
			if (pre === null) return null;
			var text = String(pre.innerText == null ? pre.textContent : pre.innerText).replace(/\s+$/, "");
			if (text === "") return null;
			var lang = "";
			try {
				var code = pre.querySelector("code");
				var host = code === null ? pre : code;
				var cls = String(host.className == null ? "" : host.className);
				var hit = /(?:language|lang)-([A-Za-z0-9+#.-]+)/.exec(cls);
				if (hit !== null) lang = hit[1];
				if (lang === "") {
					var attr = pre.getAttribute("data-lang") || pre.getAttribute("data-language");
					if (typeof attr === "string") lang = attr.trim();
				}
			} catch (error) {
				lang = "";
			}
			return { node: pre, text: text, lang: lang };
		}

		/**
		 * 路径检测。DSH 对工作区内的文件只显示**相对路径**，工具行的 fileLink 按钮更是
		 * 既没有 title 也没有 data-path——路径只写在文本里。所以必须：
		 *   1. 六个属性（data-path / data-file-path / data-filepath / data-file / title / aria-label）
		 *   2. dataset 里键名含 path 的任意属性
		 *   3. CODE/SPAN/A/BUTTON 的**文本**（带扩展名启发式，避免把整句话当路径）
		 * 返回候选串（可能是相对路径），解析交给 displayPathOf + 宿主端。
		 */
		function looksAbsolutePath(value) {
			if (typeof value !== "string") return false;
			var text = value.trim();
			if (text === "" || text.length > 512 || text.indexOf("\n") !== -1) return false;
			if (/^[A-Za-z]:[\\/]/.test(text)) return true;
			if (/^\\\\[^\\]/.test(text)) return true;
			if (text.charAt(0) === "/" && text.charAt(1) !== "/") return true;
			return false;
		}

		/**
		 * 清洗一个候选路径串，返回可用的候选（绝对 / `~` 家目录 / 相对），不可用返回空串。
		 * @param value 原始串（属性值或元素文本）。
		 * @param fromText 是否来自元素文本：来自文本时判据更严，避免把整句话或
		 *   「复制/粘贴」这种带斜杠的词当成路径（要求末段带扩展名）。
		 */
		function pathCandidate(value, fromText) {
			if (typeof value !== "string") return "";
			var text = value.trim();
			if (text === "" || text.length > 512 || /[\r\n]/.test(text)) return "";
			// 剥掉 markdown 反引号与成对引号，以及 @ 引用芯片前缀。
			text = text.replace(/^[`'"“”]+/, "").replace(/[`'"“”]+$/, "").trim();
			if (text.charAt(0) === "@") text = text.slice(1).trim();
			if (text === "" || text.length > 512) return "";
			if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return "";
			if (looksAbsolutePath(text)) return text;
			if (text === "~" || /^~[\\/]/.test(text)) return text;
			// 相对路径：必须带分隔符、不带空白、不带中文标点，且不是裸斜杠开头。
			if (/\s/.test(text)) return "";
			if (/[，。；：！？、（）【】《》“”]/.test(text)) return "";
			if (text.indexOf("/") === -1 && text.indexOf("\\") === -1) return "";
			if (/^[\\/]/.test(text)) return "";
			if (fromText === true && !/\.[A-Za-z0-9]{1,10}$/.test(text)) return "";
			return text;
		}

		/** 从点击目标向上找文件路径（属性 → dataset → 元素文本）。 */
		function pathFromTarget(target) {
			var node = target;
			var depth = 0;
			while (node !== null && node !== undefined && node.nodeType === 1 && depth < 24) {
				depth += 1;
				if (node.getAttribute !== undefined) {
					var attrs = ["data-path", "data-file-path", "data-filepath", "data-file", "title", "aria-label"];
					for (var index = 0; index < attrs.length; index += 1) {
						var found = pathCandidate(node.getAttribute(attrs[index]), false);
						if (found !== "") return found;
					}
				}
				if (node.dataset !== undefined && node.dataset !== null) {
					for (var key in node.dataset) {
						if (Object.prototype.hasOwnProperty.call(node.dataset, key) && /path/i.test(key)) {
							var fromData = pathCandidate(node.dataset[key], false);
							if (fromData !== "") return fromData;
						}
					}
				}
				var tag = node.tagName;
				if (tag === "CODE" || tag === "SPAN" || tag === "A" || tag === "BUTTON") {
					var fromText = pathCandidate(String(node.textContent == null ? "" : node.textContent), true);
					if (fromText !== "") return fromText;
				}
				node = node.parentElement;
			}
			return "";
		}

		/**
		 * 当前会话的工作区根目录（绝对路径）。取自客户端 `sessions` 服务的列表快照：
		 * `list.getSnapshot().current` → `byId[id].cwd`。拿不到就返回空串（相对路径
		 * 会因此不显示文件操作，但绝不误报）。
		 */
		function workspaceBase() {
			try {
				var id = currentSessionId();
				if (id === "") return "";
				var sessions = pluginCtx.get("sessions");
				var record = sessions.list.getSnapshot().byId[id];
				if (record === undefined || record === null) return "";
				return typeof record.cwd === "string" ? record.cwd : "";
			} catch (error) {
				return "";
			}
		}

		/** 把相对候选拼到工作区根后面（只用于展示与复制；宿主端会再权威解析一次）。 */
		function joinPath(base, relative) {
			if (base === "" || relative === "") return relative;
			var separator = base.indexOf("\\") !== -1 ? "\\" : "/";
			var rest = relative.replace(/^\.?[\\/]+/, "");
			// 统一分隔符，避免拼出 `D:\a\b/c/d` 这种混合串。
			rest = separator === "\\" ? rest.replace(/\//g, "\\") : rest.replace(/\\/g, "/");
			return base.replace(/[\\/]+$/, "") + separator + rest;
		}

		/** 候选串 → 可展示/可复制的路径；解析不出来返回空串（此时不显示文件操作）。 */
		function displayPathOf(raw, base) {
			if (raw === "") return "";
			if (looksAbsolutePath(raw)) return raw;
			if (raw === "~" || /^~[\\/]/.test(raw)) return raw;
			if (base === "") return "";
			return joinPath(base, raw);
		}

		/** 链接归一化成绝对地址；解析不了就原样返回。 */
		function absoluteLink(href) {
			try {
				return new URL(href, window.location.href).href;
			} catch (error) {
				return href;
			}
		}

		/** 判断文本是否以中文为主（决定翻译方向）。 */
		function looksCjk(text) {
			return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text.slice(0, 4000));
		}

		/** 提示模板嵌入正文：超长截断并标注，避免一条消息塞进整篇文档。 */
		function embed(text) {
			if (text.length <= MAX_EMBED) return text;
			return text.slice(0, MAX_EMBED) + "\n…（内容过长已截断）";
		}

		// ─────────────────────────── 菜单构建 ───────────────────────────

		/** 选中文字时的菜单项：引用 / 发送 / 提示模板 / 复制。 */
		// 0.5.0 精简（2026-10-19，用户要求）：选区菜单只剩「复制」。引用到输入框、发给 AI、
		// 解释/翻译/总结/续写/代码模板全部去掉——AI 动作会打断主会话正在进行的工作，
		// 用户改用侧边追问类插件；引用则和复制粘贴重复。代码块里的选区与普通文字一致。
		function itemsForSelection(target, selection) {
			var items = [];
			items.push({
				label: LANG.copy,
				hint: LANG.copyHint,
				run: function () {
					copyText(selection);
				},
			});
			return items;
		}

		/** 无选中时的菜单项：所在段落/代码块 → 引用 / 解释 / 总结 / 复制。 */
		function itemsForBlock(target, blockText) {
			var items = [];
			var code = inCodeOf(target);
			var agentOk = agentActionsAvailable();

			if (agentOk) {
				items.push({
					label: code ? LANG.quoteCode : LANG.quoteBlock,
					run: function () {
						quoteIntoComposer(blockText);
					},
				});
				items.push({
					label: code ? LANG.explainCode : LANG.explainBlock,
					run: function () {
						sendAsUser(LANG.promptExplain + embed(blockText));
					},
				});
				if (!code) {
					items.push({
						label: LANG.summarizeBlock,
						run: function () {
							sendAsUser(LANG.promptSummarize + embed(blockText));
						},
					});
				} else {
					items.push({
						label: LANG.refactorCode,
						run: function () {
							sendAsUser(LANG.promptRefactor + embed(blockText));
						},
					});
				}
				// 分隔线只在下一条真的是「复制代码」时才补。非代码段落已经没有尾部
				// 复制项了，无条件补会让菜单末尾留一条悬空横线。
				if (code) items.push({ separator: true });
			}
			// 「复制此段」（非代码段落）已按用户要求移除（2026-10-14）。**只删这一项**：
			// 代码块里的「复制代码」照旧，AI 三项（引用 / 解释 / 总结）照旧。
			// 于是本函数只在 code === true 时有产出了——「无会话 + 非代码段落」会返回空数组，
			// 那种点击由 onContextMenu 的闸门提前放行，不会出现「拦了原生菜单又什么都没有」。
			if (code) {
				items.push({
					label: LANG.copyCode,
					run: function () {
						copyText(blockText);
					},
				});
			}
			return items;
		}

		/**
		 * 文件芯片 / 工具行文件链接：文件操作为主，AI 项为辅。
		 * 0.1.0 完全没有这一支（超链接和文件芯片都让给 dsh-file-menu），这正是
		 * 「右键超链接只有一个复制代码」的根因——不是单点 bug，是覆盖面太窄。
		 */
		function itemsForFile(context, rawPath, base, path) {
			var items = [];
			items.push({
				label: LANG.copyPath,
				run: function () {
					copyText(path);
				},
			});
			items.push({
				label: LANG.reveal,
				run: function () {
					callFileAction("reveal", rawPath, base);
				},
			});
			items.push({
				label: LANG.openWith,
				run: function () {
					callFileAction("open", rawPath, base);
				},
			});
			// 芯片常给的是相对路径（`src/main.ts`）。要出「相对路径 / 本地文件链接」得先有
			// 绝对路径，所以在这里补全一次；补不出来就不给这两项（宁可少一项，绝不误报）。
			var absolute = looksAbsolutePath(rawPath) ? rawPath : base === "" ? "" : joinPath(base, rawPath);
			var relative = relativeTo(absolute, base);
			if (relative !== "") {
				items.push({
					label: LANG.copyRelativePath,
					run: function () {
						copyText(relative);
					},
				});
			}
			var fileUrl = absolute === "" ? "" : fileUrlOf(absolute);
			if (fileUrl !== "") {
				items.push({
					label: LANG.copyFileUrl,
					run: function () {
						copyText(fileUrl);
					},
				});
			}
			var nameOnly = rawPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
			if (nameOnly !== "" && nameOnly !== rawPath) {
				items.push({
					label: LANG.copyFileName,
					run: function () {
						copyText(nameOnly);
					},
				});
			}
			// 原先这里还有一段「复制此段」（复制所在段落文本），已按用户要求移除
			// （2026-10-14）。连前面的分隔线一起删掉，避免菜单末尾留一条悬空横线。
			return items;
		}

		/**
		 * 超链接：复制地址 / 浏览器打开为主；若这段文字本身值得问 AI，再补引用与解释。
		 * 0.1.0 的 decide() 对 link 分支完全留空，右键超链接只能落到 file-menu。
		 */
		function itemsForLink(context, link) {
			var items = [];
			var target = absoluteLink(link);
			items.push({
				label: LANG.copyLink,
				run: function () {
					copyText(target);
				},
			});
			items.push({
				label: LANG.copyAsMarkdownLink,
				run: function () {
					var text = "";
					try {
						if (typeof context.target.closest === "function") {
							var anchor = context.target.closest("a");
							if (anchor !== null) text = String(anchor.innerText == null ? anchor.textContent : anchor.innerText).trim();
						}
					} catch (error) {
						text = "";
					}
					copyText("[" + (text === "" ? target : text) + "](" + target + ")");
				},
			});
			items.push({
				label: LANG.openLink,
				run: function () {
					try {
						window.open(target, "_blank", "noopener,noreferrer");
					} catch (error) {
						toast(LANG.openLinkFailed, true);
					}
				},
			});
			return items;
		}

		// ── 0.3.0 新增：路径小工具 ────────────────────────────────

		/** 相对路径：仅在 path 是绝对路径且 base 已知且确实在 base 之下时才给，否则空串。 */
		function relativeTo(path, base) {
			if (path === "" || base === "") return "";
			if (!looksAbsolutePath(path)) return "";
			var normalizedBase = base.replace(/[\\/]+$/, "");
			var normalizedPath = path.replace(/[\\/]+$/, "");
			if (normalizedPath === normalizedBase) return "";
			var prefix = normalizedBase + "\\";
			var forward = normalizedBase + "/";
			if (normalizedPath.indexOf(prefix) === 0) return normalizedPath.slice(prefix.length);
			if (normalizedPath.indexOf(forward) === 0) return normalizedPath.slice(forward.length);
			return "";
		}

		/** 绝对路径 → file:// URL（盘符冒号要编码、反斜杠换正斜杠）。 */
		function fileUrlOf(path) {
			if (path === "") return "";
			var text = path.replace(/\\/g, "/");
			if (/^[A-Za-z]:\//.test(text)) text = "/" + text;
			try {
				return encodeURI("file://" + text).replace(/#/g, "%23").replace(/\?/g, "%3F");
			} catch (error) {
				return "";
			}
		}

		// ── 0.3.0 新增菜单 ────────────────────────────────────────

		/** 输入框 · 无文字无选区：只有编辑器基础动作，不给 AI 项（没内容可作用）。 */
		function itemsForComposerEmpty(context) {
			var items = [];
			items.push({ label: LANG.paste, hint: LANG.pasteHint, run: function () { pasteFromClipboard(context); } });
			items.push({ separator: true });
			items.push({ label: LANG.undo, hint: "Ctrl+Z", run: function () { execEditor("undo"); } });
			items.push({ label: LANG.redo, hint: "Ctrl+Y", run: function () { execEditor("redo"); } });
			items.push({ label: LANG.selectAll, hint: LANG.selectAllHint, run: function () { selectEverything(context); } });
			return items;
		}

		/** 输入框 · 选中 N 个字：标准编辑器菜单。刻意不给 AI 项（还没发出去，作用意义不大）。 */
		function itemsForComposerSelection(context) {
			var items = [];
			items.push({ label: LANG.cut, hint: LANG.cutHint, run: function () { cutInto(context.editableNode); } });
			items.push({ label: LANG.copy, hint: LANG.copyHint, run: function () { copyText(context.selection); } });
			items.push({ label: LANG.paste, hint: LANG.pasteHint, run: function () { pasteFromClipboard(context); } });
			items.push({ separator: true });
			items.push({ label: LANG.undo, hint: "Ctrl+Z", run: function () { execEditor("undo"); } });
			items.push({ label: LANG.redo, hint: "Ctrl+Y", run: function () { execEditor("redo"); } });
			items.push({ label: LANG.selectAll, hint: LANG.selectAllHint, run: function () { selectEverything(context); } });
			return items;
		}

		/** 地址是不是只能在渲染层拿到的图（blob: / data:）——没有本地路径可给宿主。 */
		function isInlineImageSrc(src) {
			return /^(blob:|data:)/i.test(String(src || ""));
		}

		/**
		 * 把图片读成 base64 data URL，交给宿主用字节处理。
		 *
		 * 会话图与草稿缩略图都是 `blob:dsh-app://app/<uuid>`，宿主那边拿不到，只有渲染层
		 * 能 fetch 自己的 blob。这条路就是「复制图像」报「找不到地址」的修法。
		 */
		function imageDataUrlOf(img) {
			var src = imageSrcOf(img);
			if (src === "") return Promise.resolve(null);
			return fetch(src)
				.then(function (response) {
					if (!response.ok && response.status !== 0) throw new Error("HTTP " + response.status);
					return response.blob();
				})
				.then(function (blob) {
					if (blob === null || blob.size === 0) return null;
					return new Promise(function (resolve) {
						try {
							var reader = new FileReader();
							reader.onload = function () { resolve(typeof reader.result === "string" ? reader.result : null); };
							reader.onerror = function () { resolve(null); };
							reader.readAsDataURL(blob);
						} catch (error) {
							resolve(null);
						}
					});
				})
				.catch(function () { return null; });
		}

		/** 图片建议文件名：优先 alt，退到地址里的 uuid，最后 image.png。 */
		function imageFileNameOf(img, src) {
			var alt = "";
			try {
				alt = String(img.getAttribute("alt") || "").trim();
			} catch (error) {
				alt = "";
			}
			if (alt !== "" && alt.length <= 60 && !/[\r\n\\/:*?"<>|]/.test(alt)) {
				return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(alt) ? alt : alt + ".png";
			}
			var uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(String(src || ""));
			return uuid === null ? "image.png" : uuid[1] + ".png";
		}

		/** 图片菜单里「复制图像 / 另存为」的共同实现：有本地路径走路径，否则走字节。 */
		function runImageAction(img, kind) {
			var path = mediaPathOf(img);
			var src = imageSrcOf(img);
			if (path !== "") {
				callHost(kind === "copy" ? "copy-image" : "save-image", { path: path }).then(function (result) {
					if (result.ok) { toast(LANG.copied); return; }
					toast(LANG.imageFailed + (result.error === undefined ? "" : result.error), true);
				});
				return;
			}
			if (!isInlineImageSrc(src)) {
				toast(LANG.imagePathUnknown, true);
				return;
			}
			var name = imageFileNameOf(img, src);
			imageDataUrlOf(img).then(function (dataUrl) {
				if (dataUrl === null || dataUrl === "") {
					toast(LANG.imageFailed + "读不到图片内容", true);
					return;
				}
				var mime = "";
				try {
					var head = /^data:([^;,]*)/.exec(dataUrl);
					mime = head === null ? "" : head[1];
				} catch (error) {
					mime = "";
				}
				var action = kind === "copy" ? "copy-image-bytes" : "save-image-bytes";
				return callHost(action, { dataUrl: dataUrl, name: name, mime: mime }).then(function (result) {
					if (result.ok) {
						if (kind === "copy") toast(LANG.copied);
						else if (result.body !== undefined && typeof result.body.filePath === "string") toast(LANG.savedTo + result.body.filePath);
						else toast(LANG.copied);
						return;
					}
					toast(LANG.imageFailed + (result.error === undefined ? "" : result.error), true);
				});
			});
		}

		/**
		 * 图片（对话区与输入框共用）。参考 ChatGPT 应用的图片菜单。
		 * 路径解不出来时**隐藏**「资源管理器打开 / 用默认应用打开」，但复制与另存为仍然可用
		 * ——它们现在走字节通道，不再依赖本地路径（0.5.1）。
		 */
		function itemsForImage(context, image, inComposer) {
			var items = [];
			var src = imageSrcOf(image);
			var path = mediaPathOf(image);
			items.push({
				label: LANG.copyImage,
				run: function () {
					runImageAction(image, "copy");
				},
			});
			if (src !== "") {
				items.push({ label: LANG.copyImageSrc, run: function () { copyText(src); } });
			}
			items.push({ separator: true });
			if (path !== "") {
				items.push({ label: LANG.reveal, run: function () { callFileAction("reveal", path, ""); } });
				items.push({ label: LANG.openWith, run: function () { callFileAction("open", path, ""); } });
			}
			items.push({
				label: LANG.saveImageAs,
				run: function () {
					runImageAction(image, "save");
				},
			});
			if (inComposer === true) {
				items.push({ separator: true });
				items.push({
					label: LANG.removeImage,
					run: function () {
						try {
							if (image.parentNode !== null) image.parentNode.removeChild(image);
						} catch (error) {
							toast(LANG.imageFailed, true);
						}
					},
				});
			}
			return items;
		}

		/**
		 * 代码块：复制为主，再补代码向 AI 项（解释 / 优化 / 生成单元测试）。
		 * 0.2.0 没有这一支——`textBlockOf` 命中 `<pre>` 后按普通段落处理，代码块没有任何专属项。
		 */
		function itemsForCodeBlock(context, block) {
			var items = [];
			items.push({ label: LANG.copyCode, hint: LANG.copyHint, run: function () { copyText(block.text); } });
			var fence = block.lang === "" ? "" : block.lang;
			items.push({
				label: LANG.copyAsCodeBlock,
				run: function () { copyText("```" + fence + "\n" + block.text + "\n```"); },
			});
			if (fence !== "") {
				items.push({
					label: LANG.copyWithoutLang,
					run: function () { copyText(block.text); },
				});
			}
			if (agentActionsAvailable()) {
				items.push({ separator: true });
				items.push({
					label: LANG.quoteCode,
					run: function () { quoteIntoComposer(block.text); },
				});
				items.push({
					label: LANG.explainCode,
					run: function () { sendAsUser(LANG.promptExplain + embed(block.text)); },
				});
				items.push({
					label: LANG.refactorCode,
					run: function () { sendAsUser(LANG.promptRefactor + embed(block.text)); },
				});
				items.push({
					label: LANG.testsCode,
					run: function () { sendAsUser(LANG.promptTests + embed(block.text)); },
				});
			}
			return items;
		}

		/** 编辑器命令（撤销 / 重做）。失败静默——这是补充动作，不值得弹错误。 */
		function execEditor(command) {
			try { document.execCommand(command); } catch (error) { /* noop */ }
		}

		/** 粘贴：execCommand('paste') 在渲染进程必被拒，走剪贴板 API + insertText。 */
		function pasteFromClipboard(context) {
			var node = null;
			if (context !== undefined && context !== null && context.editableNode != null) node = context.editableNode;
			if (node === null) node = editableOf(document.activeElement);
			pasteInto(node);
		}

		/** 全选：优先选中最近的编辑器，否则什么也不做。 */
		function selectEverything(context) {
			var node = null;
			if (context !== undefined && context !== null && context.editableNode != null) node = context.editableNode;
			if (node === null) node = editableOf(document.activeElement);
			if (node === null) return;
			selectAllIn(node);
		}

		function showMenu(items, x, y) {
			closeMenu();
			var root = document.createElement("div");
			root.id = MENU_ID;
			root.setAttribute("role", "menu");
			root.setAttribute("aria-label", "Agent 菜单");
			menuItems = items;
			for (var index = 0; index < items.length; index += 1) {
				var item = items[index];
				if (item.separator === true) {
					var separator = document.createElement("div");
					separator.className = "dsh-am-sep";
					root.appendChild(separator);
					continue;
				}
				var button = document.createElement("button");
				button.type = "button";
				button.className = ITEM_CLASS;
				button.setAttribute("role", "menuitem");
				button.setAttribute("data-index", String(index));
				var label = document.createElement("span");
				label.className = "dsh-am-label";
				label.textContent = item.label;
				button.appendChild(label);
				if (item.hint !== undefined) {
					var hint = document.createElement("span");
					hint.className = "dsh-am-hint";
					hint.textContent = item.hint;
					button.appendChild(hint);
				}
				// click 只作为兜底：正常路径由 window 捕获阶段的 pointerdown 激活。
				(function (menuItem) {
					button.addEventListener("click", function (clickEvent) {
						clickEvent.preventDefault();
						clickEvent.stopPropagation();
						activateItem(menuItem);
					});
				})(item);
				root.appendChild(button);
			}
			if (root.childNodes.length === 0) return;
			document.body.appendChild(root);
			var rect = root.getBoundingClientRect();
			var left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
			var top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
			root.style.left = left + "px";
			root.style.top = top + "px";
			menuRect = root.getBoundingClientRect();
			// 不调用 focus()：抢焦点会触发应用侧的 blur 逻辑，也可能让选区消失。
		}

		/**
		 * 延迟决策：此时 dsh-file-menu 的同步处理一定已经结束，按现场决定谁弹菜单。
		 * 0.1.0 的分类是「选区 / 段落」二选一且都要 `hasPath === false && link === null`，
		 * 于是超链接与文件芯片两个分支整体落空；0.2.0 改成互斥的五路优先级分类：
		 *   可编辑区 → 选区 → 超链接 → 文件芯片 → 所在段落
		 *  - file-menu 弹了菜单：我有项就接管（我的菜单含「复制」，不丢功能），
		 *    没有就让它的菜单留着；
		 *  - round-rightclick 的圆盘在显示：一律让行；
		 *  - 否则我有项就弹自己的。
		 */
		/**
		 * 左侧工作区/会话树的一行。DSH 官方侧边栏（`@deepseek-ai/dsh-client-ui-workspace`）
		 * 给每一行都打了 `data-row-key`，工作区是 `workspace:<组键>`、会话是 `session:<会话 id>`，
		 * 并且都带 `role="treeitem"`。这两个标记比 class 名稳（class 是 CSS Module 哈希）。
		 */
		function sidebarRowOf(target) {
			var node = target;
			if (node !== null && node !== undefined && node.nodeType === 3) node = node.parentElement;
			var depth = 0;
			while (node !== null && node !== undefined && node.nodeType === 1 && depth < 24) {
				depth += 1;
				var key = "";
				try {
					key = String(node.dataset === undefined ? "" : node.dataset.rowKey || "");
				} catch (error) {
					key = "";
				}
				if (/^(workspace|session|overflow|empty):/.test(key)) return node;
				var role = "";
				try {
					role = String(node.getAttribute === undefined ? "" : node.getAttribute("role") || "");
				} catch (error2) {
					role = "";
				}
				if (role === "treeitem") return node;
				node = node.parentElement;
			}
			return null;
		}

		/**
		 * 行内那个「⋮」按钮——**原生菜单的唯一入口**。
		 * DSH 官方侧边栏用 React state（`const [menuOpen, setMenuOpen] = useState(false)`）
		 * 控制 `primitives.Menu`，`onClick: () => setMenuOpen((v) => !v)`，按钮的
		 * `aria-label` 取自 `actions.workspace.aria` / `actions.session.aria`，即
		 * `工作区"X"的操作` 与 `会话"X"的操作`。所以「让右键弹出原生菜单」=
		 * 找到这个按钮、`click()` 它——菜单内容、图标、快捷键、危险色全部由官方代码渲染，
		 * 我们一个字都不用复刻，官方改版也不会漂移。
		 */
		function sidebarMenuButton(row) {
			if (row === null || row.querySelector === undefined) return null;
			var buttons = row.querySelectorAll("button");
			for (var i = 0; i < buttons.length; i += 1) {
				var label = "";
				try {
					label = String(buttons[i].getAttribute("aria-label") || "");
				} catch (error) {
					label = "";
				}
				if (label.slice(-3) === "的操作") return buttons[i];
			}
			return null;
		}

		/**
		 * 场景判定（**同步**，纯 DOM 读取）。onContextMenu 用它决定要不要拦下浏览器
		 * 原生菜单：返回 null 就表示「这里不接管」，原生菜单照常弹出。
		 * 这是 0.3.0 的防误触闸门——0.2.0 在 onContextMenu 里无条件 preventDefault，
		 * 结果对话区空白处、顶部工具栏、状态栏右键全都变成「什么都没有」。
		 * 判定顺序严格按「点在哪」：输入框三态 → 图片 → 选区 → 代码块 → 链接 → 文件 → 段落。
		 */
		/**
		 * 0.5.0 生效范围（2026-10-19，用户要求）：只在**对话消息**（`[data-chat-turn]`）和**可编辑框**
		 * 里接管右键，其他地方（表格外的界面、设置页、对话框外面）一律返回 null 放行。
		 * 消息里也只认：图片、点在选区上的选中文字、链接、文件路径。没有选中文字的段落、
		 * 表格、代码块不再出菜单（以前的「段落 / 代码块」场景会在任何有字的地方误触）。
		 */
		var CHAT_SCOPE = "[data-chat-turn],[data-chat-node-key]";
		function inChatScope(target) {
			var node = target;
			if (node !== null && node !== undefined && node.nodeType === 3) node = node.parentElement;
			return node !== null && node !== undefined && typeof node.closest === "function" && node.closest(CHAT_SCOPE) !== null;
		}

		/** 右键点是否落在当前选区上（选区还在、但点在别处时，不算选中了东西）。 */
		function selectionHit(x, y) {
			try {
				var sel = window.getSelection();
				if (sel === null || sel.rangeCount === 0 || sel.isCollapsed) return false;
				for (var r = 0; r < sel.rangeCount; r += 1) {
					var rects = sel.getRangeAt(r).getClientRects();
					for (var i = 0; i < rects.length; i += 1) {
						var rect = rects[i];
						if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) return true;
					}
				}
			} catch (error) {
				return false;
			}
			return false;
		}

		function classify(context) {
			context.editableNode = editableOf(context.target);
			context.editable = context.editableNode !== null;
			if (context.editable === true) {
				var composerImage = imageOf(context.target);
				if (composerImage !== null) {
					context.image = composerImage;
					return "composerImage";
				}
				return context.selection === "" ? "composerEmpty" : "composerSelection";
			}
			// 图片优先于区域判断：草稿缩略图在输入框外壳里（不在 contenteditable 内）、
			// 放大的图在 body 上的预览层里，两者都不在对话区，0.5.0 因此漏掉了它们。
			// 但只接管这三处：对话区、输入框草稿附件区、放大预览层——别把设置页的图也吃了。
			var picture = imageOf(context.target);
			if (picture !== null && isContentImage(picture)) {
				context.image = picture;
				if (inChatScope(context.target) === true) return "messageImage";
				context.inComposerArea = inComposerArea(context.target);
				if (context.inComposerArea === true || inImageOverlay(context.target) === true) return "otherImage";
			}
			if (!inChatScope(context.target)) return null;
			if (context.selection !== "" && context.selectionHit === true) return "selection";
			// 点在选区外：当作没选中，链接 / 文件照常判断。
			if (context.selectionHit !== true) context.selection = "";
			if (context.link !== null) return "link";
			if (pathFromTarget(context.target) !== "") return "file";
			return null;
		}

		/**
		 * 同步算出这次右键要显示的菜单项，**不做任何 DOM 副作用**（不关菜单、不弹菜单）。
		 * 返回 null 表示「这次右键不归本插件管」或算菜单项时出错——调用方必须放行，
		 * 让浏览器原生菜单（图片的「复制图片 / 图片另存为」）照常出现。
		 *
		 * 2026-10-27 从 decide() 里拆出来。老逻辑在 onContextMenu 的捕获阶段就
		 * preventDefault()，之后 decide() 却有五条路径什么都不弹（菜单项为空、抛异常、
		 * 代际号失效、round-rightclick 遮罩在场、file-menu 已弹且我们没项），原生菜单
		 * 已经被吞掉——用户看到的就是「右键点了没反应」。现在先算项，有项才拦。
		 */
		function buildItems(context) {
			try {
				if (!activeGeneration()) return null;
				var scenario = classify(context);
				if (scenario === null) return null;
				var items = [];
				var base = workspaceBase();
				var rawPath = pathFromTarget(context.target);
				// 选区本身就是个绝对路径时（手动框选一段文件路径），也算命中。
				if (rawPath === "" && context.selection !== "" && looksAbsolutePath(context.selection)) {
					rawPath = context.selection;
				}
				var path = displayPathOf(rawPath, base);
				context.rawPath = rawPath;
				context.base = base;
				context.path = path;

				if (scenario === "composerEmpty") {
					items = itemsForComposerEmpty(context);
				} else if (scenario === "composerSelection") {
					items = itemsForComposerSelection(context);
				} else if (scenario === "composerImage") {
					items = itemsForImage(context, context.image, true);
				} else if (scenario === "messageImage") {
					items = itemsForImage(context, context.image, false);
				} else if (scenario === "otherImage") {
					// 输入框草稿缩略图、放大预览层里的图：给同一套图片菜单，
					// 但「从输入框移除」只在真在输入框里时才给。
					items = itemsForImage(context, context.image, context.editable === true);
				} else if (scenario === "selection") {
					items = itemsForSelection(context.target, context.selection);
					items = appendContextItems(items, context);
				} else if (scenario === "codeBlock") {
					items = itemsForCodeBlock(context, context.code);
				} else if (scenario === "link") {
					items = itemsForLink(context, context.link);
				} else if (scenario === "file") {
					items = itemsForFile(context, rawPath, base, path);
				} else if (scenario === "block") {
					items = itemsForBlock(context.target, context.blockText);
				}
				return items;
			} catch (error) {
				console.warn("[dsh-agent-menu] build items failed:", error);
				return null;
			}
		}

		/**
		 * 延迟决策（承接上面那条「延迟决策」注释）：菜单项已由调用方同步算好，
		 * 这里只负责按现场决定谁弹——file-menu 已弹就接管，圆盘遮罩在就让行，
		 * 否则弹自己的。prebuilt 缺省时（测试或老调用方）自己算一遍。
		 */
		function decide(context, prebuilt) {
			if (!activeGeneration()) return;
			closeMenu();
			var items = prebuilt === undefined ? buildItems(context) : prebuilt;
			if (items === null || items.length === 0) {
				return;
			}
			var fmRoot = document.getElementById(FILE_MENU_ROOT_ID);
			if (fmRoot !== null) {
				if (items.length > 0) {
					// 接管：摘掉 file-menu 刚弹的菜单，换成本插件的菜单。
					if (fmRoot.parentNode !== null) fmRoot.parentNode.removeChild(fmRoot);
					showMenu(items, context.x, context.y);
				}
				return;
			}
			var roundLayer = null;
			try {
				roundLayer = document.querySelector(ROUND_MENU_LAYER);
			} catch (error) {
				roundLayer = null;
			}
			if (roundLayer !== null) return;
			if (items.length > 0) showMenu(items, context.x, context.y);
		}

		/** 选区菜单的尾部追加：命中链接或文件时补上链接 / 文件操作（0.1.0 完全没有）。 */
		function appendContextItems(items, context) {
			if (context.link !== null) {
				var target = absoluteLink(context.link);
				items.push({ separator: true });
				items.push({
					label: LANG.copyLink,
					run: function () {
						copyText(target);
					},
				});
				items.push({
					label: LANG.openLink,
					run: function () {
						try {
							window.open(target, "_blank", "noopener,noreferrer");
						} catch (error) {
							toast(LANG.openLinkFailed, true);
						}
					},
				});
			}
			if (context.path !== "") {
				items.push({ separator: true });
				items.push({
					label: LANG.copyPath,
					run: function () {
						copyText(context.path);
					},
				});
				items.push({
					label: LANG.reveal,
					run: function () {
						callFileAction("reveal", context.rawPath, context.base);
					},
				});
				items.push({
					label: LANG.openWith,
					run: function () {
						callFileAction("open", context.rawPath, context.base);
					},
				});
			}
			return items;
		}

		// ─────────────────────────── 事件 ───────────────────────────

		/** 捕获阶段的右键处理：只记上下文 + 抑制默认菜单，决策放进 setTimeout(0)。 */
		function onContextMenu(event) {
			try {
				if (!activeGeneration()) return;
				if (event.__dshAmSeen === true) return;
				event.__dshAmSeen = true;
				var target = event.target;
				if (target !== null && target.closest !== undefined && target.closest("#" + MENU_ID) !== null) return;
				// 左侧工作区/会话树：**不自己出菜单**，改为触发 DSH 原生那一个。
				// 用户要求「右键交互应该和点击原生展开菜单显示一致」——最忠实的做法就是
				// 真的去点那个 ⋮ 按钮，菜单项、图标、快捷键、删除项的红色危险色全部由
				// 官方组件渲染。点不到按钮（官方改了 DOM）就放行浏览器原生菜单兜底，
				// 绝不 preventDefault 之后什么都不给。
				var sidebarRow = sidebarRowOf(target);
				if (sidebarRow !== null) {
					var nativeButton = sidebarMenuButton(sidebarRow);
					if (nativeButton !== null) {
						event.preventDefault();
						// ⚠️ 必须掐断传播，否则别的插件照样收到这次右键。
						// 实例：`dsh-session-deck` 0.2.1 在 document 捕获阶段也挂了
						// contextmenu 监听（lib/client.js:2187），命中 `[data-row-key^="workspace:"]`
						// 就 stop(event) + 打开它自己的「项目图标」Emoji 选择器——那个选择器
						// 会盖在原生命盘上面，用户看到的就是「右键被别的插件占了」。
						// 本插件挂在 window 捕获阶段，capture 顺序 window → document，
						// 所以在这里拦得住；stopImmediatePropagation 一并调用，
						// 连 document 上排在我们后面的监听器也收不到。
						if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
						if (typeof event.stopPropagation === "function") event.stopPropagation();
						nativeButton.click();
					}
					return;
				}
				var selection = "";
				try {
					selection = String(window.getSelection === undefined ? "" : window.getSelection().toString()).trim();
				} catch (error) {
					selection = "";
				}
				var context = {
					target: target,
					x: event.clientX,
					y: event.clientY,
					selection: selection,
					selectionHit: selection !== "" && selectionHit(event.clientX, event.clientY),
					blockText: "",
					link: linkOf(target),
				};
			// 防误触闸门：**只有真能出菜单的点击才拦原生菜单**。算不出菜单项说明点在了
			// 不归本插件管的区域（对话区以外、消息里的空白段落和表格……），或者算菜单项
			// 时出了错，这两种都直接放行——浏览器原生菜单照常弹出。
			// 2026-10-27 修：老代码只判 scenario 非空就 preventDefault()，可 decide()
			// 还有「菜单项为空 / 抛异常 / 代际号失效 / 圆盘遮罩在场」四条路什么都不弹，
			// 原生菜单已经被吞掉 → 用户看到「右键点了没反应」。现在先算项，有项才拦。
			var items = buildItems(context);
			if (items === null || items.length === 0) {
				// 没有菜单项也要把已弹出的菜单收掉（老代码是靠 decide() 里的 closeMenu 做到的），
				// 然后放行原生菜单。
				closeMenu();
				return;
			}
			event.preventDefault();
			window.setTimeout(function () {
				decide(context, items);
			}, 0);
			} catch (error) {
				console.warn("[dsh-agent-menu] context menu failed:", error);
			}
		}

		/** window/document 共用的捕获入口（去重后再处理）。 */
		function onContextMenuWindow(event) {
			if (event.__dshAmSeen !== true) onContextMenu(event);
		}

		/** 点是否落在菜单矩形内。 */
		function insideRect(rect, x, y) {
			return rect !== null && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
		}

		/** window 捕获阶段的 pointerdown：左键命中菜单项则直接激活（不依赖 click 冒泡）。 */
		function onPointerDown(event) {
			try {
				if (!activeGeneration()) return;
				if (event.__dshAmPd === true) return;
				event.__dshAmPd = true;
				if (event.button !== 0) return;
				if (insideRect(menuRect, event.clientX, event.clientY)) {
					event.preventDefault();
					event.stopPropagation();
					var hit = null;
					try {
						hit = document.elementFromPoint(event.clientX, event.clientY);
					} catch (error) {
						hit = null;
					}
					var itemEl = hit !== null && hit.closest !== undefined ? hit.closest("." + ITEM_CLASS) : null;
					var index = itemEl === null ? -1 : Number(itemEl.getAttribute("data-index"));
					var chosen = index >= 0 ? menuItems[index] : undefined;
					suppressUntil = Date.now() + 600;
					suppressRect = menuRect;
					if (chosen !== undefined && chosen.separator !== true) {
						activateItem(chosen);
					} else {
						closeMenu();
					}
					return;
				}
				if (document.getElementById(MENU_ID) !== null) closeMenu();
			} catch (error) {
				console.warn("[dsh-agent-menu] pointerdown failed:", error);
			}
		}

		/** 激活后的抑制窗口：吞掉紧随其后的 mouseup/click，避免误触下层界面。 */
		function swallowAfterActivation(event) {
			if (!activeGeneration()) return;
			if (Date.now() > suppressUntil || !insideRect(suppressRect, event.clientX, event.clientY)) return;
			try {
				event.preventDefault();
				event.stopPropagation();
			} catch (error) {
				/* 忽略 */
			}
		}

		function onKeyDown(event) {
			if (!activeGeneration()) return;
			if (event.key === "Escape") closeMenu();
		}

		/** 只有窗口自身失焦才关闭菜单（元素失焦也会冒泡到 window 捕获）。 */
		function onWindowBlur(event) {
			if (!activeGeneration()) return;
			if (event.target === window) closeMenu();
		}

		/** 安装右键菜单。安装必须跨 HMR 实例幂等（同 dsh-file-menu 的两层保护）。 */
		function apply(ctx) {
			try {
				if (typeof document === "undefined") return;
				pluginCtx = ctx === undefined ? null : ctx;
				// 状态行文案独立于右键菜单：它自带 try/catch，且放在最前，菜单安装失败也不影响它。
				installStatusPhrases();
				var previousListeners = window[LISTENERS_KEY];
				if (previousListeners !== undefined && previousListeners !== null) {
					for (var index = 0; index < previousListeners.length; index += 1) {
						var entry = previousListeners[index];
						try {
							entry[0].removeEventListener(entry[1], entry[2], entry[3]);
						} catch (error) {
							/* 忽略单个移除失败 */
						}
					}
				}
				window[GENERATION_KEY] = (typeof window[GENERATION_KEY] === "number" ? window[GENERATION_KEY] : 0) + 1;
				GENERATION = window[GENERATION_KEY];
				ensureStyle();
				var listeners = [
					[window, "contextmenu", onContextMenuWindow, true],
					[document, "contextmenu", onContextMenu, true],
					[window, "pointerdown", onPointerDown, true],
					[document, "pointerdown", onPointerDown, true],
					[window, "mouseup", swallowAfterActivation, true],
					[window, "click", swallowAfterActivation, true],
					[document, "keydown", onKeyDown, true],
					[document, "scroll", closeMenu, true],
					[window, "blur", onWindowBlur, true],
					[window, "resize", closeMenu, true],
				];
				for (var installIndex = 0; installIndex < listeners.length; installIndex += 1) {
					listeners[installIndex][0].addEventListener(
						listeners[installIndex][1],
						listeners[installIndex][2],
						listeners[installIndex][3],
					);
				}
				window[LISTENERS_KEY] = listeners;
				closeMenu();
				console.debug("[dsh-agent-menu] installed, version " + CLIENT_VERSION + ", generation " + GENERATION);
				// 向宿主自报版本：没有浏览器控制台时，用 /agent-menu/status 就能确认
				// 「客户端到底跑没跑、跑的哪个版本」。
				callHost("hello", { version: CLIENT_VERSION });
			} catch (error) {
				console.warn("[dsh-agent-menu] install failed:", error);
			}
		}

		// ══ 状态行随机文案（自 dsh-status-rotator 0.35.0 提取，agent-menu 0.4.0）══
		//
		// 只保留「按回合阶段随机换文案」这一件事，及其词库（lib/status-phrases.json，14 个词库包）：
		//   · 阶段：thinking（刚开始）→ running（15 秒后）→ long（60 秒后），缺组按
		//     running→thinking→任意 回退；阶段切换立刻换一句，其余按 rotateMs 轮换；
		//   · 洗牌袋：袋里的句子抽完前不重复，按权重抽，袋子重开时避开最近 recentLimit 句；
		//   · 零侵入：只在宿主「运行中」那一行（div[data-chat-running]）的文案元素旁边加一个
		//     兄弟节点并把宿主那句藏起来；回合结束宿主移除整行时我们的节点一起消失。
		//     任何一步失败都保持宿主原文，不会留空行。
		// 没带走的：设置页、打字机、炫彩渐变、弹幕、标签页标题、鲸鱼尾巴、实时占位符（{tps} 等）。
		// 开关与词库覆盖：~/.dsh/agent-menu/status-phrases.json（见 README）。
		var PHRASE_CLASS = "dsh-am-phrase";
		var PHRASE_CLOCK_CLASS = "dsh-am-phrase-clock";
		var PHRASE_STYLE_ID = "dsh-agent-menu-phrases-style";
		var PHRASE_KEY = "__dshAgentMenuPhrases";
		var PHRASE_ROW_SELECTOR = "[data-chat-running]";
		var PHRASE_TEXT_SELECTOR = '[class*="runningText"]';
		var PHRASE_PHASE_LABEL = {
			zh: { thinking: "思考中", running: "运行中", long: "长回合" },
			en: { thinking: "thinking", running: "running", long: "long run" },
		};

		/** 阶段判定：只看已运行毫秒数。 */
		function phraseFor(elapsedMs, lib) {
			var runningAt = (lib && lib.thinkingToRunningMs) || 15000;
			var longAt = (lib && lib.longAfterMs) || 60000;
			if (elapsedMs >= longAt) return "long";
			if (elapsedMs >= runningAt) return "running";
			return "thinking";
		}

		/** 从宿主文案里读已运行时长（"Deep diving for 1m 02s" / "深度求索 1分02秒"），读不到返回 -1。 */
		function parseHostElapsed(text) {
			var s = String(text == null ? "" : text);
			var total = 0;
			var found = false;
			var m = s.match(/(\d+)\s*(?:h|时|小时)/i);
			if (m) { total += Number(m[1]) * 3600; found = true; }
			m = s.match(/(\d+)\s*(?:m(?!s)|分)/i);
			if (m) { total += Number(m[1]) * 60; found = true; }
			m = s.match(/(\d+)\s*(?:s|秒)/i);
			if (m) { total += Number(m[1]); found = true; }
			return found ? total * 1000 : -1;
		}

		function formatElapsed(ms, lang) {
			var sec = Math.max(0, Math.floor(ms / 1000));
			var h = Math.floor(sec / 3600);
			var m = Math.floor((sec % 3600) / 60);
			var s = sec % 60;
			var two = function (n) { return n < 10 ? "0" + n : String(n); };
			if (lang === "zh") {
				if (h > 0) return h + "时" + two(m) + "分" + two(s) + "秒";
				if (m > 0) return m + "分" + two(s) + "秒";
				return s + "秒";
			}
			if (h > 0) return h + "h " + two(m) + "m " + two(s) + "s";
			if (m > 0) return m + "m " + two(s) + "s";
			return s + "s";
		}

		/** 把启用的词库包并成 { phase: [{text, weight}] }，按文本去重，丢弃条件句里本实现不认的条件。 */
		function buildPhraseBank(lib, lang) {
			var bank = { thinking: [], running: [], long: [] };
			if (!lib || !Array.isArray(lib.packs)) return bank;
			var enabled = Array.isArray(lib.enabledPacks) ? lib.enabledPacks : null;
			var seen = { thinking: {}, running: {}, long: {} };
			var hour = new Date().getHours();
			var phases = ["thinking", "running", "long"];
			for (var i = 0; i < lib.packs.length; i += 1) {
				var pack = lib.packs[i];
				if (!pack || (enabled !== null && enabled.indexOf(pack.id) === -1)) continue;
				var groups = pack.phrases && (pack.phrases[lang] || null);
				if (!groups) continue;
				for (var p = 0; p < phases.length; p += 1) {
					var list = groups[phases[p]];
					if (!Array.isArray(list)) continue;
					for (var j = 0; j < list.length; j += 1) {
						var item = list[j];
						var text = typeof item === "string" ? item : item && item.text;
						if (typeof text !== "string" || text === "") continue;
						var weight = typeof item === "object" && item && Number(item.weight) > 0 ? Math.min(1000, Number(item.weight)) : 1;
						if (typeof item === "object" && item) {
							if (item.when && typeof item.when === "object") {
								var keys = Object.keys(item.when);
								var ok = true;
								for (var k = 0; k < keys.length; k += 1) {
									var cond = item.when[keys[k]];
									if (keys[k] === "hour" && Array.isArray(cond) && cond.length === 2) {
										var a = Number(cond[0]);
										var b = Number(cond[1]);
										if (!(a <= b ? hour >= a && hour < b : hour >= a || hour < b)) ok = false;
									} else if (keys[k] === "phase") {
										var allow = Array.isArray(cond) ? cond : [cond];
										if (allow.indexOf(phases[p]) === -1) ok = false;
									} else {
										ok = false; /* tool / retry / pending / firstTurn 需要实时引擎，本实现不提供 */
									}
								}
								if (!ok) continue;
							}
							if (typeof item.rarity === "number" && item.rarity > 0 && item.rarity < 1 && Math.random() >= item.rarity) continue;
						}
						if (seen[phases[p]][text]) continue;
						seen[phases[p]][text] = true;
						bank[phases[p]].push({ text: text, weight: weight });
					}
				}
			}
			return bank;
		}

		/** 某阶段缺组时的回退链。 */
		function pickGroup(bank, phase) {
			var chain = phase === "long" ? ["long", "running", "thinking"] : phase === "running" ? ["running", "thinking", "long"] : ["thinking", "running", "long"];
			for (var i = 0; i < chain.length; i += 1) if (bank[chain[i]] && bank[chain[i]].length > 0) return chain[i];
			return null;
		}

		/** 按权重无放回洗牌（Efraimidis–Spirakis）。 */
		function weightedShuffle(items) {
			return items
				.map(function (it) { return { it: it, key: Math.pow(Math.random(), 1 / it.weight) }; })
				.sort(function (x, y) { return y.key - x.key; })
				.map(function (x) { return x.it; });
		}

		/** 洗牌袋抽一句：袋空则重开，并把最近 recentLimit 句推到袋尾。 */
		function drawPhrase(state, group, items, recentLimit) {
			var bag = state.bags[group];
			if (!bag || bag.length === 0) {
				var fresh = weightedShuffle(items);
				var recent = state.recent[group] || [];
				if (recentLimit > 0 && fresh.length > recentLimit + 1) {
					var head = [];
					var tail = [];
					for (var i = 0; i < fresh.length; i += 1) (recent.indexOf(fresh[i].text) !== -1 ? tail : head).push(fresh[i]);
					fresh = head.concat(tail);
				}
				bag = fresh;
			}
			var next = bag.shift();
			state.bags[group] = bag;
			var r = state.recent[group] || (state.recent[group] = []);
			r.push(next.text);
			while (r.length > Math.max(0, recentLimit)) r.shift();
			return next.text;
		}

		function renderPhrase(text, ctx) {
			return String(text)
				.replace(/\{elapsed\}/g, ctx.elapsedLabel)
				.replace(/\{phaseLabel\}/g, ctx.phaseLabel)
				.replace(/\{phase\}/g, ctx.phase)
				.replace(/\{locale\}/g, ctx.lang)
				.replace(/\{time\}/g, ctx.time);
		}

		function phraseLang() {
			try {
				var l = String((document.documentElement && document.documentElement.lang) || (navigator && navigator.language) || "zh").toLowerCase();
				return l.indexOf("zh") === 0 ? "zh" : "en";
			} catch (error) {
				return "zh";
			}
		}

		function ensurePhraseStyle() {
			try {
				if (document.getElementById(PHRASE_STYLE_ID)) return;
				var style = document.createElement("style");
				style.id = PHRASE_STYLE_ID;
				style.textContent =
					"." + PHRASE_CLOCK_CLASS + "{margin-left:.6em;font-size:.85em;opacity:.6;font-variant-numeric:tabular-nums;white-space:nowrap}" +
					"." + PHRASE_CLASS + "{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}";
				document.head.appendChild(style);
			} catch (error) {
				/* 样式失败只影响观感，不影响功能 */
			}
		}

		/** 启动状态行文案。幂等：HMR 重新实例化时先拆上一代。 */
		function installStatusPhrases() {
			try {
				if (typeof document === "undefined" || typeof fetch !== "function") return;
				var previous = window[PHRASE_KEY];
				if (previous && typeof previous.dispose === "function") {
					try { previous.dispose(); } catch (error) { /* 忽略 */ }
				}
				var handle = { disposed: false, dispose: function () {} };
				window[PHRASE_KEY] = handle;
				fetch(HOST_PREFIX + "/status-phrases", { cache: "no-store" })
					.then(function (r) { return r.ok ? r.json() : null; })
					.then(function (payload) {
						if (handle.disposed || !payload || payload.ok !== true || !payload.library) return;
						startPhraseEngine(handle, payload.library);
					})
					.catch(function () { /* 宿主不在：保持宿主原文 */ });
			} catch (error) {
				console.warn("[dsh-agent-menu] status phrases failed:", error);
			}
		}

		function startPhraseEngine(handle, lib) {
			if (lib.enabled === false) return;
			var lang = phraseLang();
			var bank = buildPhraseBank(lib, lang);
			if (pickGroup(bank, "thinking") === null) {
				lang = lang === "zh" ? "en" : "zh";
				bank = buildPhraseBank(lib, lang);
			}
			if (pickGroup(bank, "thinking") === null) return; // 词库为空：保持宿主原文
			var rotateMs = Math.max(2000, Number(lib.rotateMs) || 10000);
			var recentLimit = typeof lib.recentLimit === "number" ? lib.recentLimit : 3;
			var drawState = { bags: {}, recent: {} };
			var rows = new Map(); // row -> { line, host, phraseEl, clock, startedAt, phase, shownAt, raw }
			ensurePhraseStyle();

			function adopt(row) {
				if (rows.has(row)) return;
				var host = row.querySelector(PHRASE_TEXT_SELECTOR);
				if (!host || !host.parentNode) return;
				var hostElapsed = parseHostElapsed(host.textContent);
				var line = document.createElement("span");
				line.className = (host.className ? host.className + " " : "") + PHRASE_CLASS;
				var phraseEl = document.createElement("span");
				var clock = document.createElement("span");
				clock.className = PHRASE_CLOCK_CLASS;
				line.appendChild(phraseEl);
				line.appendChild(clock);
				host.parentNode.insertBefore(line, host.nextSibling);
				host.setAttribute("data-dsh-am-hidden", "1");
				host.style.display = "none";
				rows.set(row, {
					line: line, host: host, phraseEl: phraseEl, clock: clock,
					startedAt: Date.now() - (hostElapsed >= 0 ? hostElapsed : 0),
					phase: null, shownAt: 0, raw: "",
				});
				tick();
			}

			function release(row, info) {
				try { info.line.remove(); } catch (error) { /* 已随整行移除 */ }
				try {
					if (info.host.getAttribute("data-dsh-am-hidden") === "1") {
						info.host.style.display = "";
						info.host.removeAttribute("data-dsh-am-hidden");
					}
				} catch (error) { /* 同上 */ }
				rows.delete(row);
			}

			function update(row, info, now) {
				var elapsed = now - info.startedAt;
				var phase = phraseFor(elapsed, lib);
				var group = pickGroup(bank, phase);
				if (group === null) return;
				var due = info.phase === null || phase !== info.phase || now - info.shownAt >= rotateMs;
				if (due) {
					info.raw = drawPhrase(drawState, group, bank[group], recentLimit);
					info.phase = phase;
					info.shownAt = now;
				}
				var labels = PHRASE_PHASE_LABEL[lang] || PHRASE_PHASE_LABEL.zh;
				var elapsedLabel = formatElapsed(elapsed, lang);
				var d = new Date();
				var time = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return n < 10 ? "0" + n : String(n); }).join(":");
				var text = renderPhrase(info.raw, { elapsedLabel: elapsedLabel, phaseLabel: labels[phase] || phase, phase: phase, lang: lang, time: time });
				if (info.phraseEl.textContent !== text) info.phraseEl.textContent = text;
				var wantClock = info.raw.indexOf("{elapsed}") === -1 ? elapsedLabel : "";
				if (info.clock.textContent !== wantClock) info.clock.textContent = wantClock;
			}

			function scan() {
				var found = document.querySelectorAll(PHRASE_ROW_SELECTOR);
				for (var i = 0; i < found.length; i += 1) adopt(found[i]);
			}

			function tick() {
				var now = Date.now();
				rows.forEach(function (info, row) {
					if (!row.isConnected || !info.line.isConnected) { release(row, info); return; }
					try { update(row, info, now); } catch (error) { release(row, info); }
				});
			}

			// 0.5.0：页面变化合并到下一帧再扫一次。流式输出时页面每秒变化很多次，
			// 以前每批变化都同步做一次全页查找。
			var scanPending = false;
			var observer = new MutationObserver(function () {
				if (scanPending) return;
				scanPending = true;
				window.requestAnimationFrame(function () { scanPending = false; if (!handle.disposed) scan(); });
			});
			observer.observe(document.body, { childList: true, subtree: true });
			var timer = window.setInterval(tick, 1000);
			handle.dispose = function () {
				handle.disposed = true;
				observer.disconnect();
				window.clearInterval(timer);
				rows.forEach(function (info, row) { release(row, info); });
			};
			scan();
			console.debug("[dsh-agent-menu] status phrases on: " + lang + ", " + (bank.thinking.length + bank.running.length + bank.long.length) + " phrases");
		}

		/** 测试用：纯逻辑函数（不碰 DOM）。 */
		exports.__statusPhrases = {
			phraseFor: phraseFor,
			parseHostElapsed: parseHostElapsed,
			formatElapsed: formatElapsed,
			buildPhraseBank: buildPhraseBank,
			pickGroup: pickGroup,
			drawPhrase: drawPhrase,
			renderPhrase: renderPhrase,
		};

		exports.apply = apply;
		exports.inject = [];
		return module.exports;
	}
});
