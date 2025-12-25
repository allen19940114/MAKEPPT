/**
 * 视觉测试脚本 - 生成 PPT 并截图查看效果
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TEST_HTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; }
    .slide { width: 1920px; height: 1080px; padding: 60px; box-sizing: border-box; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    h1 { color: white; font-size: 72px; margin-bottom: 40px; }
    p { color: white; font-size: 36px; line-height: 1.6; }
    .icon-box { display: flex; gap: 30px; margin-top: 40px; }
    .icon-item { display: flex; align-items: center; gap: 15px; background: rgba(255,255,255,0.2); padding: 20px 30px; border-radius: 15px; }
    .icon-item svg { width: 48px; height: 48px; fill: white; }
    .icon-item span { color: white; font-size: 24px; }
  </style>
</head>
<body>
  <section class="slide">
    <h1>HTML to PPT 转换测试</h1>
    <p>这是一个包含 SVG 图标的测试幻灯片，用于验证图标是否正确转换为 PPT。</p>
    <div class="icon-box">
      <div class="icon-item">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>任务完成</span>
      </div>
      <div class="icon-item">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>收藏功能</span>
      </div>
      <div class="icon-item">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
        </svg>
        <span>云存储</span>
      </div>
    </div>
  </section>
</body>
</html>
`;

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 访问应用
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');

    // 截图初始状态
    await page.screenshot({ path: 'test-output/01-initial.png', fullPage: true });
    console.log('截图: 初始状态');

    // 粘贴测试 HTML
    const textarea = page.locator('#htmlInput');
    await textarea.fill(TEST_HTML);
    console.log('已输入测试 HTML');

    // 等待预览更新
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-output/02-after-input.png', fullPage: true });
    console.log('截图: 输入后状态');

    // 点击转换按钮
    const convertBtn = page.locator('#convertBtn');
    await convertBtn.click();
    console.log('点击转换按钮');

    // 等待下载
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.waitForTimeout(100)
    ]);

    // 保存 PPT 文件
    const pptPath = 'test-output/test-presentation.pptx';
    await download.saveAs(pptPath);
    console.log('PPT 已保存到:', pptPath);

    // 截图最终状态
    await page.screenshot({ path: 'test-output/03-after-convert.png', fullPage: true });
    console.log('截图: 转换后状态');

    console.log('\n=== 测试完成 ===');
    console.log('PPT 文件已保存到 test-output/test-presentation.pptx');
    console.log('请手动打开 PPT 文件查看效果');

  } catch (error) {
    console.error('测试失败:', error);
    await page.screenshot({ path: 'test-output/error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// 确保输出目录存在
if (!fs.existsSync('test-output')) {
  fs.mkdirSync('test-output');
}

runTest();
