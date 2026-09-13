# Third-party notices

NovaPull 自身以 MIT 许可证发布，运行时通过独立进程调用以下第三方可执行文件。

## yt-dlp

- 项目主页：https://github.com/yt-dlp/yt-dlp
- 源码许可：Unlicense
- 官方发布的 `yt-dlp.exe` 内含 GPLv3+ 组件，请以上游发布说明为准。
- 随包文件：`resources/bin/YT-DLP-LICENSE.txt`

## FFmpeg / FFprobe

- 项目主页：https://ffmpeg.org
- 本项目 CI 使用 gyan.dev 的 `ffmpeg-release-essentials` 构建，该构建为 **GPLv3**（含 libx264 等 GPL 组件）。
- 随包文件：`resources/bin/FFMPEG-LICENSE.txt`
- 依据 GPL 要求，分发方需同时提供该二进制对应版本的完整源码或书面获取承诺。上游源码与构建脚本见 https://www.gyan.dev/ffmpeg/builds/ 与 https://git.ffmpeg.org/ffmpeg.git

## Deno

- 项目主页：https://deno.com
- 源码许可：MIT
- 用途：yt-dlp 需要一个 JavaScript 引擎来求解 YouTube 的 `n` 参数挑战（该参数由 YouTube 自己的播放器脚本计算）。缺少它时 YouTube 解析会失败，其余站点不受影响。
- 本项目 CI 使用官方 `deno-x86_64-pc-windows-msvc.zip`，并校验官方 `.sha256sum`。
- 随包文件：`resources/bin/DENO-LICENSE.txt`

## 确切版本与对应源码

每个发布的安装包都附带 `resources/bin/BUNDLED-VERSIONS.txt`，由 CI 在构建时直接调用随包的可执行文件生成，记录该安装包里 yt-dlp、FFmpeg / FFprobe、Deno 的**确切版本**。

依据 GPLv3 第 6 条，随包 GPL 组件对应版本的完整源码可按该文件中的版本号从以下位置获取：

- **yt-dlp**：https://github.com/yt-dlp/yt-dlp/releases —— 选择与版本号一致的 tag，其中含该版本的完整源码
- **FFmpeg**：https://git.ffmpeg.org/ffmpeg.git —— 检出版本号对应的 release 分支或 tag；gyan.dev 的构建配置与所含外部库清单见 https://www.gyan.dev/ffmpeg/builds/
- **Deno**（MIT，非 GPL，列出以便核对）：https://github.com/denoland/deno/releases

如上述位置无法取得对应源码，可在本仓库提交 issue 索取，我们会在合理期限内提供。

## 说明

- 这些可执行文件不与 NovaPull 静态链接，而是作为独立进程被调用；NovaPull 本体仍为 MIT。
- 若自行替换为 LGPL 构建（例如 `ffmpeg-release-lgpl`），请同步更新本文件与随包许可证。
- CI 会校验 yt-dlp 的官方 SHA2-256SUMS 与 Deno 的官方 `.sha256sum`，并在上游提供 `.sha256` 时校验 FFmpeg 压缩包；发布前请核对构建日志中打印的哈希值。
