// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as rd from 'readline';


class Common {
	static removeHashTagComment(line: string): string {
		return line.replace(/#.*/g, '')	// comments
			.replace(/^\s*/g, '')		// front blank
			.replace(/[\s]*$/g, '');	// tail blank
	}

	static pushMatchContent(file: vscode.TextDocument, start: number, end: number, associate_files: string[]): number {
		for (; start < end; start++) {
			let content = Common.removeHashTagComment(file.lineAt(start).text);
			if (content.length > 0) {
				if (content[0] === '[') {
					break;
				} else {
					associate_files.push(content);
				}
			}
		}
		return start - 1; // reparse this line for next loop
	}

	static searchPatternInFiles(associate_files: string[], base_path: string, pattern: string): vscode.Location | null {

		for (let iterator of associate_files) {
			if (!fs.existsSync(base_path + iterator)) {
				continue;
			}

			let reg = new RegExp('.*' + pattern + '.*');
			let lines = fs.readFileSync(base_path + iterator, 'utf8').split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].match(reg)) {
					return new vscode.Location(vscode.Uri.file(base_path + iterator), new vscode.Position(i, 0));
				}
			}
		}
		return null;
	}

	static buildDsc (...args: any[])
	{
		let config = vscode.workspace.getConfiguration('edk2-vscode');
		let parameter = ' -p ' +
						args[0].path.substring(1) +
						' -t ' +
						(config.has('build.compiler') ? config.get('build.compiler') : 'VS2015x86') +
						' -a ' +
						(config.has('build.arch') ? config.get('build.arch') : 'X64') +
						' -b ' +
						(config.has('build.target') ? config.get('build.target') : 'DEBUG');
		vscode.window.terminals[0].sendText('cmd.exe /K \"edksetup.bat & Build' + parameter + '\"');
	}
}

/*
*/
class Edk2FdfProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		let dest = Common.removeHashTagComment(document.lineAt(position).text);

		// Check INF prefix
		if (dest.match(/^INF[a-zA-Z0-9\s]+/g)) {
			if (vscode.workspace.workspaceFolders) {
				dest = vscode.workspace.workspaceFolders[0].uri.fsPath + '/' + dest.replace(/^INF[\s]+/g, '');
				// console.log(dest);
				if (fs.existsSync(dest)) {
					return new vscode.Location(vscode.Uri.file(dest), new vscode.Position(0, 0));
				}
			}
		}
	}
}

/*
*/
class Edk2DscProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {

		let dest = document.lineAt(position).text.replace(/#.*/g, '')	// comments
			.replace(/^\s*/g, '')										// front blank
			.replace(/[\s\{\}]*$/g, '')									// tail "{", "}"" and blank
			.replace(/[a-zA-Z0-9\s]+\|/g, '');							// front "|" and blank

		if (vscode.workspace.workspaceFolders) {
			if (dest.match(/^(!include )/g)) {
				dest = dest.replace(/^(!include )/g, '');
			}

			dest = vscode.workspace.workspaceFolders[0].uri.fsPath + '/' + dest;
			if (fs.existsSync(dest)) {
				return new vscode.Location(vscode.Uri.file(dest), new vscode.Position(0, 0));
			}
		}
	}
}

/*
*/
class Edk2DecProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		// check destination file.
		let dest = document.lineAt(position).text.replace(/#.*/g, '')	// comments
			.replace(/^\s*/g, '')										// front blank	
			.replace(/[\s\{\}]*$/g, '')									// tail "{", "}"" and blank
			.replace(/[a-zA-Z0-9\s]+\|/g, '');							// front "|" and blank
		if (!dest.substring(dest.length - 2).match('.h')) {
			return;
		}

		//
		// TO-DO: Should parse DEC only once when opening *.dec.
		//
		let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9\.]*$/g, '');
		// console.log(parent_path);

		let directory = [parent_path + dest];
		for (let i = 0; i < document.lineCount; i++) {
			let content = document.lineAt(i).text.trim();
			if (content.match('\\[Includes\\]')) {
				for (i += 1; i < document.lineCount; i++) {
					let folder = document.lineAt(i).text.trim();
					if (folder.length === 0) {
						continue;
					} else if (folder[0].match('\\[')) {
						i = document.lineCount; // as break;
					} else {
						directory.push(parent_path + folder + '/' + dest);
					}
				}
			}
		}

		
		for (let iterator of directory) {
			if (fs.existsSync(iterator)) {
				return new vscode.Location(vscode.Uri.file(iterator), new vscode.Position(0, 0));
			}
		}
	}
}

/*
*/
class Edk2InfProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		let dest = Common.removeHashTagComment(document.lineAt(position).text);
		let associate_c_files: Array<string> = [];
		let associate_dec_files: Array<string> = [];

		// Parse dec/c files
		for (let i = 0; i < document.lineCount; i++) {
			let line = Common.removeHashTagComment(document.lineAt(i).text.toUpperCase());
			if (line.match(/\[SOURCES[a-zA-Z\.]*\]/g)) {
				i = Common.pushMatchContent(document, i + 1, document.lineCount, associate_c_files);
			} else if (line.match(/\[PACKAGES[a-zA-Z\.]*\]/g)) {
				i = Common.pushMatchContent(document, i + 1, document.lineCount, associate_dec_files);
			}
		}

		// console.log(dest, dest.match(/^[a-zA-Z0-9_\/]+\.[a-zA-Z0-9]+$/g));
		if (dest.match(/^[a-zA-Z0-9_\-\/]+\.[a-zA-Z0-9_\-]+$/g)) {
			// format: ****.***

			let file_extension = dest.replace(/^[a-zA-Z0-9_\-\/]+/g, '');
			// console.log('extension ' + file_extension);
			if (file_extension.match('.dec')) {
				//
				// dec
				//
				if (vscode.workspace.workspaceFolders) {
					let root_path = vscode.workspace.workspaceFolders[0].uri.fsPath + '/';
					if (fs.existsSync(root_path + dest)) {
						return new vscode.Location(vscode.Uri.file(root_path + dest), new vscode.Position(0, 0));
					}
				}
			} else {

				let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9_\-\.]*$/g, '');
				// console.log(parent_path+dest);
				if (fs.existsSync(parent_path + dest)) {
					//
					// source code
					//
					return new vscode.Location(vscode.Uri.file(parent_path + dest), new vscode.Position(0, 0));
				} else {
					//
					// pcd
					//
					if (associate_dec_files.length > 0 && vscode.workspace.workspaceFolders) {
						let root_path = vscode.workspace.workspaceFolders[0].uri.fsPath + '/';

						return Common.searchPatternInFiles(associate_dec_files, root_path, dest);
					}
				}
			}
		} else {
			let keywords = ['ENTRY_POINT', 'UNLOAD_IMAGE', 'CONSTRUCTOR', 'DESTRUCTOR'];
			let table = dest.replace(/\s|(AND)/g, '').split('=');

			if (table.length === 1 && table[0].substring(table[0].length - 4, table[0].length).match('Guid')) {
				//
				// Guid
				//

				// Only support Protocols and Guids section
				let supportable = false;
				for (let i = position.line; i > 0; i--) {
					let line = Common.removeHashTagComment(document.lineAt(i).text.toUpperCase());
					if (line[0] === '[') {
						if (line.match(/\[PROTOCOLS[a-zA-Z\.]*\]/g) ||
							line.match(/\[GUIDS[a-zA-Z\.]*\]/g) ||
							line.match(/\[PPIS[a-zA-Z\.]*\]/g) ||
							line.match(/\[DEPEX[a-zA-Z\.]*\]/g)) {

							supportable = true;
						}
						break;
					}
				}
				if (supportable && associate_dec_files.length > 0 && vscode.workspace.workspaceFolders) {
					let root_path = vscode.workspace.workspaceFolders[0].uri.fsPath + '/';
					
					return Common.searchPatternInFiles(associate_dec_files, root_path, table[0]);
				}
			} else if (table.length === 2 && associate_c_files.length > 0 && keywords.includes(table[0])) {
				//
				// Jump to C function. 
				//

				// table[0] = keywords, table[1] = function name;
				let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9\.]*$/g, '');
				// console.log(parent_path);
				return Common.searchPatternInFiles(associate_c_files, parent_path, table[1]);
			}
		}
	}
}

/*
	Only support VFR => UNI/H destination function in same folder.
	Only support UTF8. (Some edk2 files is UCS2(UTF16) format and we don't support so far.)
*/
class Edk2VfrProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9\.]*$/g, '');
		let word = document.getText(document.getWordRangeAtPosition(position));
		let string_token_reg = new RegExp('.*' + 'STRING_TOKEN' + '\\s*' + '\\(' + word + '\\)' + '.*');
		let header_file_reg = new RegExp('.*' + '\\#include' + '.*');

		if (document.lineAt(position).text.match(string_token_reg)) {
			let uni_files = fs.readdirSync(parent_path).filter((value, index, array) => value.match(/[\w]+\.uni/g));
			for (let iterator of uni_files) {
				if (!fs.existsSync(parent_path + iterator)) {
					continue;
				}
				let lines = fs.readFileSync(parent_path + iterator, 'utf8').split('\n');
				for (let i = 0; i < lines.length; i++) {
					let strings = lines[i].split(/\s/g);
					if (strings.length >= 2 && strings[1].match(word)) {
						return new vscode.Location(vscode.Uri.file(parent_path + iterator), new vscode.Position(i, 0));
					}
				}
			}
		} else if (document.lineAt(position).text.match(header_file_reg)) {
			let full_path = parent_path + /(?<=\<|\")[\w.\/]*(?=\>|\")/g.exec(document.lineAt(position).text);
			if (fs.existsSync(full_path)) {
				return new vscode.Location(vscode.Uri.file(full_path), new vscode.Position(0, 0));
			}
		}
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "edk2-vscode" is now active!');

	/*
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});

	context.subscriptions.push(disposable);
	*/
	vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_fdf' }, new Edk2FdfProvider());
	vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_dsc' }, new Edk2DscProvider());
	vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_dec' }, new Edk2DecProvider());
	vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_inf' }, new Edk2InfProvider());
	vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_vfr' }, new Edk2VfrProvider());

	context.subscriptions.push(vscode.commands.registerCommand('extension.buildDsc', Common.buildDsc));
}

// this method is called when your extension is deactivated
export function deactivate() { }