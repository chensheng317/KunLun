/**
 * 获取 public 目录下静态资源的完整 URL
 *
 * NOTE: GitHub Pages 部署在子路径 /KunLun/ 下，
 *       直接用 "/logo.png" 会解析到根域名导致 404。
 *       通过 Vite 的 BASE_URL 自动拼接正确前缀：
 *       - 本地开发：BASE_URL = "/" → "/logo.png"
 *       - 生产环境：BASE_URL = "/KunLun/" → "/KunLun/logo.png"
 *
 * @param path 静态资源路径，如 "/logo.png" 或 "/stream/1.jpg"
 * @returns 拼接 base 后的完整路径
 */
export function assetUrl(path: string): string {
    const base = import.meta.env.BASE_URL || '/';
    // 移除 path 开头的 /，避免双斜杠
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${base}${cleanPath}`;
}
