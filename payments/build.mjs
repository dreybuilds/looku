import { build } from 'esbuild'
await build({entryPoints:['client.mjs'], outfile:'build/client.js', bundle:true,
  platform:'browser', format:'esm', minify:true, inject:['./buffer.mjs'],
  define:{global:'globalThis'}, legalComments:'eof'})
await build({entryPoints:['privy-client.mjs'],outfile:'build/privy.js',bundle:true,format:'esm',platform:'browser',
  target:'es2022',minify:true,inject:['./buffer.mjs'],define:{global:'globalThis','process.env.NODE_ENV':'"production"'}})
