import * as fs from 'fs';
import * as path from 'path';
import Mocha = require('mocha');

// Recursively collect every *.test.js file under dir.
function findTestFiles(dir: string): string[] {
	return fs.readdirSync(dir).reduce<string[]>((files, name) => {
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) {
			return files.concat(findTestFiles(full));
		}
		return name.endsWith('.test.js') ? files.concat(full) : files;
	}, []);
}

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		try {
			// Add files to the test suite
			findTestFiles(testsRoot).forEach(f => mocha.addFile(f));

			// Run the mocha test
			mocha.run(failures => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			e(err);
		}
	});
}
