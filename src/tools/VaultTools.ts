import { App, MarkdownView, TFile, TFolder, Vault } from "obsidian";
import { ToolDefinition, ToolResult } from "../types";

/**
 * Agent 可用的 Vault 工具集
 * 所有操作通过 Obsidian API 实现，手机兼容
 */
export class VaultTools {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/** 获取所有工具定义（发给 DeepSeek 用） */
	getDefinitions(): ToolDefinition[] {
		return [
			{
				name: "search_notes",
				description:
					"搜索 vault 中的笔记内容。返回匹配的文件路径和摘要片段。支持中文搜索。",
				input_schema: {
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "搜索关键词",
						},
						maxResults: {
							type: "number",
							description: "最大返回数（默认 10）",
						},
					},
					required: ["query"],
				},
			},
			{
				name: "read_note",
				description: "读取一篇笔记的完整内容",
				input_schema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "笔记路径（如 日记/2024-01-01.md）",
						},
					},
					required: ["path"],
				},
			},
			{
				name: "write_note",
				description: "创建新笔记或覆写已有笔记",
				input_schema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "笔记路径（如 日记/2024-01-01.md）",
						},
						content: {
							type: "string",
							description: "笔记内容（Markdown 格式）",
						},
						overwrite: {
							type: "boolean",
							description: "如果文件已存在，是否覆写（默认 false）",
						},
					},
					required: ["path", "content"],
				},
			},
			{
				name: "patch_note",
				description: "编辑笔记的某一段内容（搜索替换）",
				input_schema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "笔记路径",
						},
						search: {
							type: "string",
							description: "要查找的文本（必须唯一）",
						},
						replace: {
							type: "string",
							description: "替换后的文本",
						},
					},
					required: ["path", "search", "replace"],
				},
			},
			{
				name: "list_notes",
				description: "列举 vault 中某个目录下的笔记和子目录",
				input_schema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "目录路径（默认 vault 根目录）",
						},
					},
					required: [],
				},
			},
			{
				name: "get_active_note",
				description: "获取当前在编辑器中打开的笔记路径和内容",
				input_schema: {
					type: "object",
					properties: {},
					required: [],
				},
			},
		];
	}

	/** 执行工具调用 */
	async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
		try {
			switch (name) {
				case "search_notes":
					return await this.searchNotes(args.query as string, args.maxResults as number);
				case "read_note":
					return await this.readNote(args.path as string);
				case "write_note":
					return await this.writeNote(
						args.path as string,
						args.content as string,
						args.overwrite as boolean
					);
				case "patch_note":
					return await this.patchNote(
						args.path as string,
						args.search as string,
						args.replace as string
					);
				case "list_notes":
					return await this.listNotes(args.path as string);
				case "get_active_note":
					return await this.getActiveNote();
				default:
					return { success: false, output: `未知工具: ${name}` };
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			return { success: false, output: `执行出错: ${msg}` };
		}
	}

	// ── 工具实现 ──

	private async searchNotes(query: string, maxResults = 10): Promise<ToolResult> {
		const vault = this.app.vault;
		const files = vault.getMarkdownFiles();
		const results: { path: string; snippet: string }[] = [];

		const q = query.toLowerCase();

		for (const file of files) {
			if (results.length >= maxResults) break;
			try {
				const content = await vault.read(file);
				const lines = content.split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (lines[i].toLowerCase().includes(q)) {
						const snippet = lines.slice(Math.max(0, i - 1), i + 2).join("\n").trim();
						results.push({
							path: file.path,
							snippet: snippet.slice(0, 200),
						});
						break;
					}
				}
			} catch {
				// 跳过无法读取的文件
			}
		}

		if (results.length === 0) {
			return { success: true, output: `未找到包含"${query}"的笔记` };
		}

		const output = results
			.map((r) => `📄 ${r.path}\n\`\`\`\n${r.snippet}\n\`\`\``)
			.join("\n---\n");

		return { success: true, output };
	}

	private async readNote(path: string): Promise<ToolResult> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			return { success: false, output: `文件不存在: ${path}` };
		}
		const content = await this.app.vault.read(file);
		return {
			success: true,
			output: `📄 ${path}\n\n${content}`,
		};
	}

	private async writeNote(
		path: string,
		content: string,
		overwrite = false
	): Promise<ToolResult> {
		const vault = this.app.vault;
		const existing = vault.getAbstractFileByPath(path);

		if (existing && existing instanceof TFile) {
			if (!overwrite) {
				return {
					success: false,
					output: `文件已存在: ${path}。如需覆写请设置 overwrite=true`,
				};
			}
			await vault.modify(existing, content);
			return { success: true, output: `✅ 已更新: ${path}` };
		}

		// 确保父目录存在
		const parentPath = path.contains("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		if (parentPath) {
			const parent = vault.getAbstractFileByPath(parentPath);
			if (!parent || !(parent instanceof TFolder)) {
				await vault.createFolder(parentPath);
			}
		}

		await vault.create(path, content);
		return { success: true, output: `✅ 已创建: ${path}` };
	}

	private async patchNote(
		path: string,
		search: string,
		replace: string
	): Promise<ToolResult> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			return { success: false, output: `文件不存在: ${path}` };
		}

		const content = await this.app.vault.read(file);
		const idx = content.indexOf(search);

		if (idx === -1) {
			return {
				success: false,
				output: `未在 ${path} 中找到:\n"""${search}"""`,
			};
		}

		// 检查唯一性
		const lastIdx = content.lastIndexOf(search);
		if (idx !== lastIdx) {
			return {
				success: false,
				output: `搜索文本在 ${path} 中出现多次，请提供更精确的匹配`,
			};
		}

		const newContent = content.replace(search, replace);
		await this.app.vault.modify(file, newContent);
		return { success: true, output: `✅ 已更新 ${path}` };
	}

	private async listNotes(path?: string): Promise<ToolResult> {
		const target = path ? this.app.vault.getAbstractFileByPath(path) : this.app.vault.getRoot();

		if (!target) {
			return { success: false, output: `目录不存在: ${path}` };
		}

		const folder = target instanceof TFolder ? target : target.parent;
		if (!folder) {
			return { success: false, output: "无法获取目录信息" };
		}

		const items = folder.children
			.filter((c) => c instanceof TFile || c instanceof TFolder)
			.map((c) => {
				const icon = c instanceof TFolder ? "📁" : "📄";
				return `${icon} ${c.name}`;
			})
			.join("\n");

		const folderPath = folder.path || "/";
		return {
			success: true,
			output: `📂 ${folderPath}\n${items}`,
		};
	}

	private async getActiveNote(): Promise<ToolResult> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return { success: false, output: "当前没有打开的笔记" };
		}

		const file = view.file;
		if (!file) {
			return { success: false, output: "无法获取当前笔记" };
		}

		const content = await this.app.vault.read(file);
		return {
			success: true,
			output: `📄 ${file.path}\n\n${content}`,
		};
	}
}
