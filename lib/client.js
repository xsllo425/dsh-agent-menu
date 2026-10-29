window.__ModuleLoader__.load({
	id: "dsh-agent-menu",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * 对话消息、代码块、图片与输入框的精简右键菜单，以及侧栏目录操作。
		 * 系统剪贴板、图片、资源管理器与默认应用操作走 /agent-menu 宿主路由。
		 * 对话区不执行引用、发送或提示词模板等 AI 操作。
		 *
		 * 事件模型：
		 *  1. 菜单项走捕获阶段 pointerdown；激活后吞掉紧随的 mouseup/click。
		 *  2. HMR 实例通过 window 上的监听表与代际号清理。
		 *  3. 菜单项先同步构建，有项才 preventDefault；圆盘菜单出现时让行。
		 *  4. 会话菜单使用官方 slot；工作区菜单扩展仍使用原生操作与真实工作目录。
		 */
		var MENU_ID = "dsh-agent-menu-root";
		var TOAST_ID = "dsh-agent-menu-toast";
		var STYLE_ID = "dsh-agent-menu-style";
		var ITEM_CLASS = "dsh-am-item";
		/** dsh-file-menu 的菜单根 id；存在说明它刚为这次右键弹过菜单。 */
		var FILE_MENU_ROOT_ID = "dsh-file-menu-root";
		/** dsh-round-rightclick 的全屏遮罩；存在说明圆盘菜单在显示。 */
		var ROUND_MENU_LAYER = "[data-dsh-rr-layer]";
		/** 客户端 ctx：可选读取官方工作区/会话快照与菜单 slot。 */
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
		var CLIENT_VERSION = "0.8.3";
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
			"#" + MENU_ID + "{position:fixed;z-index:2147483000;min-width:200px;max-width:340px;padding:5px;",
			"border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:12px;",
			"background:var(--dsh-am-menu-bg,var(--dsw-alias-bg-layer-2,#fff));",
			"box-shadow:0 6px 20px rgba(0,0,0,.14);font:" + FONT + ";",
			"color:var(--dsw-alias-label-primary,currentColor);user-select:none}",
			"#" + MENU_ID + " ." + ITEM_CLASS + "{display:flex;align-items:center;gap:12px;width:100%;padding:7px 10px;",
			"border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}",
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
			".dsh-am-workspace-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;border-radius:6px;",
			"background:transparent;color:inherit;font:" + FONT + ";text-align:left;cursor:pointer}",
			".dsh-am-workspace-item:hover,.dsh-am-workspace-item:focus-visible{",
			"background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));outline:none}",
			".dsh-am-danger{color:#ef4444}",
		].join("");

		/** 文案集中在一处，便于以后接 locale 服务做多语言。 */
		var LANG = {
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
			copyCode: "复制代码",
			copyAsMarkdownLink: "复制为 Markdown 链接",
			undo: "撤销",
			redo: "重做",
			copyImage: "复制图像",
			saveImageAs: "另存为…",
			removeImage: "从输入框移除",
			imageFailed: "图片操作失败：",
			imagePathUnknown: "解析不出这张图的本地路径",
			savedTo: "已另存为：",
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
			copyCwd: "复制工作目录",
			newSession: "新建会话",
			copySessionId: "复制会话 ID",
			deleteSession: "删除会话",
			deleteSessionDone: "会话已删除",
			deleteSessionBusy: "会话仍被本应用占用，重启后再删除",
			deleteSessionFailed: "删除会话失败：",
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
				var sessions = pluginCtx.get("sessions");
				var id = sessions.list.getSnapshot().current;
				if (id === "") return "";
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

		// ─────────────────────────── 菜单构建 ───────────────────────────

		/** 选中文字时只复制；链接场景由 appendContextItems 补充链接操作。 */
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

		/** 文件芯片 / 工具行文件链接：只保留绝对路径复制与系统操作。 */
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
			return items;
		}

		/**
		 * 超链接：复制地址 / 复制 Markdown 链接 / 浏览器打开。
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
			var path = mediaPathOf(image);
			items.push({
				label: LANG.copyImage,
				run: function () {
					runImageAction(image, "copy");
				},
			});
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

		/** 代码块：只复制代码文本，不添加语言标记或 AI 操作。 */
		function itemsForCodeBlock(context, block) {
			return [{ label: LANG.copyCode, hint: LANG.copyHint, run: function () { copyText(block.text); } }];
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
			var code = codeBlockOf(context.target);
			if (code !== null) {
				context.code = code;
				return "codeBlock";
			}
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
					items = itemsForImage(context, context.image, context.inComposerArea === true);
				} else if (scenario === "selection") {
					items = itemsForSelection(context.target, context.selection);
					items = appendContextItems(items, context);
				} else if (scenario === "codeBlock") {
					items = itemsForCodeBlock(context, context.code);
				} else if (scenario === "link") {
					items = itemsForLink(context, context.link);
				} else if (scenario === "file" && path !== "") {
					items = itemsForFile(context, rawPath, base, path);
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
				items.push({ separator: true });
				items = items.concat(itemsForLink(context, context.link));
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

		// ─────────────────────────── 侧栏真实目录操作 ───────────────────────────

		function serviceSnapshot(name) {
			try {
				if (pluginCtx === null || typeof pluginCtx.get !== "function") return null;
				var service = pluginCtx.get(name);
				if (!service || !service.list || typeof service.list.getSnapshot !== "function") return null;
				return service.list.getSnapshot() || null;
			} catch (error) {
				return null;
			}
		}

		function sessionCwd(sessionId) {
			var snapshot = serviceSnapshot("sessions");
			var item = snapshot && snapshot.byId && snapshot.byId[sessionId];
			return item && typeof item.cwd === "string" ? item.cwd : "";
		}

		function workspaceInfo(workspaceId) {
			var snapshot = serviceSnapshot("workspaces");
			var items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
			for (var i = 0; i < items.length; i += 1) {
				if (items[i] && items[i].workspaceId === workspaceId) return items[i];
			}
			return null;
		}

		function rowKeyOf(row) {
			try { return String(row && row.dataset && row.dataset.rowKey || ""); } catch (error) { return ""; }
		}

		function sidebarTargetOf(row) {
			var key = rowKeyOf(row);
			if (key.indexOf("session:") === 0) return { kind: "session", id: key.slice(8) };
			if (key.indexOf("workspace:") !== 0) return null;
			var workspaceId = key.slice(10);
			var info = workspaceInfo(workspaceId);
			if (!info || typeof info.path !== "string" || info.path === "") return null;
			return { kind: "workspace", id: workspaceId, cwd: info.path };
		}

		function revealCwd(cwd) {
			if (cwd === "") return;
			callFileAction("reveal", cwd, "");
		}

		function copyCwd(cwd) {
			if (cwd !== "") copyText(cwd);
		}

		/** 删除会话：走本插件宿主路由（删会话目录 + 取消归档）。宿主没有官方删除接口。 */
		function deleteSession(sessionId) {
			postJson(HOST_PREFIX + "/session-delete", { sessionId: sessionId }).then(function (result) {
				if (result.ok) {
					toast(LANG.deleteSessionDone);
					refreshSessions();
					return;
				}
				if (result.status === 409) {
					toast(LANG.deleteSessionBusy, true);
					return;
				}
				toast(LANG.deleteSessionFailed + (result.error || "HTTP " + result.status), true);
			});
		}

		/** 删除成功后让官方 sessions 服务重读快照，侧栏立刻少一行。 */
		function refreshSessions() {
			try {
				if (pluginCtx === null || typeof pluginCtx.get !== "function") return;
				var service = pluginCtx.get("sessions");
				if (service && typeof service.refresh === "function") service.refresh();
			} catch (error) {
				/* 刷新失败不致命：下次列表操作会带回新状态 */
			}
		}

		/**
		 * 宿主内置项「复制 Session ID」是中英混排（locale 键 menu.sessionId），没有配置能改文案，
		 * 只能在菜单弹出后把这一条的文本节点替换成「复制会话 ID」。借会话插槽的 render 触发
		 * （每次打开会话菜单宿主都会调用我们的 render），setTimeout(0) 等菜单 DOM 就位。
		 */
		var sessionIdLabelTimer = null;
		function scheduleSessionIdLabelFix() {
			if (sessionIdLabelTimer !== null) return;
			sessionIdLabelTimer = window.setTimeout(function () {
				sessionIdLabelTimer = null;
				localizeSessionIdItem();
			}, 0);
		}

		/** 深度找第一个含 from 的文本节点替换之；找不到（DOM 结构和预期不同）就放弃，不强改。 */
		function replaceTextNodeDeep(node, from, to) {
			try {
				var kids = node.childNodes || [];
				for (var i = 0; i < kids.length; i += 1) {
					var kid = kids[i];
					if (!kid) continue;
					if (kid.nodeType === 3) {
						var value = String(kid.nodeValue !== undefined && kid.nodeValue !== null ? kid.nodeValue : kid.textContent || "");
						if (value.indexOf(from) !== -1) {
							if (kid.nodeValue !== undefined) kid.nodeValue = value.replace(from, to);
							if (kid.textContent !== undefined) kid.textContent = value.replace(from, to);
							return true;
						}
					} else if (kid.nodeType === 1 && replaceTextNodeDeep(kid, from, to)) {
						return true;
					}
				}
			} catch (error) {
				/* 结构不认识就不动 */
			}
			return false;
		}

		function localizeSessionIdItem() {
			try {
				var menus = document.querySelectorAll('[role="menu"]');
				for (var i = 0; i < menus.length; i += 1) {
					var menu = menus[i];
					if (!menu || menu.id === MENU_ID || typeof menu.querySelectorAll !== "function") continue;
					var items = menu.querySelectorAll('[role="menuitem"]');
					for (var k = 0; k < items.length; k += 1) {
						var item = items[k];
						if (!item || item.className.indexOf("dsh-am-") !== -1) continue;
						var label = String(item.textContent || item.innerText || "").trim();
						if (label === "复制 Session ID") replaceTextNodeDeep(item, "复制 Session ID", LANG.copySessionId);
					}
				}
			} catch (error) {
				/* 官方文案若变了，本补丁自然失效即可 */
			}
		}

		/** 工作区菜单没有官方 slot：只向刚由该行的 ⋮ 打开的原生菜单追加真实操作。 */
		function dismissNativeMenu() {
			try {
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			} catch (error) { /* 操作本身仍可执行 */ }
		}

		/* 原生菜单项都带线性图标，追加项必须同款，否则一眼假。
		 * 图标用内联 SVG（stroke=currentColor，继承菜单项文字颜色，删除项自动变红）。
		 * 路径为 Lucide 风格自绘，viewBox 24；实际渲染尺寸在插入后由
		 * alignPluginItemsToNative 按同菜单的原生图标实测值对齐（宿主图标多为 14px）。 */
		var MENU_ICON_PATHS = {
			newSession: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>',
			copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
			reveal: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/><path d="m9 13 2 2 4-4"/>',
			trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
		};
		function menuIconSvg(name) {
			var markup = MENU_ICON_PATHS[name];
			if (!markup) return "";
			return '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
				' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none">' +
				markup + "</svg>";
		}
		/**
		 * 把本插件追加项的几何对齐到同菜单里第一个带图标的原生项：
		 * 内边距、字号、行高、图标与文字的间距、图标尺寸逐项照抄，
		 * 保证图标列、文字列、行高三者像素级一致。宿主改版换样式也不用
		 * 改代码——照抄的是当次渲染出来的实际值。拿不到 getComputedStyle
		 * 或菜单里没有带图标的原生项时保持插件默认样式（flex+8px gap）。
		 */
		function alignPluginItemsToNative(menu) {
			if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return;
			var additions = menu.querySelectorAll(".dsh-am-workspace-item");
			if (!additions || additions.length === 0) return;
			var natives = menu.querySelectorAll('[role="menuitem"]');
			var ref = null;
			var refIcon = null;
			for (var i = 0; i < natives.length; i += 1) {
				var item = natives[i];
				if (String(item.className || "").indexOf("dsh-am-workspace-item") !== -1) continue;
				if (typeof item.querySelector !== "function") continue;
				var svg = item.querySelector("svg");
				if (svg) { ref = item; refIcon = svg; break; }
			}
			if (ref === null) return;
			try {
				var cs = window.getComputedStyle(ref);
				var iconSize = 0;
				if (refIcon && typeof refIcon.getBoundingClientRect === "function") {
					iconSize = Math.round(refIcon.getBoundingClientRect().width) || 0;
				}
				// 描边粗细也要照抄：宿主图标多为 1.5，插件默认 2，混排会显得
				// 插件项"用力过猛"。stroke-width 是继承属性，设在 svg 的 style 上即可。
				var iconStroke = "";
				if (refIcon) {
					var ics = window.getComputedStyle(refIcon);
					if (ics && ics.strokeWidth && ics.strokeWidth !== "normal") iconStroke = ics.strokeWidth;
				}
				for (var j = 0; j < additions.length; j += 1) {
					var it = additions[j];
					if (cs.padding) it.style.padding = cs.padding;
					if (cs.fontSize) it.style.fontSize = cs.fontSize;
					if (cs.lineHeight && cs.lineHeight !== "normal") it.style.lineHeight = cs.lineHeight;
					var ownIcon = typeof it.querySelector === "function" ? it.querySelector("svg") : null;
					if (ownIcon) {
						if (iconSize > 0) {
							ownIcon.setAttribute("width", String(iconSize));
							ownIcon.setAttribute("height", String(iconSize));
						}
						if (iconStroke) ownIcon.style.strokeWidth = iconStroke;
						if (cs.gap) it.style.gap = cs.gap;
						else if (cs.columnGap) it.style.gap = cs.columnGap;
					}
				}
			} catch (error) { /* 对齐失败保持默认样式，不影响功能 */ }
		}
		function workspaceButton(label, action, extraClass, iconName) {
			var button = document.createElement("button");
			button.type = "button";
			button.className = ITEM_CLASS + " dsh-am-workspace-item" + (extraClass ? " " + extraClass : "");
			button.setAttribute("role", "menuitem");
			var icon = iconName ? menuIconSvg(iconName) : "";
			if (icon) {
				button.innerHTML = icon + "<span>" + label + "</span>";
			} else {
				button.textContent = label;
			}
			button.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				dismissNativeMenu();
				action();
			});
			return button;
		}

		function menuHasOnlyWorkspaceDefaults(menu) {
			var items = menu.querySelectorAll('[role="menuitem"]');
			if (!items || items.length !== 2) return false;
			for (var i = 0; i < items.length; i += 1) {
				var label = String(items[i].textContent || items[i].innerText || "").trim();
				if (!/^(重命名|删除工作区|Rename|Delete workspace)$/.test(label)) return false;
			}
			return true;
		}

		function menuRectNearRow(menu, row) {
			try {
				var a = menu.getBoundingClientRect();
				var b = row.getBoundingClientRect();
				return a.left <= b.right + 320 && a.right >= b.left - 320 && a.top <= b.bottom + 360 && a.bottom >= b.top - 360;
			} catch (error) {
				return false;
			}
		}

		/**
		 * 插到 ref 之前：宿主可能把菜单项包在 group 容器里，所以直接进 ref 自己的父节点，
		 * 嵌套与否都能拿到精确顺序。锚不上（结构不认识）就退回 menu 尾部追加（旧版行为）。
		 */
		function insertMenuBefore(menu, node, ref) {
			var parent = null;
			try {
				parent = ref && ref.parentNode ? ref.parentNode : null;
			} catch (error) {
				parent = null;
			}
			var usable = parent && typeof parent.insertBefore === "function" &&
				(parent === menu || (typeof menu.contains === "function" ? menu.contains(parent) : true));
			if (usable) {
				try {
					parent.insertBefore(node, ref);
					return;
				} catch (error) {
					/* 结构不认识就退回追加 */
				}
			}
			menu.appendChild(node);
		}

		/**
		 * 原生菜单被右键唤起后尽早打补丁：先**同步**试一次（React 对离散事件同步
		 * 挂载，click() 返回时菜单已在 DOM 里，浏览器首帧绘制与测高之前就插好，
		 * 不会晚一帧弹出、也不会溢出卡片底边）；若菜单还没挂上，微任务 + rAF 阶梯
		 * 重试，最多 6 次后放弃。patchOnce 返回 true 表示「本行已补好或不适用」。
		 * 0.8.2 首版只在 setTimeout(0) 里补一次：真宿主里菜单先绘制后补丁，
		 * 「删除会话」晚一帧弹出还裁半，连续右键时每次时序不同——用户看到的狂闪。
		 */
		function patchSidebarMenu(row, patchOnce) {
			var attempts = 0;
			function step() {
				if (!activeGeneration()) return;
				var done = false;
				try {
					done = patchOnce(row) === true;
				} catch (error) {
					done = false;
				}
				if (done) return;
				attempts += 1;
				if (attempts >= 6) return;
				if (attempts === 1) {
					Promise.resolve().then(function () { step(); });
				} else if (typeof window.requestAnimationFrame === "function") {
					window.requestAnimationFrame(function () { step(); });
				} else {
					window.setTimeout(function () { step(); }, 32);
				}
			}
			step();
		}

		/** 工作区菜单补一次；true＝已补好或本次结构不适用，false＝还没等到菜单。 */
		function patchWorkspaceMenuOnce(row) {
			var target = sidebarTargetOf(row);
			if (!target || target.kind !== "workspace") return true;
			var menus = document.querySelectorAll('[role="menu"]');
			for (var i = menus.length - 1; i >= 0; i -= 1) {
				var menu = menus[i];
				if (!menu || menu.id === MENU_ID) continue;
				if (typeof menu.querySelector !== "function") continue;
				if (menu.querySelector(".dsh-am-workspace-item")) return true; // 前一次尝试已补过
				if (!menuHasOnlyWorkspaceDefaults(menu) || !menuRectNearRow(menu, row)) continue;
				// 用户要求的顺序：新建会话在最上、删除工作区沉底。原生菜单只有
				// 「重命名 / 删除工作区」两项（menuHasOnlyWorkspaceDefaults 已保证），
				// 以它们为锚点插入：新建会话 → 重命名之前；复制/打开 → 删除之前。
				var items = menu.querySelectorAll('[role="menuitem"]');
				var renameItem = null;
				var deleteItem = null;
				for (var k = 0; k < items.length; k += 1) {
					var label = String(items[k].textContent || items[k].innerText || "").trim();
					if (/^(删除工作区|Delete workspace)$/.test(label)) deleteItem = items[k];
					else if (/^(重命名|Rename)$/.test(label)) renameItem = items[k];
				}
				var newSessionItem = workspaceButton(LANG.newSession, function () {
					var buttons = row.querySelectorAll("button");
					for (var b = 0; b < buttons.length; b += 1) {
						var aria = String(buttons[b].getAttribute("aria-label") || "");
						if (/新建|新会话|new session/i.test(aria) && aria.slice(-3) !== "的操作") { buttons[b].click(); return; }
					}
					toast(LANG.actionFailed + "找不到原生新建会话按钮", true);
				}, "", "newSession");
				var tail = document.createDocumentFragment();
				tail.appendChild(workspaceButton(LANG.copyCwd, function () { copyCwd(target.cwd); }, "", "copy"));
				tail.appendChild(workspaceButton(LANG.reveal, function () { revealCwd(target.cwd); }, "", "reveal"));
				insertMenuBefore(menu, newSessionItem, renameItem);
				insertMenuBefore(menu, tail, deleteItem);
				alignPluginItemsToNative(menu);
				return true;
			}
			return false;
		}

		function installWorkspaceMenu(row) {
			patchSidebarMenu(row, patchWorkspaceMenuOnce);
		}

		/** 会话菜单是否有本插件的插槽项在渲染（有则不再 DOM 兜底，避免重复）。 */
		function menuHasAgentMenuSessionItem(menu) {
			var items = menu.querySelectorAll('[role="menuitem"]');
			for (var i = 0; i < items.length; i += 1) {
				var label = String(items[i].textContent || items[i].innerText || "").trim();
				if (label === LANG.deleteSession || label === LANG.copyCwd) return true;
			}
			return false;
		}

		/**
		 * 会话菜单的 DOM 兜底：官方插槽在部分环境不渲染插件项（本机 0.8.1 起
		 * 「复制工作目录/打开位置」就从未出现），删除会话与汉化不能只靠插槽。
		 * 只在右键唤起原生菜单后触发；插槽或前一次尝试已生效时自动跳过，不叠加。
		 */
		function patchSessionMenuOnce(row) {
			var target = sidebarTargetOf(row);
			if (!target || target.kind !== "session" || target.id === "") return true;
			localizeSessionIdItem();
			var menus = document.querySelectorAll('[role="menu"]');
			for (var i = menus.length - 1; i >= 0; i -= 1) {
				var menu = menus[i];
				if (!menu || menu.id === MENU_ID) continue;
				if (typeof menu.querySelector !== "function" || !menuRectNearRow(menu, row)) continue;
				if (menuHasOnlyWorkspaceDefaults(menu)) continue; // 那是工作区菜单，不是会话的
				if (menu.querySelector(".dsh-am-workspace-item") || menuHasAgentMenuSessionItem(menu)) return true;
				var sessionId = target.id;
				var deleteItem = workspaceButton(LANG.deleteSession, function () {
					deleteSession(sessionId);
				}, "dsh-am-danger", "trash");
				menu.appendChild(deleteItem);
				alignPluginItemsToNative(menu);
				return true;
			}
			return false;
		}

		function installSessionMenu(row) {
			patchSidebarMenu(row, patchSessionMenuOnce);
		}

		function installSessionSlot() {
			try {
				if (!pluginCtx || !pluginCtx.slots || typeof pluginCtx.slots.inject !== "function") return;
				var React = require("react");
				var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
				var MenuItemButton = primitives.MenuItemButton;
				function register(id, order, label, action, separatorBefore) {
					pluginCtx.slots.inject("sidebar.workspaces.session.menu.item", function () {
						return pluginCtx.slots.register(
							{ name: "sidebar.workspaces.session.menu.item", id: id, order: order },
							function (props) {
								scheduleSessionIdLabelFix();
								var cwd = sessionCwd(props.sessionId);
								if (cwd === "") return null;
								return React.createElement(MenuItemButton, {
									separatorBefore: separatorBefore,
									onSelect: function () {
										props.useMenuOpenState()[1](false);
										action(cwd);
									},
								}, label);
							},
						);
					});
				}
				register("dsh-agent-menu-copy-cwd", 460, LANG.copyCwd, copyCwd, true);
				register("dsh-agent-menu-reveal-cwd", 470, LANG.reveal, revealCwd, false);
				// 删除会话：排在宿主内置「复制 Session ID」（order 500）之后；
				// 不依赖 cwd，任何会话行都能删，实际删除由本插件宿主路由完成。
				pluginCtx.slots.inject("sidebar.workspaces.session.menu.item", function () {
					return pluginCtx.slots.register(
						{ name: "sidebar.workspaces.session.menu.item", id: "dsh-agent-menu-delete-session", order: 510 },
						function (props) {
							scheduleSessionIdLabelFix();
							var sessionId = String((props && props.sessionId) || "");
							if (sessionId === "") return null;
							return React.createElement(MenuItemButton, {
								separatorBefore: true,
								onSelect: function () {
									props.useMenuOpenState()[1](false);
									deleteSession(sessionId);
								},
							}, LANG.deleteSession);
						},
					);
				});
			} catch (error) {
				console.warn("[dsh-agent-menu] session menu slot unavailable:", error);
			}
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
						installWorkspaceMenu(sidebarRow);
						installSessionMenu(sidebarRow);
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
				// 0.8.0 起不再改写状态行文案；热重载自旧版时，拆掉旧版留下的状态行节点。
				try {
					var oldPhrases = window.__dshAgentMenuPhrases;
					if (oldPhrases && typeof oldPhrases.dispose === "function") oldPhrases.dispose();
					delete window.__dshAgentMenuPhrases;
				} catch (error) {
					/* 旧版残留清理失败不影响菜单 */
				}
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
				installSessionSlot();
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

		exports.apply = apply;
		exports.inject = [];
		return module.exports;
	}
});
