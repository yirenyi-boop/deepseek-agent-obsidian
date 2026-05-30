import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { Agent, AgentCallbacks } from "../Agent";
import { DeepSeekClient } from "../DeepSeekClient";
import { VaultTools } from "../tools/VaultTools";
import type DeepSeekAgentPlugin from "../../main";

export const VIEW_TYPE = "deepseek-agent-chat";

export class ChatView extends ItemView {
	private plugin: DeepSeekAgentPlugin;
	private agent: Agent;
	private containerEl_: HTMLElement;
	private messagesEl: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private sendBtn: HTMLElement;
	private statusEl: HTMLElement;
	private abortBtn: HTMLElement;
	private isRunning = false;
	private scrollRafId = 0;

	constructor(leaf: WorkspaceLeaf, plugin: DeepSeekAgentPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "DeepSeek Agent";
	}

	getIcon(): string {
		return "bot";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("deepseek-agent-container");

		// ── 顶部状态栏 ──
		const header = container.createDiv("deepseek-agent-header");
		header.createEl("h3", { text: "🤖 DeepSeek Agent" });

		this.statusEl = header.createSpan("deepseek-agent-status");
		this.statusEl.setText("就绪");

		this.abortBtn = header.createEl("button", "deepseek-agent-abort-btn");
		this.abortBtn.setText("✕ 停止");
		this.abortBtn.addClass("deepseek-agent-hidden");
		this.abortBtn.onClickEvent(() => {
			this.isRunning = false;
			this.abortBtn.addClass("deepseek-agent-hidden");
			this.statusEl.setText("已停止");
			this.agent?.cancel();
		});

		// ── 消息列表 ──
		this.messagesEl = container.createDiv("deepseek-agent-messages");
		this.addWelcomeMessage();

		// ── 输入区 ──
		const inputArea = container.createDiv("deepseek-agent-input-area");
		this.inputEl = inputArea.createEl("textarea", "deepseek-agent-input");
		this.inputEl.setAttr("rows", "3");
		this.inputEl.setAttr("placeholder", "输入任务…\n例如：把这周日记总结成周报");
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		const btnRow = inputArea.createDiv("deepseek-agent-btn-row");
		this.sendBtn = btnRow.createEl("button", "deepseek-agent-send-btn");
		this.sendBtn.setText("▶ 发送");
		this.sendBtn.onClickEvent(() => this.sendMessage());

		// 快捷指令
		const quickRow = container.createDiv("deepseek-agent-quick-row");
		const quickBtns = [
			{ text: "📋 当前笔记总结", action: "总结当前这篇笔记的内容要点" },
			{ text: "📊 本周汇总", action: "查找本周所有日记，汇总成一份周报" },
			{ text: "🔍 搜索闪念", action: "搜索所有未整理的闪念笔记" },
		];

		for (const qb of quickBtns) {
			const btn = quickRow.createEl("button", "deepseek-agent-quick-btn");
			btn.setText(qb.text);
			btn.onClickEvent(() => {
				this.inputEl.value = qb.action;
				this.sendMessage();
			});
		}
	}

	async onClose() {
		// 清理
	}

	/** 外部入口：发送任务（被 main.ts quickTask 调用） */
	sendTask(task: string) {
		this.inputEl.value = task;
		this.sendMessage();
	}

	/** 发送消息 */
	private async sendMessage(text?: string) {
		// 重入保护：如果已有 Agent 在跑，先取消
		if (this.isRunning) {
			this.agent?.cancel();
			this.isRunning = false;
		}

		const content = text ?? this.inputEl.value.trim();
		if (!content) return;

		this.inputEl.value = "";
		this.isRunning = true;
		this.abortBtn.removeClass("deepseek-agent-hidden");
		this.sendBtn.setText("⏳ 执行中…");
		this.statusEl.setText("思考中…");

		// 显示用户消息
		this.addMessageEl("user", content);

		try {
			// 检查是否有 API Key
			if (!this.plugin.settings.apiKey) {
				this.addMessageEl(
					"error",
					"❌ 请先在设置中填写 DeepSeek API Key\n`设置 → 插件选项 → DeepSeek Agent`"
				);
				this.isRunning = false;
				this.sendBtn.setText("▶ 发送");
				this.abortBtn.addClass("deepseek-agent-hidden");
				this.statusEl.setText("就绪");
				return;
			}

			// 多轮对话：复用 Agent 实例，保持上下文
			if (!this.agent) {
				const client = new DeepSeekClient(this.plugin.settings);
				const tools = new VaultTools(this.plugin.app);
				this.agent = new Agent(
					client,
					tools,
					this.plugin.settings,
					this.createCallbacks()
				);
				await this.agent.run(content);
			} else {
				await this.agent.continue(content);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.addMessageEl("error", `❌ ${msg}`);
		} finally {
			this.isRunning = false;
			this.sendBtn.setText("▶ 发送");
			this.abortBtn.addClass("deepseek-agent-hidden");
			this.statusEl.setText("就绪");
		}
	}

	/** 创建回调 */
	private createCallbacks(): AgentCallbacks {
		let currentAssistantEl: HTMLElement | null = null;
		let currentAssistantContent = "";
		let currentReasoningEl: HTMLElement | null = null;
		let currentReasoningBody: HTMLElement | null = null;

		return {
			onThinking: (text: string) => {
				if (!currentAssistantEl) {
					currentAssistantEl = this.addMessageEl("assistant", "");
					currentAssistantContent = "";
				}
				currentAssistantContent += text;
				currentAssistantEl.setText(currentAssistantContent);
			},
			onReasoning: (text: string) => {
				// 展示推理过程（折叠区域）
				if (!currentReasoningEl) {
					currentReasoningEl = this.messagesEl.createDiv(
						"deepseek-agent-reasoning"
					);
					const header = currentReasoningEl.createDiv(
						"deepseek-agent-reasoning-header"
					);
					header.setText("🧠 推理过程");
					currentReasoningBody = currentReasoningEl.createDiv(
						"deepseek-agent-reasoning-body"
					);
					currentReasoningBody.setText(text);
					this.scrollToBottom();
				} else if (currentReasoningBody) {
					// 增量追加文本节点，避免全量 setText 触发重排
					currentReasoningBody.insertAdjacentText("beforeend", text);
				}
			},
			onToolCall: (name: string, args: string) => {
				currentAssistantEl = null;
				currentAssistantContent = "";
				currentReasoningEl = null;
				this.addToolCallEl(name, args);
			},
			onToolResult: (name: string, result: string) => {
				const preview =
					result.length > 150
						? result.slice(0, 150) + "…"
						: result;
				this.addToolResultEl(name, preview);
			},
			onMessage: (text: string) => {
				this.addMessageEl("assistant", text);
			},
			onError: (error: string) => {
				this.addMessageEl("error", `❌ ${error}`);
			},
			onDone: (summary: string) => {
				this.statusEl.setText("✅ 完成");
			},
		};
	}

	/** 添加消息气泡 */
	private addMessageEl(role: string, content: string): HTMLElement {
		const el = this.messagesEl.createDiv(
			`deepseek-agent-msg deepseek-agent-msg-${role}`
		);
		el.setText(content);
		this.scrollToBottom();
		return el;
	}

	/** 添加工具调用指示 */
	private addToolCallEl(name: string, args: string) {
		const el = this.messagesEl.createDiv("deepseek-agent-tool-call");
		const header = el.createDiv("deepseek-agent-tool-header");
		header.setText(`🔧 调用: ${name}`);
		const detail = el.createDiv("deepseek-agent-tool-detail");
		try {
			const parsed = JSON.parse(args);
			detail.setText(JSON.stringify(parsed, null, 2));
		} catch {
			detail.setText(args);
		}
		this.scrollToBottom();
	}

	/** 添加工具结果指示 */
	private addToolResultEl(name: string, result: string) {
		const el = this.messagesEl.createDiv("deepseek-agent-tool-result");
		el.setText(`📥 ${name} → ${result}`);
		this.scrollToBottom();
	}

	/** 欢迎消息 */
	private addWelcomeMessage() {
		const el = this.messagesEl.createDiv(
			"deepseek-agent-msg deepseek-agent-msg-system"
		);
		el.innerHTML = `
👋 你好！我是 DeepSeek Agent。

我可以帮你:
- 📖 <b>总结笔记</b> — "总结当前笔记"
- 📊 <b>生成周报</b> — "把本周日记汇总成周报"
- 🔍 <b>搜索内容</b> — "找到关于XX的笔记"
- ✏️ <b>批量编辑</b> — "把标签 #draft 改成 #published"
- 📝 <b>创建内容</b> — "根据笔记 X 生成一篇博客"

试试输入任务，或者点下面的快捷按钮 👇
		`.trim();
	}

	private scrollToBottom() {
		// RAF 防抖：高频调用只触发一次 scroll
		if (this.scrollRafId) return;
		this.scrollRafId = requestAnimationFrame(() => {
			this.scrollRafId = 0;
			this.messagesEl.scrollTo({
				top: this.messagesEl.scrollHeight,
				behavior: "smooth",
			});
		});
	}
}
