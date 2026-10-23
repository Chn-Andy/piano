import { defineConfig } from 'vite'

// publicDir 指向仓库 assets/：采样等静态资源以 /samples/... 路径提供，
// dev 与 build 产物路径一致。
// base './'（工单 07）：产物不绑死部署根——GitHub Pages 项目页
// （https://用户名.github.io/仓库名/ 的子路径）与 itch.io HTML5 包（iframe
// 内相对根）都能直接静态托管，一份产物两处上架（ADR-0009）。运行时资源
// 引用一律经 import.meta.env.BASE_URL 拼接（见 src/audio/piano.ts），
// 不出现第二套路径逻辑。
export default defineConfig({
  base: './',
  publicDir: 'assets',
})
