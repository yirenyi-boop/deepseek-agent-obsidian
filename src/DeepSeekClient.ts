import { Message, PluginSettings, getModelInfo, supportsThinking } from "./types";

const API_BASE = "https://api.deepseek.com/v1/chat/completions";

/**
 * DeepSeek API 客户端
 * 纯 fetch 实现，手机兼容
 * 支持 V4 新特性: thinking + reasoning_effort
 */
export class DeepSeekClient {
	private settings: PluginSettings;
	private abortController: AbortController | null = null;

	constructor(settings: PluginSettings) {
		this.settings = settings;
	}

	/** 更新设置 */
	updateSettings(settings: PluginSettings) {
		this.settings = settings;
	}

	/** 取消当前请求 */
	cancel() {
		this.abortController?.abort();
	}

	/** 构建请求 body */
	private buildBody(
		messages: Message[],
		tools?: { name: string; description: string; input_schema: object }[]
	): Record<string, unknown> {
		const body: Record<string, unknown> = {
			model: this.settings.model,
			messages,
			max_tokens: this.settings.maxTokens,
			temperature: this.settings.temperature,
			stream: true,
		};

		// tools (function calling)
		if (tools && tools.length > 0) {
			body.tools = tools.map((t) => ({
				type: "function" as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: t.input_schema,
				},
			}));
			body.tool_choice = "auto";
		}

		// V4 thinking 参数
		if (supportsThinking(this.settings.model) && this.settings.enableThinking) {
			body.thinking = { type: "enabled" };
			body.reasoning_effort = this.settings.reasoningEffort;
		}

		return body;
	}

	/** 发送请求（无 tools） */
	async send(
		messages: Message[],
		onChunk?: (text: string) => void,
		onThinking?: (text: string) => void
	): Promise<Message> {
		return this.request(messages, undefined, onChunk, onThinking);
	}

	/** 发送请求（含 tools） */
	async sendWithTools(
		messages: Message[],
		tools: { name: string; description: string; input_schema: object }[],
		onChunk?: (text: string) => void,
		onThinking?: (text: string) => void
	): Promise<Message> {
		return this.request(messages, tools, onChunk, onThinking);
	}

	/** 通用请求方法 */
	private async request(
		messages: Message[],
		tools?: { name: string; description: string; input_schema: object }[],
		onChunk?: (text: string) => void,
		onThinking?: (text: string) => void
	): Promise<Message> {
		if (!this.settings.apiKey) {
			throw new Error("请先在设置中填写 DeepSeek API Key");
		}

		this.abortController = new AbortController();

		const body = this.buildBody(messages, tools);

		try {
			const response = await fetch(API_BASE, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.settings.apiKey}`,
				},
				body: JSON.stringify(body),
				signal: this.abortController.signal,
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(`API 错误 ${response.status}: ${errText}`);
			}

			return this.parseStreamingResponse(response, onChunk, onThinking);
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") {
				throw new Error("请求已取消");
			}
			throw err;
		} finally {
			this.abortController = null;
		}
	}

	/** 解析 SSE 流式响应 */
	private async parseStreamingResponse(
		response: Response,
		onChunk?: (text: string) => void,
		onThinking?: (text: string) => void
	): Promise<Message> {
		const reader = response.body?.getReader();
		if (!reader) throw new Error("无法读取响应流");

		const decoder = new TextDecoder();
		let buffer = "";

		// 组装最终消息
		let finalMessage: Message = {
			role: "assistant",
			content: "",
		};

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.startsWith("data: ")) continue;

				const data = trimmed.slice(6);
				if (data === "[DONE]") break;

				try {
					const parsed = JSON.parse(data);
					const delta = parsed.choices?.[0]?.delta;
					if (!delta) continue;

					// V4 thinking 内容（思考过程）
					if (delta.thinking) {
						onThinking?.(delta.thinking);
					}

					// 文本增量
					if (delta.content) {
						finalMessage.content += delta.content;
						onChunk?.(delta.content);
					}

					// tool_calls 增量
					if (delta.tool_calls) {
						if (!finalMessage.tool_calls) {
							finalMessage.tool_calls = [];
						}
						for (const tc of delta.tool_calls) {
							const idx = tc.index ?? 0;
							if (!finalMessage.tool_calls[idx]) {
								finalMessage.tool_calls[idx] = {
									id: tc.id || `call_${idx}`,
									type: "function",
									function: { name: "", arguments: "" },
								};
							}
							if (tc.function?.name) {
								finalMessage.tool_calls[idx].function.name +=
									tc.function.name;
							}
							if (tc.function?.arguments) {
								finalMessage.tool_calls[idx].function.arguments +=
									tc.function.arguments;
							}
						}
					}
				} catch {
					// 跳过解析失败行（通常是部分行）
				}
			}
		}

		return finalMessage;
	}
}
