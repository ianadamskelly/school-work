import {build} from 'esbuild';
const file=process.argv[2];if(!file||!/^tests\/[a-z-]+\.test\.mjs$/.test(file))throw Error('Pass a tests/*.test.mjs path.');
const result=await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',write:false});
await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
