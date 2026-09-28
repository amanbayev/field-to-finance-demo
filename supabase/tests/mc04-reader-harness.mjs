// Run the production TS reader/consumer against native SQL without HTTP or credentials.
// Only the transport factory is replaced; mapper and services are loaded unchanged.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function nativeReader(rpc) {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const require = createRequire(join(repo, 'package.json'));
  const ts = require('typescript');
  const cache = new Map();
  function load(filename) {
    if (filename.endsWith('.json')) return JSON.parse(readFileSync(filename, 'utf8'));
    if (!filename.endsWith('.ts')) filename = existsSync(filename + '.ts') ? filename + '.ts' : join(filename, 'index.ts');
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const localRequire = id => {
      if (id === '@/lib/auth/supabase/server') return { createServerSupabaseClient: async () => ({ rpc }) };
      if (id === '@/lib/auth/env') return { isAuthConfigured: () => true };
      if (id.startsWith('@/')) return load(join(repo, 'src', id.slice(2)));
      if (id.startsWith('.')) return load(resolve(dirname(filename), id));
      return require(id);
    };
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function('require', 'module', 'exports', code)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return {
    ...load(join(repo, 'src/services/secondary-market-repository.ts')),
    ...load(join(repo, 'src/services/secondary-market-service.ts')),
  };
}
