/**
 * PPT 圆角和渐变效果测试
 * 使用 Playwright 生成 PPT 并验证 XML 结构
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '../../..', 'test-output');

// 测试 HTML 包含圆角和渐变
const testHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    .slide {
      width: 960px;
      height: 540px;
      position: relative;
      background: #1e293b;
    }
    .rounded-box {
      position: absolute;
      top: 100px;
      left: 100px;
      width: 200px;
      height: 100px;
      background: #ef4444;
      border-radius: 20px;
    }
    .gradient-box {
      position: absolute;
      top: 100px;
      left: 350px;
      width: 200px;
      height: 100px;
      background: linear-gradient(to bottom, #10b981, #059669);
      border-radius: 10px;
    }
    .circle {
      position: absolute;
      top: 250px;
      left: 100px;
      width: 100px;
      height: 100px;
      background: #f59e0b;
      border-radius: 50px;
    }
  </style>
</head>
<body>
  <div class="slide">
    <div class="rounded-box"></div>
    <div class="gradient-box"></div>
    <div class="circle"></div>
  </div>
</body>
</html>`;

test.describe('PPT 圆角效果测试', () => {
  test('生成 PPT 并验证圆角形状', async ({ page }) => {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 保存测试 HTML 文件
    const htmlFilePath = path.join(outputDir, 'test-roundrect.html');
    fs.writeFileSync(htmlFilePath, testHtml);

    // 访问页面
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 监听下载事件
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

    // 上传 HTML 文件
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(htmlFilePath);

    // 等待预览加载
    await page.waitForTimeout(2000);

    // 调试：获取解析后的幻灯片数据
    const debugInfo = await page.evaluate(async () => {
      // 等待转换器可用
      await new Promise(r => setTimeout(r, 500));

      // 获取 iframe 内容
      const iframe = document.querySelector('#htmlPreviewFrame');
      if (!iframe || !iframe.contentDocument) return { error: 'No iframe' };

      const doc = iframe.contentDocument;
      const elements = doc.querySelectorAll('.rounded-box, .gradient-box, .circle');

      return Array.from(elements).map(el => {
        const style = window.getComputedStyle(el);
        return {
          class: el.className,
          tagName: el.tagName,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderRadius: style.borderRadius,
          width: el.offsetWidth,
          height: el.offsetHeight
        };
      });
    });
    console.log('\n=== 元素样式调试 ===');
    console.log(JSON.stringify(debugInfo, null, 2));

    // 监听浏览器控制台输出
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[DEBUG')) {
        consoleLogs.push(text);
      }
    });

    // 点击转换按钮
    const convertBtn = page.locator('#convertBtn');
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    // 等待下载完成
    const download = await downloadPromise;
    const pptPath = path.join(outputDir, 'roundrect-test.pptx');
    await download.saveAs(pptPath);

    console.log('PPT saved to:', pptPath);
    expect(fs.existsSync(pptPath)).toBe(true);

    // 输出控制台日志
    console.log('\n=== 浏览器控制台调试输出 ===');
    consoleLogs.forEach(log => console.log(log));

    // 解压并分析 XML
    const extractDir = path.join(outputDir, 'pptx-extract');
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    execSync(`unzip -o "${pptPath}" -d "${extractDir}"`, { stdio: 'pipe' });

    // 读取 slide1.xml
    const slideXmlPath = path.join(extractDir, 'ppt/slides/slide1.xml');
    expect(fs.existsSync(slideXmlPath)).toBe(true);

    const slideXml = fs.readFileSync(slideXmlPath, 'utf-8');

    // 输出 XML 用于调试
    console.log('\n=== slide1.xml 形状分析 ===');

    // 验证圆角形状
    const roundRectCount = (slideXml.match(/prst="roundRect"/g) || []).length;
    const rectCount = (slideXml.match(/prst="rect"/g) || []).length;
    const ellipseCount = (slideXml.match(/prst="ellipse"/g) || []).length;
    const picCount = (slideXml.match(/<p:pic>/g) || []).length;

    console.log(`roundRect 数量: ${roundRectCount}`);
    console.log(`rect 数量: ${rectCount}`);
    console.log(`ellipse 数量: ${ellipseCount}`);
    console.log(`图片（渐变）数量: ${picCount}`);

    // 检查 avLst (圆角调整值)
    const avLstMatches = slideXml.match(/<a:avLst>[\s\S]*?<\/a:avLst>/g);
    if (avLstMatches) {
      console.log(`\n圆角调整值 (avLst) 数量: ${avLstMatches.length}`);
      avLstMatches.forEach((match, i) => {
        const gdMatch = match.match(/fmla="val (\d+)"/);
        if (gdMatch) {
          const val = parseInt(gdMatch[1]);
          const percent = (val / 100000 * 100).toFixed(1);
          console.log(`  ${i + 1}: val=${val} (${percent}%)`);
        }
      });
    }

    // 输出完整 XML（用于调试）
    console.log('\n=== slide1.xml 完整内容 ===');
    console.log(slideXml);

    // 预期：
    // - 1 个 roundRect（红色矩形）
    // - 1 个 ellipse（黄色圆形）
    // - 1 个图片（渐变矩形，使用 Canvas 渲染）
    expect(roundRectCount).toBe(1);
    expect(ellipseCount).toBeGreaterThanOrEqual(1);
    expect(picCount).toBe(1); // 渐变以图片形式添加

    // 清理解压目录
    fs.rmSync(extractDir, { recursive: true });
  });
});
