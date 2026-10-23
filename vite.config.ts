import { defineConfig } from 'vite'

// publicDir 指向仓库 assets/：采样等静态资源以 /samples/... 路径提供，
// dev 与 build 产物路径一致。
export default defineConfig({
  publicDir: 'assets',
})
