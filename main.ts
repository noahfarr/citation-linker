import { Plugin, TFile, getFrontMatterInfo } from 'obsidian';
import { load } from 'js-yaml';

export default class CitationLinker extends Plugin {

	async onload() {
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on('create', async (file) => {
				if (file instanceof TFile && file.parent.path === 'references') {
					const fileContents = await this.app.vault.read(file);
					const frontmatter = this.getFrontMatter(fileContents);
					// if (!this.isLiteratureNote(frontmatter)) {
					// 	return;
					// }
					console.log("is literature note")
					const paperId = this.getPaperIdFromAnnotationTarget(frontmatter['annotation-target']);
					if (paperId === '') {
						return;
					}
					const paper = await this.fetchPaper(paperId);
					let references = await this.getReferences(paper);
					const titles = [];
					const authors = [];
					const years = [];
					for (const reference of references) {
						const referencePaperId = reference.paperId;
						if (!referencePaperId) {
							references = references.filter(ref => ref.paperId !== referencePaperId);
							continue;
						}
						const referenceData = await this.fetchPaper(referencePaperId);
						const firstAuthor = await this.getFirstAuthor(referenceData);
						titles.push(reference.title);
						authors.push(firstAuthor);
						years.push(referenceData.year);
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
			console.log('Found arxiv paper: ' + paperId)
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
		const fields = 'year,authors,references'
		const url = "https://api.semanticscholar.org/graph/v1/paper/" + id + "?fields=" + fields;
		const response = await fetch(url)
		const data = await response.json();
		return data;
	}

	async getReferences(data) {
		const references = data.references;
		return references;
	}

	async getFirstAuthor(data) {
		const authors = data.authors;
		if (authors.length === 0) {
			return "Anonymous";
		}
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
		// append the citation key to the file
		let newContents = fileContents;
		newContents += '\n\n## References';
		const bibliography = await this.getBibliography();
		for (const key of citationKeys) {
			if (await this.isCitationKeyInBibliography(key, bibliography)) {
				newContents += `\n- [[@${key} | ${titles[citationKeys.indexOf(key)]}]]`;
			}
		}
		this.app.vault.modify(file, newContents);
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