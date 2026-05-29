import { App, PluginSettingTab, Setting } from "obsidian";
import type DeepSeekAgentPlugin from "../main";
import { DEFAULT_SETTINGS, MODELS, ReasoningEffort } from "./types";

export class DeepSeekSettingTab extends PluginSettingTab {
	private plugin: DeepSeekAgentPlugin;

	constructor(app: App, plugin: DeepSeekAgentPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "DeepSeek Agent 设置" });

		// ── 连接 ──
		containerEl.createEl("h3", { text: "🔌 连接" });

		// API Key
		new Setting(containerEl)
			.setName("DeepSeek API Key")
			.setDesc("从 https://platform.deepseek.com/api_keys 获取")
			.addText((text) =>
				text
					.setPlaceholder("sk-xxxxxxxxxxxxxxxx")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
						this.plugin.updateClient();
					})
			);

		// ── 模型 ──
		containerEl.createEl("h3", { text: "🧠 模型" });

		// 模型选择
		const modelSetting = new Setting(containerEl)
			.setName("模型")
			.setDesc("推荐使用 deepseek-v4-flash（快速）或 deepseek-v4-pro（深度推理）");

		modelSetting.addDropdown((dd) => {
			for (const m of MODELS) {
				dd.addOption(m.id, m.label);
			}
			dd.setValue(this.plugin.settings.model);
			dd.onChange(async (value) => {
				this.plugin.settings.model = value;
				await this.plugin.saveSettings();
				this.display(); // 刷新界面（thinking 选项可能变化）
			});
		});

		// 当前模型的提示
		const currentModel = MODELS.find((m) => m.id === this.plugin.settings.model);
		if (currentModel?.deprecated) {
			containerEl.createEl("p", {
				text: `⚠️ ${currentModel.label} 将于 ${currentModel.deprecated} 弃用，建议切换到 deepseek-v4-flash 或 deepseek-v4-pro。`,
				cls: "setting-item-description mod-warning",
			});
		}

		// Thinking 模式（仅 V4 Pro / reasoner 支持）
		if (currentModel?.thinking) {
			new Setting(containerEl)
				.setName("启用思考模式 (Thinking)")
				.setDesc("V4 Pro 模型输出前会先进行内部推理，质量更高但速度较慢")
				.addToggle((tg) =>
					tg
						.setValue(this.plugin.settings.enableThinking)
						.onChange(async (value) => {
							this.plugin.settings.enableThinking = value;
							await this.plugin.saveSettings();
							this.display();
						})
				);

			// reasoning_effort（仅 thinking 启用时显示）
			if (this.plugin.settings.enableThinking) {
				new Setting(containerEl)
					.setName("推理深度 (Reasoning Effort)")
					.setDesc("low=快速/medium=适中/high=深度，越高越耗时")
					.addDropdown((dd) => {
						dd.addOption("low", "low (快速)");
						dd.addOption("medium", "medium (适中)");
						dd.addOption("high", "high (深度)");
						dd.setValue(this.plugin.settings.reasoningEffort);
						dd.onChange(async (value) => {
							this.plugin.settings.reasoningEffort = value as ReasoningEffort;
							await this.plugin.saveSettings();
						});
					});
			}
		} else {
			// Flash 模式下强制关闭 thinking
			if (this.plugin.settings.enableThinking) {
				this.plugin.settings.enableThinking = false;
				this.plugin.saveSettings();
			}
		}

		// ── 生成参数 ──
		containerEl.createEl("h3", { text: "⚙️ 生成参数" });

		// Temperature
		new Setting(containerEl)
			.setName("Temperature")
			.setDesc("生成随机性 (0-2, 默认 0.7)")
			.addSlider((sl) =>
				sl
					.setLimits(0, 2, 0.1)
					.setValue(this.plugin.settings.temperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.temperature = value;
						await this.plugin.saveSettings();
					})
			);

		// Max Tokens
		new Setting(containerEl)
			.setName("最大 Token 数")
			.setDesc("单次回复的最大长度")
			.addText((text) =>
				text
					.setPlaceholder("8192")
					.setValue(String(this.plugin.settings.maxTokens))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxTokens = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// ── Agent ──
		containerEl.createEl("h3", { text: "🤖 Agent 行为" });

		// 最大迭代次数
		new Setting(containerEl)
			.setName("最大迭代次数")
			.setDesc("Agent 在执行多步任务时的最大工具调用轮数")
			.addText((text) =>
				text
					.setPlaceholder("20")
					.setValue(String(this.plugin.settings.maxIterations))
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxIterations = num;
							await this.plugin.saveSettings();
						}
					})
			);

		// 系统提示词
		new Setting(containerEl)
			.setName("系统提示词")
			.setDesc("定义 Agent 的行为和角色")
			.addTextArea((ta) =>
				ta
					.setPlaceholder(DEFAULT_SETTINGS.systemPrompt)
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("hr");
		containerEl.createEl("p", {
			text: "💡 在命令面板中运行「DeepSeek Agent: 打开」打开聊天面板。",
			cls: "setting-item-description",
		});

		// 重置
		new Setting(containerEl)
			.setName("重置设置")
			.setDesc("恢复出厂设置")
			.addButton((btn) =>
				btn
					.setButtonText("重置")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings = { ...DEFAULT_SETTINGS };
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}
}
