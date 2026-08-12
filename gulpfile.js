const path = require('path');
const { task, src, dest, parallel } = require('gulp');

task('build:assets', parallel(copyNodeIcons, copyNodeCodex, copyCredentialIcons));

function copyNodeIcons() {
	const source = path.resolve('nodes', '**', '*.{png,svg}');
	const destination = path.resolve('dist', 'nodes');

	return src(source).pipe(dest(destination));
}

// n8n reads the codex metadata (categories, documentation links) from the `<Node>.node.json`
// next to the compiled node. tsc never emits JSON, so it has to be copied like the icons.
function copyNodeCodex() {
	const source = path.resolve('nodes', '**', '*.node.json');
	const destination = path.resolve('dist', 'nodes');

	return src(source).pipe(dest(destination));
}

function copyCredentialIcons() {
	const source = path.resolve('credentials', '**', '*.{png,svg}');
	const destination = path.resolve('dist', 'credentials');

	return src(source).pipe(dest(destination));
}
