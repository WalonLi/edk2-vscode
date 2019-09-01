// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

class Edk2DscProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		/*
		console.log('fileName: ' + document.uri.fsPath);
		console.log('workDir: ' + path.dirname(document.uri.fsPath),);
		console.log('word: ' + document.getText(document.getWordRangeAtPosition(position)));
		console.log('line: ' + document.lineAt(position).text);
		console.log(vscode.workspace.rootPath);
		*/
		let dest = document.lineAt(position).text.replace(new RegExp(/^\s*/g), '')
												.replace(new RegExp(/[\s\{\}]*$/g), '')
												.replace(new RegExp(/[a-zA-Z0-9\s]+\|/g), '');
		dest = vscode.workspace.rootPath + '/' + dest;
		if (fs.existsSync(dest)) {
			return new vscode.Location(vscode.Uri.file(dest), new vscode.Position(0, 0));
		}
	}
}

class Edk2DecProvider implements vscode.DefinitionProvider {
	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
		// check destination file.
		let dest = document.lineAt(position).text.replace(new RegExp(/^\s*/g), '')
												.replace(new RegExp(/[\s\{\}]*$/g), '')
												.replace(new RegExp(/[a-zA-Z0-9\s]+\|/g), '');
		if (!dest.substring(dest.length-2).match('.h')) {
			return;
		}

		//
		// TO-DO: Should parse DEC only once when opening *.dec.
		//
		let parent_path = document.uri.fsPath.replace(/[a-zA-Z0-9.]*$/g, '');
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
	vscode.languages.registerDefinitionProvider({scheme: 'file', language: 'edk2_dsc'}, new Edk2DscProvider());
	vscode.languages.registerDefinitionProvider({scheme: 'file', language: 'edk2_dec'}, new Edk2DecProvider());
}

// this method is called when your extension is deactivated
export function deactivate() {}