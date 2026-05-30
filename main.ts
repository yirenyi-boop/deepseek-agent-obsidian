import { App, Plugin, PluginManifest } from "obsidian";
import { DeepSeekClient } from "./src/DeepSeekClient";
import { DEFAULT_SETTINGS, PluginSettings } from "./src/types";
import { DeepSeekSettingTab } from "./src/settings";
import { ChatView, VIEW_TYPE } from "./src/views/ChatView";

export default class DeepSeekAgentPlugin extends Plugin {
	settings: PluginSettings;
	private client: DeepSeekClient;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.settings = { ...DEFAULT_SETTINGS };
		this.client = new DeepSeekClient(this.settings);
	}

	async onload() {
		await this.loadSettings();

		// 注册聊天视图
		this.registerView(VIEW_TYPE, (leaf) => new ChatView(leaf, this));

		// 命令：打开聊天面板
		this.addCommand({
			id: "open-deepseek-agent",
			name: "打开 DeepSeek Agent",
			callback: () => this.openChatView(),
		});

		// 命令：快速总结当前笔记
		this.addCommand({
			id: "deepseek-summarize",
			name: "Agent: 总结当前笔记",
			callback: () => this.quickTask("总结当前这篇笔记的内容要点"),
		});

		// 命令：快速搜索
		this.addCommand({
			id: "deepseek-ask-selection",
			name: "Agent: 解释选中的文本",
			editorCallback: (editor) => {
				const selected = editor.getSelection();
				if (selected) {
					this.quickTask(`解释以下内容:\n\n${selected}`);
				}
			},
		});

		// 设置面板
		this.addSettingTab(new DeepSeekSettingTab(this.app, this));

		// 点击 ribbon 图标打开
		this.addRibbonIcon("bot", "DeepSeek Agent", () => {
			this.openChatView();
		});

	}

	onunload() {
		// 清理视图
		this.app.workspace.detachLeavesOfType(VIEW_TYPE);
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateClient() {
		this.client.updateSettings(this.settings);
	}

	/** 打开聊天侧边栏 */
	async openChatView() {
		const { workspace } = this.app;

		// 先看是否已经打开
		const existing = workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}

		// 在右侧创建新面板
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE,
				active: true,
			});
			workspace.revealLeaf(leaf);
		}
	}

	/** 快速任务（打开面板并发送消息） */
	private async quickTask(task: string) {
		await this.openChatView();
		// 等待视图渲染完成后再灌消息
		setTimeout(() => {
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
			if (leaves.length > 0) {
				const view = leaves[0].view;
				if (view instanceof ChatView) {
					view.sendTask(task);
				}
			}
		}, 300);
	}

}
