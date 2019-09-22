// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as rd from 'readline';

let associate_files:Array<string> = [];

class Edk2FdfProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		let dest = document.lineAt(position).text.replace(/#.*/g, '')		// comments
												.replace(/^\s*/g, '')		// front blank
												.replace(/[\s]*$/g, '');	// tail blank
		// Check INF prefix
		if (dest.match(/^INF[a-zA-Z0-9\s]+/g)) {
			if (vscode.workspace.workspaceFolders) {
				dest = vscode.workspace.workspaceFolders[0].uri.fsPath + '/' + dest.replace(/^INF[\s]+/g, '');
				console.log(dest);
				if (fs.existsSync(dest)) {
					return new vscode.Location(vscode.Uri.file(dest), new vscode.Position(0, 0));
				}
			}
		}
	}
}

class Edk2DscProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {


		let dest = document.lineAt(position).text.replace(/#.*/g, '')				// comments
												.replace(/^\s*/g, '')				// front blank
												.replace(/[\s\{\}]*$/g, '')			// tail "{", "}"" and blank
												.replace(/[a-zA-Z0-9\s]+\|/g, '');	// front "|" and blank
		if (vscode.workspace.workspaceFolders) {
			dest = vscode.workspace.workspaceFolders[0].uri.fsPath + '/' + dest;
			if (fs.existsSync(dest)) {
				return new vscode.Location(vscode.Uri.file(dest), new vscode.Position(0, 0));
			}
		}
	}
}

class Edk2DecProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		// check destination file.
		let dest = document.lineAt(position).text.replace(/#.*/g, '')				// comments
												.replace(/^\s*/g, '')				// front blank	
												.replace(/[\s\{\}]*$/g, '')			// tail "{", "}"" and blank
												.replace(/[a-zA-Z0-9\s]+\|/g, '');	// front "|" and blank
		if (!dest.substring(dest.length-2).match('.h')) {
			return;
		}

		//
		// TO-DO: Should parse DEC only once when opening *.dec.
		//
		let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9\.]*$/g, '');
		// console.log(parent_path);

		let directory = [parent_path + dest];
		for (let i = 0; i <= document.lineCount; i++) {
			let content = document.lineAt(i).text.trim() ;
			if (content.match('\\[Includes\\]')) {
				for (i += 1; i <= document.lineCount; i++) {
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

class Edk2InfProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		// check destination file.
		let dest = document.lineAt(position).text.replace(/#.*/g, '')		// comments
												.replace(/^\s*/g, '')		// front blank
												.replace(/[\s]*$/g, '');	// tail blank	

		// console.log(dest);
		if (dest.match(/[a-zA-Z0-9\s]+\.[a-zA-Z0-9\s]+/g)) {
			let file_extension = dest.replace(/^[a-zA-Z0-9\s\/]+/g, '');
			// console.log('extension ' + file_extension);
			if (file_extension.match('.dec')) {
				if (vscode.workspace.workspaceFolders) {
					let root_path = vscode.workspace.workspaceFolders[0].uri.fsPath + '/';
					if (fs.existsSync(root_path+dest)) {
						return new vscode.Location(vscode.Uri.file(root_path+dest), new vscode.Position(0, 0));
					}
				}
			} else {
				let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9\.]*$/g, '');
				// console.log(parent_path+dest);
				if (fs.existsSync(parent_path + dest)) {
					return new vscode.Location(vscode.Uri.file(parent_path+dest), new vscode.Position(0, 0));
				}
			}
		} else {
			let table = dest.replace(/\s/g, '').split('=');
			
			
			// TO-DO: Jump to C entry point.
			if (table.length === 2 && table[0].match('ENTRY_POINT') && associate_files.length > 0) {
				let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9\.]*$/g, '');
				for (let iterator of associate_files) {
					if (!fs.existsSync(parent_path + iterator)) {
						continue;
					}
					console.log(parent_path + iterator);
					let reader = rd.createInterface(fs.createReadStream(parent_path + iterator));
					let reg = new RegExp('.*' + table[1] + '.*');
					let line = 1;
					let taget = line;
					// console.log(reg);
					reader.on("line", (content: string) => {
						// console.log(l);
						if (content.match(reg)) {
							console.log('match!!!', content, parent_path + iterator);
							//TODO...
							return new vscode.Location(vscode.Uri.file(parent_path + iterator), new vscode.Position(line, 0));
						}
						line++;
					});
					reader.on("close", () => {
						console.log('close!!', line);
						
					});
					
				}
			}

		}
	}
}

function openFileHandler (file: vscode.TextDocument) {
	associate_files = [];

	let file_extension = file.uri.fsPath.substring(file.uri.fsPath.length-4);
	if (file_extension.match('.inf')) {
		
		for (let i = 0; i <= file.lineCount; i++) {
			if (file.lineAt(i).text === '[Sources]') {
				while (++i <= file.lineCount && file.lineAt(i).text[0] !== '[') {
					let content = file.lineAt(i).text.trim();
					if (content.length > 0) {
						associate_files.push(content);
					}
				}
				break;
			}
		}
		
	}

	// console.log(associate_files);
	return;
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
	vscode.languages.registerDefinitionProvider({scheme: 'file', language: 'edk2_fdf'}, new Edk2FdfProvider());
	vscode.languages.registerDefinitionProvider({scheme: 'file', language: 'edk2_dsc'}, new Edk2DscProvider());
	vscode.languages.registerDefinitionProvider({scheme: 'file', language: 'edk2_dec'}, new Edk2DecProvider());
	vscode.languages.registerDefinitionProvider({scheme: 'file', language: 'edk2_inf'}, new Edk2InfProvider());
	vscode.workspace.onDidOpenTextDocument((file) => {openFileHandler(file);});

	// vscode.workspace.registerTextDocumentContentProvider({scheme: 'file', language: 'edk2_inf'}, new Edk2InfOpenProvider());
	
}

// this method is called when your extension is deactivated
export function deactivate() {}