/**
 * 使用用户测试数据进行完整转换测试
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TEST_HTML_PATH = './test_data/SNTP_Strategic_Presentation.html';

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('启动测试...');

    // 读取测试 HTML 文件
    const testHtml = fs.readFileSync(TEST_HTML_PATH, 'utf-8');
    console.log('读取测试文件:', TEST_HTML_PATH);

    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');

    // 输入 HTML
    await page.fill('#htmlInput', testHtml);
    await page.waitForTimeout(1000);

    // 检查图标渲染
    const result = await page.evaluate(async () => {
      const converter = window.app?.converter;
      if (!converter) {
        return { error: 'Converter not found' };
      }

      // 创建 iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px;border:none;';
      document.body.appendChild(iframe);

      await new Promise(resolve => {
        iframe.onload = resolve;
        iframe.src = 'about:blank';
      });

      const iframeDoc = iframe.contentDocument;
      const html = document.getElementById('htmlInput').value;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // 等待字体加载
      await new Promise(r => setTimeout(r, 3000));
      if (iframeDoc.fonts && iframeDoc.fonts.ready) {
        await iframeDoc.fonts.ready;
      }
      await new Promise(r => setTimeout(r, 500));

      // 解析幻灯片
      const slides = converter.htmlParser.extractSlides(iframeDoc);

      // 捕获图标
      await converter.captureFontIcons(slides, iframeDoc);

      // 收集结果
      const results = [];
      function collectResults(elements) {
        for (const el of elements) {
          if (el.type === 'icon' && el.isFontIcon) {
            results.push({
              iconName: el.iconName,
              hasImageData: !!el.iconImageData,
              imageDataType: el.iconImageData ? (el.iconImageData.startsWith('data:image/png') ? 'PNG' : 'SVG') : null,
              imageDataLength: el.iconImageData?.length || 0
            });
          }
          if (el.children) {
            collectResults(el.children);
          }
        }
      }
      for (const slide of slides) {
        collectResults(slide.elements);
      }

      document.body.removeChild(iframe);

      return {
        slideCount: slides.length,
        iconResults: results
      };
    });

    console.log('\n=== 测试结果 ===');
    console.log('幻灯片数量:', result.slideCount);
    console.log('\n图标渲染结果:');

    if (result.iconResults && result.iconResults.length > 0) {
      // 按图标名称分组统计
      const iconStats = {};
      result.iconResults.forEach(icon => {
        if (!iconStats[icon.iconName]) {
          iconStats[icon.iconName] = { success: 0, fail: 0, type: icon.imageDataType };
        }
        if (icon.hasImageData) {
          iconStats[icon.iconName].success++;
          iconStats[icon.iconName].type = icon.imageDataType;
        } else {
          iconStats[icon.iconName].fail++;
        }
      });

      // 输出统计
      Object.entries(iconStats).forEach(([name, stat]) => {
        const status = stat.fail === 0 ? '✓' : (stat.success > 0 ? '⚠' : '✗');
        console.log(`  ${status} ${name}: ${stat.success}/${stat.success + stat.fail} (${stat.type || 'FAILED'})`);
      });

      const successCount = result.iconResults.filter(i => i.hasImageData).length;
      const uniqueIcons = Object.keys(iconStats).length;
      const successfulIcons = Object.values(iconStats).filter(s => s.fail === 0).length;

      console.log(`\n总计: ${successCount}/${result.iconResults.length} 个图标实例成功渲染`);
      console.log(`唯一图标: ${successfulIcons}/${uniqueIcons} 个类型全部成功`);
    } else {
      console.log('  没有检测到图标');
    }

  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    await browser.close();
  }
}

runTest();
