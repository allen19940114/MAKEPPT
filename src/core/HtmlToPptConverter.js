/**
 * HTML to PPT 转换器主类
 * 整合所有模块，提供统一的转换接口
 */

import { HtmlParser } from './HtmlParser.js';
import { PptGenerator } from './PptGenerator.js';
import { StyleConverter } from './StyleConverter.js';
import { AnimationConverter } from './AnimationConverter.js';

export class HtmlToPptConverter {
  constructor(options = {}) {
    this.options = {
      slideWidth: 10,
      slideHeight: 7.5,
      defaultFontFace: 'Microsoft YaHei',
      defaultFontSize: 18,
      preserveAnimations: true,
      ...options
    };

    this.htmlParser = new HtmlParser();
    this.styleConverter = new StyleConverter();
    this.animationConverter = new AnimationConverter();
    this.pptGenerator = new PptGenerator(this.options);
  }

  /**
   * 从 HTML 字符串转换为 PPT
   * @param {string} htmlString - HTML 内容
   * @param {Object} options - 转换选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async convertFromHtml(htmlString, options = {}) {
    // 解析 HTML
    const slides = this.parseHtml(htmlString);

    // 生成 PPT
    return await this.generatePpt(slides, options);
  }

  /**
   * 从 HTML 文件转换为 PPT
   * @param {File} file - HTML 文件
   * @param {Object} options - 转换选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async convertFromFile(file, options = {}) {
    const htmlString = await this.readFile(file);
    return await this.convertFromHtml(htmlString, options);
  }

  /**
   * 读取文件内容
   * @param {File} file - 文件对象
   * @returns {Promise<string>} 文件内容
   */
  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  /**
   * 解析 HTML 并提取幻灯片
   * @param {string} htmlString - HTML 内容
   * @returns {Array<SlideData>} 幻灯片数据
   */
  parseHtml(htmlString) {
    return this.htmlParser.extractSlides(htmlString);
  }

  /**
   * 渲染 HTML 并获取计算后的样式
   * 这个方法需要在浏览器环境中使用 iframe 进行渲染
   * @param {string} htmlString - HTML 内容
   * @returns {Promise<Array<SlideData>>} 带有计算样式的幻灯片数据
   */
  async renderAndParse(htmlString) {
    return new Promise((resolve) => {
      // 创建隐藏的 iframe 来渲染 HTML
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px;border:none;';
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          iframeDoc.open();
          iframeDoc.write(htmlString);
          iframeDoc.close();

          // 等待样式加载
          setTimeout(() => {
            const slides = this.htmlParser.extractSlides(iframeDoc);

            // 更新容器尺寸
            this.pptGenerator.setContainerSize(
              iframe.contentWindow.innerWidth,
              iframe.contentWindow.innerHeight
            );

            document.body.removeChild(iframe);
            resolve(slides);
          }, 100);
        } catch (error) {
          document.body.removeChild(iframe);
          // 回退到直接解析
          resolve(this.parseHtml(htmlString));
        }
      };

      // 触发加载
      iframe.src = 'about:blank';
    });
  }

  /**
   * 生成 PPT
   * @param {Array<SlideData>} slides - 幻灯片数据
   * @param {Object} options - 生成选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async generatePpt(slides, options = {}) {
    const metadata = {
      title: options.title || 'Converted Presentation',
      author: options.author || 'HTML to PPT Converter',
      subject: options.subject || '',
      company: options.company || ''
    };

    const onProgress = options.onProgress || (() => {});
    const total = slides.length;

    this.pptGenerator.initPresentation(metadata);

    // 逐页生成并报告进度
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      onProgress(i + 1, total, `正在处理第 ${i + 1}/${total} 页: ${slide.title || 'Untitled'}`);

      // 添加幻灯片
      this.pptGenerator.addSlide(slide);

      // 让出线程，更新 UI
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    onProgress(total, total, '正在生成 PPT 文件...');

    return await this.pptGenerator.exportToBlob();
  }

  /**
   * 完整的转换流程：渲染 HTML，解析样式，生成 PPT
   * @param {string} htmlString - HTML 内容
   * @param {Object} options - 选项
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async convert(htmlString, options = {}) {
    // 在浏览器环境中渲染并解析
    const slides = await this.renderAndParse(htmlString);

    // 生成 PPT
    return await this.generatePpt(slides, options);
  }

  /**
   * 转换并下载
   * @param {string} htmlString - HTML 内容
   * @param {string} filename - 文件名
   * @param {Object} options - 选项
   */
  async convertAndDownload(htmlString, filename = 'presentation.pptx', options = {}) {
    const blob = await this.convert(htmlString, options);
    this.downloadBlob(blob, filename);
  }

  /**
   * 下载 Blob 文件
   * @param {Blob} blob - 文件 Blob
   * @param {string} filename - 文件名
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 获取预览数据（幻灯片缩略图信息）
   * @param {string} htmlString - HTML 内容
   * @returns {Array<Object>} 预览数据
   */
  getPreviewData(htmlString) {
    const slides = this.parseHtml(htmlString);

    return slides.map((slide, index) => ({
      index,
      title: slide.title || `Slide ${index + 1}`,
      elementCount: slide.elements.length,
      hasBackground: !!slide.background?.color || !!slide.background?.gradient,
      preview: this.generateSlidePreview(slide)
    }));
  }

  /**
   * 生成幻灯片预览 HTML
   * @param {SlideData} slide - 幻灯片数据
   * @returns {string} 预览 HTML
   */
  generateSlidePreview(slide) {
    const bgStyle = this.getBackgroundStyle(slide.background);

    let elementsHtml = '';
    for (const element of slide.elements.slice(0, 5)) { // 只显示前 5 个元素
      if (element.text) {
        elementsHtml += `<div class="preview-element">${element.text.substring(0, 50)}...</div>`;
      }
    }

    return `
      <div class="slide-preview" style="${bgStyle}">
        <div class="slide-title">${slide.title || 'Untitled'}</div>
        <div class="slide-elements">${elementsHtml}</div>
      </div>
    `;
  }

  /**
   * 获取背景样式字符串
   * @param {BackgroundData} background - 背景数据
   * @returns {string} CSS 样式字符串
   */
  getBackgroundStyle(background) {
    if (!background) return 'background-color: #ffffff;';

    if (background.gradient) {
      return `background: linear-gradient(${background.gradient.value});`;
    }

    if (background.color) {
      return `background-color: ${background.color};`;
    }

    return 'background-color: #ffffff;';
  }
}

export default HtmlToPptConverter;
