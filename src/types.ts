/** DeepSeek 消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 一条对话消息 */
export interface Message {
	role: MessageRole;
	content: string;
	tool_call_id?: string;
	name?: string;
	tool_calls?: ToolCall[];
}

/** DeepSeek 返回的 tool_call */
export interface ToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

/** Agent 可用的工具定义 */
export interface ToolDefinition {
	name: string;
	description: string;
	input_schema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

/** 工具执行结果 */
export interface ToolResult {
	success: boolean;
	output: string;
}

/** DeepSeek V4 模型信息 */
export interface ModelInfo {
	id: string;
	label: string;
	thinking: boolean;
	deprecated?: string;
}

/** 可用模型列表 */
export const MODELS: ModelInfo[] = [
	{
		id: "deepseek-v4-flash",
		label: "DeepSeek V4 Flash (快速, 默认)",
		thinking: false,
	},
	{
		id: "deepseek-v4-pro",
		label: "DeepSeek V4 Pro (推理, 深度思考)",
		thinking: true,
	},
	{
		id: "deepseek-chat",
		label: "deepseek-chat (将于 2026/07/24 弃用)",
		thinking: false,
		deprecated: "2026-07-24",
	},
	{
		id: "deepseek-reasoner",
		label: "deepseek-reasoner (将于 2026/07/24 弃用)",
		thinking: true,
		deprecated: "2026-07-24",
	},
];

/** reasoning_effort 选项 */
export type ReasoningEffort = "low" | "medium" | "high";

/** 插件设置 */
export interface PluginSettings {
	apiKey: string;
	model: string;
	maxTokens: number;
	temperature: number;
	maxIterations: number;
	systemPrompt: string;
	enableThinking: boolean;
	reasoningEffort: ReasoningEffort;
}

/** 默认设置 */
export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: "",
	model: "deepseek-v4-flash",
	maxTokens: 8192,
	temperature: 0.7,
	maxIterations: 20,
	enableThinking: false,
	reasoningEffort: "medium",
	systemPrompt:
		"你是一个 Obsidian 笔记助手 Agent。你可以搜索、读取、创建、编辑笔记来帮助用户完成任务。\n" +
		"每次执行一个工具后，基于结果决定下一步该做什么，直到任务完成。\n" +
		"任务完成后输出总结。",
};

/** DeepSeek API 响应 */
export interface DeepSeekResponse {
	id: string;
	choices: {
		index: number;
		message: Message;
		finish_reason: "stop" | "length" | "tool_calls";
	}[];
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/** 获取指定模型信息 */
export function getModelInfo(modelId: string): ModelInfo {
	return MODELS.find((m) => m.id === modelId) || MODELS[0];
}

/** 判断模型是否支持 thinking 模式 */
export function supportsThinking(modelId: string): boolean {
	const info = getModelInfo(modelId);
	return info.thinking;
}
