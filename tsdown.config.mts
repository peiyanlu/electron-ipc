import { defineConfig, type UserConfig } from 'tsdown'


const config: UserConfig[] = defineConfig([
  {
    entry: 'src/index.ts',
    format: 'esm',
    outDir: 'dist',
    platform: 'neutral',
  },
  {
    entry: 'src/ElectronBackend.ts',
    format: 'esm',
    outDir: 'dist',
    platform: 'node',
    nodeProtocol: true,
    shims: true,
    fixedExtension: false,
  },
  {
    entry: 'src/ElectronFrontend.ts',
    format: 'esm',
    outDir: 'dist',
    platform: 'browser',
  },
  {
    entry: 'src/ElectronPreload.ts',
    format: 'esm',
    outDir: 'dist',
    platform: 'neutral',
  },
] satisfies UserConfig[])

export default config
