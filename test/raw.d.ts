/** Vite's `?raw` suffix: the file's contents as a string, without `node:fs` (see verification.test.ts). */
declare module '*?raw' {
	const content: string;
	export default content;
}
