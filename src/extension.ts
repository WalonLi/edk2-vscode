// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';


class Common {
  static removeHashTagComment(line: string): string {
    return line.replace(/#.*/g, '')   // comments
      .replace(/^\s*/g, '')           // front blank
      .replace(/[\s]*$/g, '');        // tail blank
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

  static getRootPath (): string[] {
    if (vscode.workspace.workspaceFolders) {
      let config = vscode.workspace.getConfiguration('edk2-vscode');
      let folder: string[] = [vscode.workspace.workspaceFolders[0].uri.fsPath];
      
      if (config.has('root.extend.path')) {
        let s: string = config.get('root.extend.path') + '';
        s.replace(/\s/g, '').split(',').forEach(function(v) {
          folder.push(vscode.workspace.workspaceFolders![0].uri.fsPath + '/' + v);
        });
      }
      return folder;
    }
    return [];
  }

  static buildDsc (...args: any[]) {
    let os = require('os');
    let config = vscode.workspace.getConfiguration('edk2-vscode');
    let parameter = ' -p ' +
                    args[0].path.substring((os.platform() === 'win32' ? 1 : 0)) +   // windows: \d:\xxxxx ; linux /home/xxxxx
                    ' -t ' +
                    (config.has('build.compiler') ? config.get('build.compiler') : 'VS2015x86') +
                    ' -a ' +
                    (config.has('build.arch') ? config.get('build.arch') : 'X64') +
                    ' -b ' +
                    (config.has('build.target') ? config.get('build.target') : 'DEBUG');
    if (os.platform() === 'win32') {
      vscode.window.terminals[0].sendText('cmd.exe /K \"edksetup.bat & build' + parameter + '\"');
    } else {
      vscode.window.terminals[0].sendText('. edksetup.sh && build' + parameter);
    }
  }

  static goToBuild (...args: any[]) {
    let openExplorer = require('open-file-explorer');
    let os = require('os');
    let config = vscode.workspace.getConfiguration('edk2-vscode');

    if (vscode.workspace.workspaceFolders) {
      let inf = args[0].path.substring((os.platform() === 'win32' ? 1 : 0) + vscode.workspace.workspaceFolders[0].uri.fsPath.length).replace(/.inf$/g, '');
      let dict = vscode.workspace.workspaceFolders[0].uri.fsPath.replace(/\\/g, '/') +
                 '/' +
                 'Build' +
                 '/' +
                 (config.has('build.project') ? config.get('build.project') : 'EmulatorX64') +
                 '/' +
                 (config.has('build.target') ? config.get('build.target') : 'DEBUG') +
                 '_' +
                 (config.has('build.compiler') ? config.get('build.compiler') : 'VS2015x86') +
                 '/';
      let archs = ['IA32', 'X64', 'EBC', 'ARM', 'AARCH64'];
      for (let arch of archs) {
        let full_path = dict + arch + inf;
        if (fs.existsSync(full_path)) {
          // openExplorer only accept '\\' in windows.
          if (os.platform() === 'win32') {
            openExplorer(full_path.replace(/\//g, '\\'), () => {});
          } else {
            openExplorer(full_path, () => {});
          }
          return;
        }
      }
      vscode.window.showInformationMessage('Not found in build - ' + inf);
    }
  }
}

/*
*/
class Edk2FdfDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
    let dest = Common.removeHashTagComment(document.lineAt(position).text);

    // Check INF prefix
    if (dest.match(/^INF[\w\s]+/g)) {
      let folders = Common.getRootPath();
      for (let i = 0; i < folders.length; i++) {
        let full_dest = folders[i] + '/' + dest.replace(/^INF[\s]+/g, '');
        if (fs.existsSync(full_dest)) {
          return new vscode.Location(vscode.Uri.file(full_dest), new vscode.Position(0, 0));
        }
      }
    }
  }
}

/*
*/
class Edk2DscDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {

    let dest = document.lineAt(position).text.replace(/#.*/g, '')   // comments
                       .replace(/^\s*/g, '')                        // front blank
                       .replace(/[\s\{\}]*$/g, '')                  // tail "{", "}"" and blank
                       .replace(/[\w\s]+\|/g, '');                  // front "|" and blank

    if (dest.match(/^(!include )/g)) {
      dest = dest.replace(/^(!include )/g, '');
    }

    // Files
    let folders = Common.getRootPath();
    for (let i = 0; i < folders.length; i++) {
      let full_dest = folders[i] + '/' + dest;
      if (fs.existsSync(full_dest)) {
        return new vscode.Location(vscode.Uri.file(full_dest), new vscode.Position(0, 0));
      }
    }

    // TO-DO: PCDs
    // ...
  }
}

/*
*/
class Edk2DecDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
    // check destination file.
    let dest = document.lineAt(position).text.replace(/#.*/g, '')   // comments
                       .replace(/^\s*/g, '')                        // front blank  
                       .replace(/[\s\{\}]*$/g, '')                  // tail "{", "}"" and blank
                       .replace(/[\w\s]+\|/g, '');                  // front "|" and blank
    if (!dest.substring(dest.length - 2).match('.h')) {
      return;
    }

    //
    // TO-DO: Should parse DEC only once when opening *.dec.
    //
    let parent_path = document.uri.fsPath.replace(/[\w\.]*$/g, '');
    // console.log(parent_path);

    let directory = [parent_path + dest];
    for (let i = 0; i < document.lineCount; i++) {
      let content = document.lineAt(i).text.trim();
      if (content.match(/\[Includes\]/)) {
        for (i += 1; i < document.lineCount; i++) {
          let folder = document.lineAt(i).text.trim();
          if (folder.length === 0) {
            continue;
          } else if (folder[0].match(/\[/)) {
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
class Edk2InfDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
    let dest = Common.removeHashTagComment(document.lineAt(position).text);
    let associate_c_files: Array<string> = [];
    let associate_dec_files: Array<string> = [];

    // Parse dec/c files
    for (let i = 0; i < document.lineCount; i++) {
      let line = Common.removeHashTagComment(document.lineAt(i).text.toUpperCase());
      if (line.match(/\[SOURCES[\w\.]*\]/g)) {
        i = Common.pushMatchContent(document, i + 1, document.lineCount, associate_c_files);
      } else if (line.match(/\[PACKAGES[\w\.]*\]/g)) {
        i = Common.pushMatchContent(document, i + 1, document.lineCount, associate_dec_files);
      }
    }

    // console.log(dest, dest.match(/^[a-zA-Z0-9_\/]+\.[a-zA-Z0-9]+$/g));
    if (dest.match(/^[\w\-\/]+\.[\w\-]+$/g)) {
      // format: ****.***

      let file_extension = dest.replace(/^[\w\-\/]+/g, '');
      // console.log('extension ' + file_extension);
      if (file_extension.match('.dec')) {
        //
        // dec
        //
        let folders = Common.getRootPath();
        for (let i = 0; i < folders.length; i++) {
          let root_path = folders[i] + '/';
          if (fs.existsSync(root_path + dest)) {
            return new vscode.Location(vscode.Uri.file(root_path + dest), new vscode.Position(0, 0));
          }
        }
      } else {

        let parent_path = document.uri.fsPath.replace(/[\w\-\.]*$/g, '');
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
          if (associate_dec_files.length > 0) {
            let folders = Common.getRootPath();
            for (let i = 0; i < folders.length; i++) {
              let root_path = folders[i] + '/';
              let result = Common.searchPatternInFiles(associate_dec_files, root_path, dest);
              if (result) return result;
            }
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

        // Only support Protocols, Ppis, Guids and Depex section
        let supportable = false;
        for (let i = position.line; i > 0; i--) {
          let line = Common.removeHashTagComment(document.lineAt(i).text.toUpperCase());
          if (line[0] === '[') {
            if (line.match(/\[PROTOCOLS[\w\.]*\]/g) ||
              line.match(/\[GUIDS[\w\.]*\]/g) ||
              line.match(/\[PPIS[\w\.]*\]/g) ||
              line.match(/\[DEPEX[\w\.]*\]/g)) {

              supportable = true;
            }
            break;
          }
        }
        if (supportable && associate_dec_files.length > 0) {
          let folders = Common.getRootPath();
          for (let i = 0; i < folders.length; i++) {
            let root_path = folders[i] + '/';
            let result = Common.searchPatternInFiles(associate_dec_files, root_path, table[0]);
            if (result) return result;
          }
        }
      } else if (table.length === 2 && associate_c_files.length > 0 && keywords.includes(table[0])) {
        //
        // Jump to C function. 
        //

        // table[0] = keywords, table[1] = function name;
        let parent_path = document.uri.fsPath.replace(/[\w\.]*$/g, '');
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
class Edk2VfrDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {
    let parent_path = document.uri.fsPath.replace(/[\w\.]*$/g, '');
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

/*
*/
class Edk2DscSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {

    let keywords = new Map <string, vscode.SymbolKind>([
      ['Pcd', vscode.SymbolKind.Variable],
      ['Component', vscode.SymbolKind.File],
      ['Library', vscode.SymbolKind.Package]
    ]);

    return new Promise((resolve, reject) => {
      let symbols: vscode.DocumentSymbol[] = [];
      let nodes = [symbols];

      for (let i = 0; i < document.lineCount; i++) {
        let keyword_line = document.lineAt(i);
        let keyword_text = Common.removeHashTagComment(keyword_line.text);

        let m = '';
        keywords.forEach((v, k) => {if (keyword_text.includes(k)) m = k;});
        if (m.length && keyword_text.match(/\[[\s\w.,]+\]/g)) {
          let j;
          let keyword_symbol = new vscode.DocumentSymbol(keyword_text, '', vscode.SymbolKind.Class, keyword_line.range, keyword_line.range);
          
          nodes[nodes.length-1].push(keyword_symbol);
          nodes.push(keyword_symbol.children);

          let brace = false;
          let element_line = keyword_line;
          let pre_element_range_end = element_line.range.end;
          for (j = i + 1; j < document.lineCount; j++, pre_element_range_end = element_line.range.end) {
            element_line = document.lineAt(j);
            let element_text = Common.removeHashTagComment(element_line.text).replace(/\|.*/g, '');

            // skip empty line and control symbol
            if (element_text.length === 0 || element_text[0] === '!') {
              continue;
            }

            // brace inside.
            if (element_text[0] === '}') {
              brace = false;
              continue;
            } else if (brace) {
              continue;
            }
            if (element_text[element_text.length - 1] === '{') {
              brace = true;
            }

            // next keyword!
            if (element_text[0] === '[') {
              break;
            }
            
            let symbol = new vscode.DocumentSymbol(element_text, '', keywords.get(m)!, element_line.range, element_line.range);
            nodes[nodes.length-1].push(symbol);
          }

          keyword_symbol.range = new vscode.Range(keyword_symbol.range.start, pre_element_range_end);
          nodes.pop();
          i = j - 1;
        }
      }
      resolve(symbols);
    });
  }
}

/*
*/
class Edk2DecSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {

    let keywords = new Map <string, vscode.SymbolKind>([
      ['Pcd', vscode.SymbolKind.Variable],
      ['Library', vscode.SymbolKind.Package],
      ['Guids', vscode.SymbolKind.Interface],
      ['Ppis', vscode.SymbolKind.Interface],
      ['Protocols', vscode.SymbolKind.Interface],
    ]);

    return new Promise((resolve, reject) => {
      let symbols: vscode.DocumentSymbol[] = [];
      let nodes = [symbols];

      for (let i = 0; i < document.lineCount; i++) {
        let keyword_line = document.lineAt(i);
        let keyword_text = Common.removeHashTagComment(keyword_line.text);

        let m = '';
        keywords.forEach((v, k) => {if (keyword_text.includes(k)) m = k;});
        if (m.length && keyword_text.match(/\[[\s\w.,]+\]/g)) {
          let j;
          let keyword_symbol = new vscode.DocumentSymbol(keyword_text, '', vscode.SymbolKind.Class, keyword_line.range, keyword_line.range);
          
          nodes[nodes.length-1].push(keyword_symbol);
          nodes.push(keyword_symbol.children);

          let element_line = keyword_line;
          let pre_element_range_end = element_line.range.end;
          for (j = i + 1; j < document.lineCount; j++, pre_element_range_end = element_line.range.end) {
            element_line = document.lineAt(j);
            let element_text = Common.removeHashTagComment(element_line.text).replace(/\|.*/g, '').replace(/\=.*/g, '');

            // skip empty line
            if (element_text.length === 0) {
              continue;
            }

            // next keyword!
            if (element_text[0] === '[') {
              break;
            }

            let symbol = new vscode.DocumentSymbol(element_text, '', keywords.get(m)!, element_line.range, element_line.range);
            nodes[nodes.length-1].push(symbol);
          }

          keyword_symbol.range = new vscode.Range(keyword_symbol.range.start, pre_element_range_end);
          nodes.pop();
          i = j - 1;
        }
      }
      resolve(symbols);
    });
  }
}

/*
*/
class Edk2InfSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {

    let keywords = new Map <string, vscode.SymbolKind>([
      ['Sources', vscode.SymbolKind.File],
      ['Packages', vscode.SymbolKind.File],
      ['Pcd', vscode.SymbolKind.Variable],
      ['Library', vscode.SymbolKind.Package],
      ['Protocol', vscode.SymbolKind.Interface],
      ['Ppi', vscode.SymbolKind.Interface],
      ['Guid', vscode.SymbolKind.Interface],
      ['Depex', vscode.SymbolKind.Operator],
    ]);

    return new Promise((resolve, reject) => {
      let symbols: vscode.DocumentSymbol[] = [];
      let nodes = [symbols];

      for (let i = 0; i < document.lineCount; i++) {
        let keyword_line = document.lineAt(i);
        let keyword_text = Common.removeHashTagComment(keyword_line.text);

        let m = '';
        keywords.forEach((v, k) => {if (keyword_text.includes(k)) m = k;});
        if (m.length && keyword_text.match(/\[[\s\w.,]+\]/g)) {
          let j;
          let keyword_symbol = new vscode.DocumentSymbol(keyword_text, '', vscode.SymbolKind.Class, keyword_line.range, keyword_line.range);
          
          nodes[nodes.length-1].push(keyword_symbol);
          nodes.push(keyword_symbol.children);

          let brace = false;
          let element_line = keyword_line;
          let pre_element_range_end = element_line.range.end;
          for (j = i + 1; j < document.lineCount; j++, pre_element_range_end = element_line.range.end) {
            element_line = document.lineAt(j);
            let element_text = Common.removeHashTagComment(element_line.text).replace(/AND.*/g, '');

            // skip empty line and control symbol
            if (element_text.length === 0 || element_text[0] === '!') {
              continue;
            }

            // brace inside.
            if (element_text[0] === '}') {
              brace = false;
              continue;
            } else if (brace) {
              continue;
            }
            if (element_text[element_text.length - 1] === '{') {
              brace = true;
            }

            // next keyword!
            if (element_text[0] === '[') {
              break;
            }
            
            let symbol = new vscode.DocumentSymbol(element_text, '', keywords.get(m)!, element_line.range, element_line.range);
            nodes[nodes.length-1].push(symbol);
          }

          keyword_symbol.range = new vscode.Range(keyword_symbol.range.start, pre_element_range_end);
          nodes.pop();
          i = j - 1;
        }
      }
      resolve(symbols);
    });
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
  vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_fdf' }, new Edk2FdfDefinitionProvider());
  vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_dsc' }, new Edk2DscDefinitionProvider());
  vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_dec' }, new Edk2DecDefinitionProvider());
  vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_inf' }, new Edk2InfDefinitionProvider());
  vscode.languages.registerDefinitionProvider({ scheme: 'file', language: 'edk2_vfr' }, new Edk2VfrDefinitionProvider());

  vscode.languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'edk2_dsc' }, new Edk2DscSymbolProvider());
  vscode.languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'edk2_dec' }, new Edk2DecSymbolProvider());
  vscode.languages.registerDocumentSymbolProvider({ scheme: 'file', language: 'edk2_inf' }, new Edk2InfSymbolProvider());

  context.subscriptions.push(vscode.commands.registerCommand('extension.buildDsc', Common.buildDsc));
  context.subscriptions.push(vscode.commands.registerCommand('extension.goToBuild', Common.goToBuild));
}

// this method is called when your extension is deactivated
export function deactivate() { }