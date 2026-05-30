import { DeepSeekClient } from "./DeepSeekClient";
import { VaultTools } from "./tools/VaultTools";
import { Message, ToolDefinition, PluginSettings, ToolCall } from "./types";

/**
 * Agent 事件回调
 */
export interface AgentCallbacks {
	/** Agent 发送了一条消息（文本回复） */
	onMessage: (text: string) => void;
	/** Agent 调用了工具 */
	onToolCall: (name: string, args: string) => void;
	/** 工具返回了结果 */
	onToolResult: (name: string, result: string) => void;
	/** 发生错误 */
	onError: (error: string) => void;
	/** Agent 完成 */
	onDone: (summary: string) => void;
	/** Agent 思考中（流式更新文本） */
	onThinking: (text: string) => void;
	/** 模型内部推理过程（仅 V4 Pro/R1） */
	onReasoning: (text: string) => void;
}

/**
 * DeepSeek Agent — 自主规划执行多步任务
 *
 * 工作流:
 * 1. 接收用户任务
 * 2. Agent 决定调用哪个工具
 * 3. 执行工具 → 结果返回 Agent
 * 4. Agent 观察结果 → 决定下一步
 * 5. 重复直到任务完成
 */
export class Agent {
	private client: DeepSeekClient;
	private tools: VaultTools;
	private settings: PluginSettings;
	private callbacks: AgentCallbacks;
	private messages: Message[] = [];
	private iterationCount = 0;

	constructor(
		client: DeepSeekClient,
		tools: VaultTools,
		settings: PluginSettings,
		callbacks: AgentCallbacks
	) {
		this.client = client;
		this.tools = tools;
		this.settings = settings;
		this.callbacks = callbacks;
	}

	/** 运行 Agent */
	async run(task: string) {
		this.messages = [];
		this.iterationCount = 0;

		// 系统提示词
		this.messages.push({
			role: "system",
			content: this.settings.systemPrompt,
		});

		// 用户任务
		this.messages.push({
			role: "user",
			content: task,
		});

		await this.loop();
	}

	/** 追加用户消息（多轮对话） */
	async continue(userMessage: string) {
		this.iterationCount = 0;
		this.messages.push({
			role: "user",
			content: userMessage,
		});
		await this.loop();
	}

	/** Agent 主循环 */
	private async loop() {
		const toolDefinitions = this.tools.getDefinitions();
		let finalContent = "";

		while (this.iterationCount < this.settings.maxIterations) {
			this.iterationCount++;

			try {
				// 调用 DeepSeek（含工具定义 + thinking/reasoning 支持）
				const response = await this.client.sendWithTools(
					this.messages,
					toolDefinitions,
					// 文本流式回调
					(text: string) => {
						this.callbacks.onThinking(text);
					},
					// 推理过程回调（V4 Pro/R1 独有）
					(text: string) => {
						this.callbacks.onReasoning(text);
					}
				);

				// 将 assistant 消息加入历史
				this.messages.push(response);

				// 检查是否有 tool_calls
				if (response.tool_calls && response.tool_calls.length > 0) {
					for (const tc of response.tool_calls) {
						await this.handleToolCall(tc);
					}
					// 继续循环——让 Agent 观察结果后决定下一步
					continue;
				}

				// 没有 tool_calls -> 任务完成
				finalContent = response.content;
				this.callbacks.onDone(response.content);
				return;
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				this.callbacks.onError(msg);
				return;
			}
		}

		// 超出最大迭代次数
		this.callbacks.onDone(
			`已达到最大迭代次数 (${this.settings.maxIterations})，任务可能未完成。\n${finalContent}`
		);
	}

	/** 估算消息的 token 数（中英文混合，~2 chars / token） */
	private estimateTokens(msg: Message): number {
		return Math.ceil(msg.content.length / 2);
	}

	/** 估算整个消息队列的 token 总数 */
	private totalTokens(): number {
		return this.messages.reduce((sum, m) => sum + this.estimateTokens(m), 0);
	}

	/**
	 * 上下文窗口裁剪
	 * 当总 token 超过阈值时，保留 system + 原始任务 + 最近 N 轮，丢弃中间历史
	 */
	private trimContext() {
		const maxTokens = 8000;
		if (this.totalTokens() <= maxTokens) return;

		const keepCount = Math.min(6, this.messages.length);
		const kept: Message[] = [
			this.messages[0],
			this.messages[1],
			...this.messages.slice(-(keepCount - 2)),
		];

		this.messages = kept;
		this.callbacks.onMessage(
			`[上下文已裁剪：保留了最近 ${keepCount - 2} 轮对话，丢弃了中间历史以节省 token]`
		);
	}

	/** 处理单个工具调用 */
	private async handleToolCall(tc: ToolCall) {
		const name = tc.function.name;
		let args: Record<string, unknown> = {};

		try {
			args = JSON.parse(tc.function.arguments);
		} catch {
			args = {};
		}

		this.callbacks.onToolCall(name, tc.function.arguments);

		// 执行工具
		const result = await this.tools.execute(name, args);
		this.callbacks.onToolResult(name, result.output);

		// 将工具结果加入消息历史
		this.messages.push({
			role: "tool",
			content: result.output,
			tool_call_id: tc.id,
			name: name,
		});

		// 每次工具调用后检查上下文窗口
		this.trimContext();
	}

	/** 取消当前请求 */
	cancel() {
		this.client.cancel();
	}

	/** 重置 Agent 状态 */
	reset() {
		this.messages = [];
		this.iterationCount = 0;
	}
}
