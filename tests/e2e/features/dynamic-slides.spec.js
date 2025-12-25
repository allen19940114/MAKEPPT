/**
 * 动态幻灯片识别测试
 * 验证 SAP_PPM_Presentation.html (20页动态渲染) 能正确识别
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../../..', 'test_data');
const outputDir = path.join(__dirname, '../../..', 'test-output');

test.describe('动态幻灯片识别测试', () => {
  test('SAP_PPM_Presentation.html 应识别 20 页幻灯片', async ({ page }) => {
    // 确保测试文件存在
    const htmlFilePath = path.join(testDataDir, 'SAP_PPM_Presentation.html');
    expect(fs.existsSync(htmlFilePath)).toBe(true);

    // 访问主页
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 收集控制台日志
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('[DEBUG]')) {
        console.log('[Browser]', text);
      }
    });

    // 上传 HTML 文件
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(htmlFilePath);

    // 等待预览加载 - 动态幻灯片需要更长时间
    await page.waitForTimeout(5000);

    // 监听下载事件
    const downloadPromise = page.waitForEvent('download', { timeout: 180000 });

    // 点击转换按钮
    const convertBtn = page.locator('#convertBtn');
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    // 等待下载完成 - 20页需要较长时间
    const download = await downloadPromise;

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const pptPath = path.join(outputDir, 'sap-ppm-test.pptx');
    await download.saveAs(pptPath);

    console.log('\nPPT saved to:', pptPath);
    expect(fs.existsSync(pptPath)).toBe(true);

    // 输出控制台日志中的 DEBUG 信息
    console.log('\n=== 浏览器控制台 DEBUG 日志 ===');
    consoleLogs.filter(log => log.includes('[DEBUG]')).forEach(log => console.log(log));

    // 解压并验证幻灯片数量
    const extractDir = path.join(outputDir, 'sap-ppm-extract');

    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    execSync(`unzip -o "${pptPath}" -d "${extractDir}"`, { stdio: 'pipe' });

    // 计算幻灯片数量
    const slidesDir = path.join(extractDir, 'ppt/slides');
    const slideFiles = fs.readdirSync(slidesDir).filter(f => f.match(/^slide\d+\.xml$/));

    console.log(`\n=== PPT 幻灯片数量: ${slideFiles.length} ===`);
    console.log('幻灯片文件:', slideFiles.join(', '));

    // 验证生成了 20 页幻灯片
    expect(slideFiles.length).toBe(20);

    // 清理
    fs.rmSync(extractDir, { recursive: true });
  });
});
