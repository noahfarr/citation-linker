import { Plugin, TFile, FileManager, getFrontMatterInfo } from 'obsidian';
import { load, dump } from 'js-yaml';

export default class CitationLinker extends Plugin {

	async onload() {
		
		this.addCommand(
			{
				id: 'insert-references-for-all-files',
				name: 'Insert references for all files',
				callback: async () => {
					// get all files from the references folder
					const referencesFolder = this.app.vault.getFolderByPath("references");
					for (const child of referencesFolder?.children) {
						if (child instanceof TFile) {
							const fileContents = await this.app.vault.read(child);
							const frontmatter = this.getFrontMatter(fileContents);
							const paperId = this.getPaperIdFromAnnotationTarget(frontmatter['annotation-target']);
							if (paperId === '') return;
							const paper = await this.fetchPaper(paperId);
							console.log(paper)
							const references = await this.getReferences(paper);
							const titles = [];
							const authors = [];
							const years = [];
							for (const reference of references) {
								console.log(reference)
								if (!reference.paperId || reference.authors.length == 0) continue;
								titles.push(reference.title);
								years.push(reference.year);
								const author = await this.getFirstAuthor(reference.authors);
								authors.push(author);
							}
							const citationKeys = this.createCitationKeys(authors, titles, years);
							this.writeCitationKeysToFile(titles, citationKeys, child, fileContents);
						}
					}
				}
			}
		)

		this.addCommand({
			id: 'insert-references',
			name: 'Insert references',
			callback: async () => {
				const activeFile = await this.app.workspace.getActiveFile();
				if (activeFile instanceof TFile) {
					const fileContents = await this.app.vault.read(activeFile);
					const frontmatter = this.getFrontMatter(fileContents);
					const paperId = this.getPaperIdFromAnnotationTarget(frontmatter['annotation-target']);
					if (paperId === '') return;
					const paper = await this.fetchPaper(paperId);
					const references = await this.getReferences(paper);
					const titles = [];
					const authors = [];
					const years = [];
					for (const reference of references) {
						if (!reference.paperId || reference.authors.length == 0) continue;
						titles.push(reference.title);
						years.push(reference.year);
						const author = await this.getFirstAuthor(reference.authors);
						authors.push(author);
					}
					const citationKeys = this.createCitationKeys(authors, titles, years);
					this.writeCitationKeysToFile(titles, citationKeys, activeFile, fileContents);
				}
			}
		});
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on('create', async (file) => {
				if (file instanceof TFile && file.parent.path === 'references') {
					const fileContents = await this.app.vault.read(file);
					const frontmatter = this.getFrontMatter(fileContents);
					const paperId = this.getPaperIdFromAnnotationTarget(frontmatter['annotation-target']);
					if (paperId === '') return;
					const paper = await this.fetchPaper(paperId);
					let references = await this.getReferences(paper);
					const titles = [];
					const authors = [];
					const years = [];
					// const referencePromises = references.map()
					for (const reference of references) {
						if (!reference.paperId || reference.authors.length == 0) continue;
						titles.push(reference.title);
						years.push(reference.year);
						const author = await this.getFirstAuthor(reference.authors);
						authors.push(author);
					}
					const citationKeys = this.createCitationKeys(authors, titles, years);
					this.writeCitationKeysToFile(titles, citationKeys, file, fileContents);

				}
			}));
		});
	}


	getFrontMatter(fileContents: string) {
		const frontmatter = getFrontMatterInfo(fileContents).frontmatter;
		return load(frontmatter);
	}

	getPaperIdFromAnnotationTarget(annotationTarget: string) {
		if (annotationTarget.includes('arxiv')) {
			const fileEnding = annotationTarget.split('/').pop().split('.');
			const paperId = fileEnding[0] + '.' + fileEnding[1];
			return 'ARXIV:' + paperId;

		}
		console.log('Warning: Not an arxiv paper')
		return '';
	}

	isLiteratureNote(frontmatter) {
		return frontmatter['tags'].includes('literature');
	}

	async fetchPaper(id: string) {
		// fetch from semantic scholar API
		const fields = 'references.title,references.year,references.authors'
		const url = "https://api.semanticscholar.org/graph/v1/paper/" + id + "?fields=" + fields;
		const response = await fetch(url)
		const data = await response.json();
		return data;
	}

	async getReferences(data) {
		const references = data.references;
		return references;
	}

	async getFirstAuthor(authors) {
		const author = authors[0].name.split(' ');
		return author[author.length - 1];
	}

	createCitationKeys(authors, titles, years) {
		return authors.map((author, index) => {
			const firstWordOfTitle = titles[index].split(' ')[0]; // Gets the first word of the title
			const year = years[index];
			return `${author.toLowerCase()}${year}${firstWordOfTitle.toLowerCase()}`;
		});
	};

	// citationKeys is type Array<string> and file is TFile
	async writeCitationKeysToFile(titles: Array<string>, citationKeys: Array<string>, file: TFile, fileContents: string) {
		const bibliography = await this.getBibliography();
		for (const key of citationKeys) {
			if (await this.isCitationKeyInBibliography(key, bibliography)) {
				const citationKey = '[[@' + key + ' | ' + titles[citationKeys.indexOf(key)] + ']]';
				this.app.fileManager.processFrontMatter(file, frontmatter => {
					if (!frontmatter.references) {
						frontmatter.references = [];
					}
					frontmatter.references.push(citationKey);
				})
			}
		}
	}

	async getBibliography() {
		const bibliography = this.app.vault.getAbstractFileByPath("references/bibliography.md")
		if (bibliography instanceof TFile) {
			const bibliographyContents = await this.app.vault.read(bibliography);
			return bibliographyContents;
		}
	}

	async isCitationKeyInBibliography(citationKey, bibliography) {
		return bibliography.includes(citationKey);
	}
}