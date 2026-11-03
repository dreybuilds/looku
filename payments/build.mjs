import { build } from 'esbuild'
await build({entryPoints:['client.mjs'], outfile:'build/client.js', bundle:true,
  platform:'browser', format:'esm', minify:true, inject:['./buffer.mjs'],
  define:{global:'globalThis'}, legalComments:'eof'})
