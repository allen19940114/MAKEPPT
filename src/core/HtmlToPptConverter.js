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
      aspectRatio: '16:9',
      defaultFontFace: 'Arial',
      defaultFontSize: 18,
      preserveAnimations: true,
      ...options
    };

    this.htmlParser = new HtmlParser();
    this.styleConverter = new StyleConverter();
    this.animationConverter = new AnimationConverter();
    this.pptGenerator = null; // 延迟初始化，等待 aspectRatio 选项
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
   * @param {Object} options - 选项（包含 aspectRatio）
   * @returns {Promise<Array<SlideData>>} 带有计算样式的幻灯片数据
   */
  async renderAndParse(htmlString, options = {}) {
    // 首先尝试从 HTML 字符串中直接解析 slides 数组（更可靠）
    const parsedSlidesData = this.parseSlidesArrayFromHtml(htmlString);

    return new Promise((resolve) => {
      // 创建隐藏的 iframe 来渲染 HTML
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px;border:none;';
      document.body.appendChild(iframe);

      iframe.onload = async () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          iframeDoc.open();
          iframeDoc.write(htmlString);
          iframeDoc.close();

          // 等待样式、脚本和字体加载
          // 动态幻灯片的 JavaScript 需要时间执行
          await new Promise(r => setTimeout(r, 1000));

          // 等待字体加载完成
          if (iframeDoc.fonts && iframeDoc.fonts.ready) {
            try {
              await Promise.race([
                iframeDoc.fonts.ready,
                new Promise(r => setTimeout(r, 2000)) // 最多等待2秒
              ]);
            } catch (e) {
              console.warn('Font loading timeout:', e);
            }
          }

          // 再等待一下确保脚本执行完成
          await new Promise(r => setTimeout(r, 500));

          let slides;

          // 如果从 HTML 中解析到了 slides 数组，使用它来渲染每一页
          if (parsedSlidesData && parsedSlidesData.length > 1) {
            console.log(`[DEBUG] 从 HTML 解析到 ${parsedSlidesData.length} 页幻灯片数据`);
            slides = await this.extractSlidesFromParsedData(
              parsedSlidesData,
              iframe.contentWindow,
              iframeDoc
            );
          } else {
            // 检测是否为动态幻灯片（JavaScript 渲染的幻灯片）
            const dynamicSlides = await this.detectAndExtractDynamicSlides(iframe.contentWindow, iframeDoc);

            if (dynamicSlides && dynamicSlides.length > 1) {
              // 使用动态提取的幻灯片
              console.log(`[DEBUG] 检测到 ${dynamicSlides.length} 页动态幻灯片`);
              slides = dynamicSlides;
            } else {
              // 回退到静态提取
              slides = this.htmlParser.extractSlides(iframeDoc);
            }
          }

          // 捕获字体图标为图片
          await this.captureFontIcons(slides, iframeDoc);

          // 捕获渐变背景为图片（PptxGenJS 不支持形状渐变填充）
          await this.captureGradients(slides, iframeDoc);

          // 创建临时的 PptGenerator 来计算缩放参数
          const generatorOptions = {
            ...this.options,
            aspectRatio: options.aspectRatio || this.options.aspectRatio || '16:9'
          };
          const tempGenerator = new PptGenerator(generatorOptions);
          tempGenerator.initPresentation();
          tempGenerator.setContainerSize(
            iframe.contentWindow.innerWidth,
            iframe.contentWindow.innerHeight
          );

          // 保存缩放参数供后续使用
          this.lastContainerSize = {
            width: iframe.contentWindow.innerWidth,
            height: iframe.contentWindow.innerHeight
          };

          document.body.removeChild(iframe);
          resolve(slides);
        } catch (error) {
          console.error('renderAndParse error:', error);
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
   * 捕获字体图标为图片
   * @param {Array<SlideData>} slides - 幻灯片数据
   * @param {Document} doc - 渲染后的文档
   */
  async captureFontIcons(slides, doc) {
    for (const slide of slides) {
      await this.captureIconsInElements(slide.elements, doc);
    }
  }

  /**
   * 捕获渐变背景为图片
   * @param {Array<SlideData>} slides - 幻灯片数据
   * @param {Document} doc - 渲染后的文档
   */
  async captureGradients(slides, doc) {
    for (const slide of slides) {
      await this.captureGradientsInElements(slide.elements, doc);
    }
  }

  /**
   * 递归捕获元素中的渐变背景和渐变字体
   * @param {Array} elements - 元素数组
   * @param {Document} doc - 渲染后的文档
   */
  async captureGradientsInElements(elements, doc) {
    for (const element of elements) {
      // 如果是容器且有渐变背景，捕获为图片
      if (element.type === 'container' &&
          element.styles?.backgroundImage?.includes('gradient') &&
          !element.styles?.hasGradientText) {
        try {
          const gradientImage = await this.renderGradientToImage(element, doc);
          if (gradientImage) {
            element.gradientImageData = gradientImage;
          }
        } catch (error) {
          console.warn('Failed to capture gradient:', error);
        }
      }

      // 如果是渐变字体，捕获为图片
      if (element.styles?.hasGradientText && element.text) {
        try {
          const gradientTextImage = await this.renderGradientTextToImage(element, doc);
          if (gradientTextImage) {
            element.gradientTextImageData = gradientTextImage;
          }
        } catch (error) {
          console.warn('Failed to capture gradient text:', error);
        }
      }

      // 递归处理子元素
      if (element.children && element.children.length > 0) {
        await this.captureGradientsInElements(element.children, doc);
      }
    }
  }

  /**
   * 将渐变元素渲染为图片
   * @param {Object} element - 元素数据
   * @param {Document} doc - 渲染后的文档
   * @returns {Promise<string|null>} base64 图片数据
   */
  async renderGradientToImage(element, doc) {
    const width = element.position?.width || 200;
    const height = element.position?.height || 100;
    const borderRadius = element.styles?.borderRadius || '0';

    // 使用 Canvas 绘制渐变
    const canvas = doc.createElement('canvas');
    canvas.width = width * 2; // 2x 高清
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');

    // 解析渐变
    const bgImage = element.styles.backgroundImage;
    const gradientMatch = bgImage.match(/linear-gradient\((.+)\)$/);

    if (gradientMatch) {
      const gradientStr = gradientMatch[1];

      // 解析方向（支持更多方向）
      let angle = 180; // 默认从上到下
      if (gradientStr.includes('to bottom right')) angle = 135;
      else if (gradientStr.includes('to bottom left')) angle = 225;
      else if (gradientStr.includes('to top right')) angle = 45;
      else if (gradientStr.includes('to top left')) angle = 315;
      else if (gradientStr.includes('to right')) angle = 90;
      else if (gradientStr.includes('to left')) angle = 270;
      else if (gradientStr.includes('to bottom')) angle = 180;
      else if (gradientStr.includes('to top')) angle = 0;
      else {
        const angleMatch = gradientStr.match(/(-?\d+(?:\.\d+)?)deg/);
        if (angleMatch) angle = parseFloat(angleMatch[1]);
      }

      // 计算渐变起点和终点
      const rad = (angle - 90) * Math.PI / 180;
      const halfW = canvas.width / 2;
      const halfH = canvas.height / 2;
      const x1 = halfW - Math.cos(rad) * halfW;
      const y1 = halfH - Math.sin(rad) * halfH;
      const x2 = halfW + Math.cos(rad) * halfW;
      const y2 = halfH + Math.sin(rad) * halfH;

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

      // 解析颜色和停止点位置
      // 支持格式：rgb(r,g,b), rgba(r,g,b,a), #hex, 颜色名称 后跟可选的百分比
      const colorStopRegex = /(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+)(?:\s+(\d+(?:\.\d+)?%?))?/g;
      const colorStops = [];
      let match;
      while ((match = colorStopRegex.exec(gradientStr)) !== null) {
        const color = match[1];
        // 跳过方向关键词
        if (['to', 'right', 'left', 'top', 'bottom', 'deg'].includes(color.toLowerCase())) continue;
        let position = match[2];
        if (position) {
          position = parseFloat(position) / 100;
        }
        colorStops.push({ color, position });
      }

      if (colorStops.length >= 2) {
        // 填充缺失的位置
        colorStops.forEach((stop, i) => {
          if (stop.position === undefined) {
            stop.position = i / (colorStops.length - 1);
          }
        });
        colorStops.forEach(stop => {
          try {
            gradient.addColorStop(stop.position, stop.color);
          } catch (e) {
            // 忽略无效颜色
          }
        });
      } else {
        return null;
      }

      // 绘制圆角矩形
      const radius = parseInt(borderRadius) * 2 || 0;
      ctx.beginPath();
      if (radius > 0 && ctx.roundRect) {
        ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
      } else {
        ctx.rect(0, 0, canvas.width, canvas.height);
      }
      ctx.fillStyle = gradient;
      ctx.fill();

      return canvas.toDataURL('image/png');
    }

    return null;
  }

  /**
   * 将渐变字体渲染为图片
   * @param {Object} element - 元素数据
   * @param {Document} doc - 渲染后的文档
   * @returns {Promise<string|null>} base64 图片数据
   */
  async renderGradientTextToImage(element, doc) {
    const text = element.text || '';
    if (!text) return null;

    const styles = element.styles || {};
    const fontSize = parseFloat(styles.fontSize) || 48;
    const fontWeight = styles.fontWeight || 'normal';
    const fontFamily = styles.fontFamily || 'Arial, sans-serif';

    // 创建 Canvas
    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 设置字体以测量文本尺寸
    ctx.font = `${fontWeight} ${fontSize * 2}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * 2.5; // 预留行高

    // 设置 canvas 尺寸（2x 高清）
    canvas.width = Math.ceil(textWidth) + 20;
    canvas.height = Math.ceil(textHeight);

    // 解析渐变
    const bgImage = styles.backgroundImage;
    const gradientMatch = bgImage?.match(/linear-gradient\((.+)\)$/);

    if (gradientMatch) {
      const gradientStr = gradientMatch[1];

      // 解析方向（支持更多方向）
      let angle = 180;
      if (gradientStr.includes('to bottom right')) angle = 135;
      else if (gradientStr.includes('to bottom left')) angle = 225;
      else if (gradientStr.includes('to top right')) angle = 45;
      else if (gradientStr.includes('to top left')) angle = 315;
      else if (gradientStr.includes('to right')) angle = 90;
      else if (gradientStr.includes('to left')) angle = 270;
      else if (gradientStr.includes('to bottom')) angle = 180;
      else if (gradientStr.includes('to top')) angle = 0;
      else {
        const angleMatch = gradientStr.match(/(-?\d+(?:\.\d+)?)deg/);
        if (angleMatch) angle = parseFloat(angleMatch[1]);
      }

      // 计算渐变起点和终点
      const rad = (angle - 90) * Math.PI / 180;
      const halfW = canvas.width / 2;
      const halfH = canvas.height / 2;
      const x1 = halfW - Math.cos(rad) * halfW;
      const y1 = halfH - Math.sin(rad) * halfH;
      const x2 = halfW + Math.cos(rad) * halfW;
      const y2 = halfH + Math.sin(rad) * halfH;

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

      // 解析颜色和停止点位置
      const colorStopRegex = /(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+)(?:\s+(\d+(?:\.\d+)?%?))?/g;
      const colorStops = [];
      let match;
      while ((match = colorStopRegex.exec(gradientStr)) !== null) {
        const color = match[1];
        if (['to', 'right', 'left', 'top', 'bottom', 'deg'].includes(color.toLowerCase())) continue;
        let position = match[2];
        if (position) {
          position = parseFloat(position) / 100;
        }
        colorStops.push({ color, position });
      }

      if (colorStops.length >= 2) {
        colorStops.forEach((stop, i) => {
          if (stop.position === undefined) {
            stop.position = i / (colorStops.length - 1);
          }
        });
        colorStops.forEach(stop => {
          try {
            gradient.addColorStop(stop.position, stop.color);
          } catch (e) {
            // 忽略无效颜色
          }
        });
      } else {
        return null;
      }

      // 重新设置字体（canvas 尺寸改变后需要重设）
      ctx.font = `${fontWeight} ${fontSize * 2}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      // 使用渐变填充文字
      ctx.fillStyle = gradient;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      return canvas.toDataURL('image/png');
    }

    return null;
  }

  /**
   * 递归捕获元素中的字体图标
   * @param {Array} elements - 元素数组
   * @param {Document} doc - 渲染后的文档
   */
  async captureIconsInElements(elements, doc) {
    for (const element of elements) {
      // 如果是字体图标，尝试捕获为图片
      if (element.type === 'icon' && element.isFontIcon) {
        try {
          const iconImage = await this.renderFontIconToImage(element, doc);
          if (iconImage) {
            element.iconImageData = iconImage;
          }
        } catch (error) {
          console.warn('Failed to capture font icon:', error);
        }
      }

      // 递归处理子元素
      if (element.children && element.children.length > 0) {
        await this.captureIconsInElements(element.children, doc);
      }
    }
  }

  /**
   * 将字体图标渲染为图片
   * @param {Object} element - 图标元素数据
   * @param {Document} doc - 渲染后的文档
   * @returns {Promise<string|null>} base64 图片数据
   */
  async renderFontIconToImage(element, doc) {
    // 在文档中查找对应的图标元素
    const iconElements = doc.querySelectorAll('.material-icons, .material-icons-outlined, .material-icons-round, .material-icons-sharp, .material-symbols-outlined, .material-symbols-rounded, .material-symbols-sharp, .fa, .fas, .far, .fab, .bi, .mdi, i[class*="icon"]');

    // 获取图标名称用于精确匹配（优先使用 iconName，这是在 HtmlParser 中保存的原始图标文本）
    const elementText = element.iconName || element.content?.trim() || element.textContent?.trim() || '';

    // 第一优先：通过文本内容精确匹配（对于 Material Icons 这是最可靠的方式）
    for (const iconEl of iconElements) {
      const iconText = iconEl.textContent?.trim() || '';
      if (elementText && iconText === elementText) {
        return await this.captureElementToImage(iconEl, doc);
      }
    }

    // 第二优先：在更大范围内搜索匹配的文本
    const allIcons = doc.querySelectorAll('[class*="material-icons"], [class*="icon"], i, span');
    for (const iconEl of allIcons) {
      const iconText = iconEl.textContent?.trim() || '';
      if (elementText && iconText === elementText) {
        return await this.captureElementToImage(iconEl, doc);
      }
    }

    // 第三优先：只有在位置信息可用且匹配时才使用位置匹配
    // 注意：不使用仅类名匹配，因为多个图标可能有相同的类名
    for (const iconEl of iconElements) {
      if (element.position && iconEl.getBoundingClientRect) {
        const rect = iconEl.getBoundingClientRect();
        const posMatch = Math.abs(rect.x - element.position.x) < 5 &&
                         Math.abs(rect.y - element.position.y) < 5;
        if (posMatch) {
          return await this.captureElementToImage(iconEl, doc);
        }
      }
    }

    return null;
  }

  /**
   * 判断两个元素是否相同
   * @param {Object} elementData - 解析的元素数据
   * @param {Element} domElement - DOM 元素
   * @returns {boolean}
   */
  isSameElement(elementData, domElement) {
    // 通过标签名和类名匹配
    const tagMatch = elementData.tagName === domElement.tagName.toLowerCase();
    const classMatch = elementData.attributes?.class === domElement.className;

    // 如果位置信息可用，也可以用位置匹配
    if (elementData.position && domElement.getBoundingClientRect) {
      const rect = domElement.getBoundingClientRect();
      const posMatch = Math.abs(rect.x - elementData.position.x) < 5 &&
                       Math.abs(rect.y - elementData.position.y) < 5;
      if (posMatch) return true;
    }

    return tagMatch && classMatch;
  }

  /**
   * 常用 Material Icons 的 SVG 路径映射
   * 这些是预定义的图标，可以在 PPT 中正确显示
   */
  static MATERIAL_ICON_PATHS = {
    'home': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'settings': 'M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    'directions_car': 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
    'car': 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
    'search': 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    'menu': 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
    'close': 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    'check': 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    'add': 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    'delete': 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    'edit': 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    'person': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    'email': 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    'phone': 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
    'favorite': 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'star': 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    'info': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    'warning': 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    'error': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    'help': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
    'account_circle': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z',
    'arrow_back': 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    'arrow_forward': 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
    'check_circle': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    'cancel': 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z',
    'visibility': 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
    'visibility_off': 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
    'lock': 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
    'download': 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
    'upload': 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
    'share': 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z',
    'shopping_cart': 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
    'refresh': 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    'more_vert': 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    'more_horiz': 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    'notifications': 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
    'calendar_today': 'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z',
    'schedule': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    'location_on': 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    'attach_file': 'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
    'cloud': 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
    'folder': 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
    'insert_drive_file': 'M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z',
    'print': 'M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z',
    'save': 'M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z',
    'send': 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
    'link': 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    'language': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z',
    'work': 'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
    'school': 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    'flight': 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z',
    'local_hospital': 'M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z',
    'restaurant': 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
    'local_cafe': 'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM2 21h18v-2H2v2z',
    'movie': 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
    'music_note': 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    'sports_soccer': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 4h3c.55 0 1 .45 1 1v3h-4V6zm-2 0v4H7V7c0-.55.45-1 1-1h3zm-5 9v-3h4v4H7c-.55 0-1-.45-1-1zm6 4h-3c-.55 0-1-.45-1-1v-3h4v4zm0-5h-4V9h4v5zm6 2c0 .55-.45 1-1 1h-3v-4h4v3zm0-4h-4V9h4v4z',
    'fitness_center': 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z',
    'pets': 'M4.5 9.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M9 5.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M15 5.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M19.5 9.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M17.34 14.86c-.87-1.02-1.6-1.89-2.48-2.91-.46-.54-1.05-1.08-1.75-1.32-.11-.04-.22-.07-.33-.09-.25-.04-.52-.04-.78-.04s-.53 0-.79.05c-.11.02-.22.05-.33.09-.7.24-1.28.78-1.75 1.32-.87 1.02-1.6 1.89-2.48 2.91-1.31 1.31-2.92 2.76-2.62 4.79.29 1.02 1.02 2.03 2.33 2.32.73.15 3.06-.44 5.54-.44h.18c2.48 0 4.81.58 5.54.44 1.31-.29 2.04-1.31 2.33-2.32.31-2.04-1.3-3.49-2.61-4.8z',
    // Material Symbols 图标（测试文件中使用的）
    'account_tree': 'M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7zM7 9H4V5h3v4zm10 6h3v4h-3v-4zm0-10v4h3V5h-3z',
    'agriculture': 'M19.5 12c.93 0 1.78.28 2.5.76V8c0-1.1-.9-2-2-2h-6.29l-1.06-1.06 1.41-1.41-.71-.71-3.53 3.53.71.71 1.41-1.41L13 6.71V9c0 1.1-.9 2-2 2H8.96c.22.54.38 1.12.46 1.73.19-.13.4-.21.63-.27.5-.14 1.03-.21 1.59-.18C13.43 10.25 15 8.18 15 6h5v6c.55-.64 1.27-1.12 2.08-1.38.14-.04.28-.08.42-.1v-.52zm-11.22.36C8.13 12.57 8 12.77 8 13c0 .55.45 1 1 1s1-.45 1-1c0-.44-.28-.81-.67-.94-.19.08-.37.18-.55.3zM20 13.5c-2.48 0-4.5 2.02-4.5 4.5s2.02 4.5 4.5 4.5 4.5-2.02 4.5-4.5-2.02-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM4.5 18c-2.48 0-4.5 2.02-4.5 4.5S2.02 27 4.5 27 9 24.98 9 22.5 6.98 18 4.5 18zm0 7c-1.38 0-2.5-1.12-2.5-2.5S3.12 20 4.5 20s2.5 1.12 2.5 2.5S5.88 25 4.5 25z',
    'arrow_downward': 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
    'arrow_upward': 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
    'dns': 'M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
    'health_and_safety': 'M10.5 13H8v-3h2.5V7.5h3V10H16v3h-2.5v2.5h-3V13zM12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z',
    'html': 'M3.5 9H5v6H3.5v-2.5h-2V15H0V9h1.5v2h2V9zm11 3c0 .6-.2 1.1-.6 1.4-.4.4-.9.6-1.4.6H11v-2h1c.4 0 .5-.2.5-.5s-.1-.5-.5-.5h-1c-.4 0-.8.1-1.1.4-.3.3-.4.7-.4 1.1v1c0 .4.1.8.4 1.1.3.3.7.4 1.1.4h2V15H12c-.6 0-1.1-.2-1.4-.6-.4-.4-.6-.9-.6-1.4v-1c0-.6.2-1.1.6-1.4.4-.4.9-.6 1.4-.6h1c.6 0 1 .2 1.4.6.4.4.6.9.6 1.4v1zm2.5-3v6h1.5v-2.5h2V15H22V9h-1.5v2h-2V9h-1.5zm-8 6V10.5h1.5V9H6v1.5h1.5V15H9z',
    'inventory_2': 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
    'payments': 'M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z',
    'picture_as_pdf': 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z',
    'precision_manufacturing': 'M19.93 8.35l-3.6 1.68L14 7.7V6.3l2.33-2.33 3.6 1.68c.38.18.82.01 1-.36.18-.38.01-.82-.36-1l-3.92-1.83c-.38-.18-.83-.1-1.13.2L13.78 4.4c-.18-.24-.46-.4-.78-.4-.55 0-1 .45-1 1v1H8.82C8.34 4.65 6.98 3.73 5.4 4.07c-1.16.25-2.15 1.17-2.36 2.35-.32 1.77.9 3.35 2.67 3.57 1.23.15 2.32-.42 2.97-1.32L12 8.67v1.4l-1.88 1.88c-.28.28-.36.72-.22 1.08l2.03 5.08c.36.89 1.52 1.1 2.18.39l2.78-2.98c.29-.31.34-.77.13-1.14l-1.63-2.88 1.86-.86c.31-.15.55-.42.66-.75l1.64-4.88c.19-.38.03-.82-.35-1-.38-.18-.82-.01-1 .37l-1.37 4.07zM5.5 6.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm8.85 6.25l1.5 2.64-1.5 1.61-1.23-3.08 1.23-1.17z',
    'rocket_launch': 'M9.19 6.35c-2.04 2.29-3.44 5.58-3.57 5.89L2 10.69l4.05-4.05c.47-.47 1.15-.68 1.81-.55l1.33.26zM11.17 17s3.74-1.55 5.89-3.7c5.4-5.4 4.5-9.62 4.21-10.57-.95-.3-5.17-1.19-10.57 4.21C8.55 9.09 7 12.83 7 12.83L11.17 17zm6.48-2.19c-2.29 2.04-5.58 3.44-5.89 3.57L13.31 22l4.05-4.05c.47-.47.68-1.15.55-1.81l-.26-1.33zM9 18c0 .83-.34 1.58-.88 2.12C6.94 21.3 2 22 2 22s.7-4.94 1.88-6.12C4.42 15.34 5.17 15 6 15c1.66 0 3 1.34 3 3zm4-9c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z',
    'share_location': 'M13.02 19.93v2.02c2.01-.2 3.84-1 5.32-2.21l-1.42-1.43c-1.11.86-2.44 1.44-3.9 1.62zM4.03 12c0-4.05 3.03-7.41 6.95-7.93V2.05C5.95 2.58 2.03 6.84 2.03 12c0 5.16 3.92 9.42 8.95 9.95v-2.02c-3.92-.52-6.95-3.88-6.95-7.93zm15.92-1h2.02c-.2-2.01-1-3.84-2.21-5.32l-1.43 1.43c.86 1.1 1.44 2.43 1.62 3.89zm-1.61-6.74c-1.48-1.21-3.32-2.01-5.32-2.21v2.02c1.46.18 2.79.76 3.9 1.62l1.42-1.43zm-.01 12.64l1.43 1.42c1.21-1.48 2.01-3.31 2.21-5.32h-2.02c-.18 1.46-.76 2.79-1.62 3.9zM16 11.1C16 8.61 14.1 7 12 7s-4 1.61-4 4.1c0 1.66 1.33 3.63 4 5.9 2.67-2.27 4-4.24 4-5.9zm-4 1.4c-.59 0-1.07-.48-1.07-1.07 0-.59.48-1.07 1.07-1.07s1.07.48 1.07 1.07c0 .59-.48 1.07-1.07 1.07z',
    'train': 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    // 更多 Material Symbols 图标
    'trending_up': 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
    'water': 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z',
    'translate': 'M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z',
    'map': 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
    'inventory': 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
    'hub': 'M8.4 18.2c.38.5.6 1.12.6 1.8 0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3c.44 0 .85.09 1.23.26l1.41-1.77c-.92-1.03-1.64-2.43-1.64-4.49 0-3.38 2.76-6 6-6s6 2.62 6 6c0 2.07-.72 3.46-1.64 4.49l1.41 1.77c.38-.17.79-.26 1.23-.26 1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3c0-.68.22-1.3.6-1.8L14.57 16c-.74.57-1.62.96-2.57 1.05V21H13c.55 0 1 .45 1 1s-.45 1-1 1h-2c-.55 0-1-.45-1-1v-5.05c-.95-.09-1.83-.48-2.57-1.05l-1.03 1.3zM12 5c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z',
    'handshake': 'M12.22 19.85c-.18.18-.5.21-.71 0-.18-.18-.21-.5 0-.71l3.54-3.54-.71-.71-3.54 3.54c-.18.18-.5.21-.71 0-.18-.18-.21-.5 0-.71l3.54-3.54-.71-.71-3.54 3.54c-.18.18-.5.21-.71 0-.18-.18-.21-.5 0-.71l3.54-3.54-.71-.71-3.54 3.54c-.18.18-.5.21-.71 0-.18-.18-.21-.5 0-.71L12.67 8l1.06 1.06-5.66 5.66c-.59.59-.59 1.54 0 2.12.29.29.68.44 1.06.44s.77-.15 1.06-.44l.71-.71c.29.29.68.44 1.06.44s.77-.15 1.06-.44l.71-.71c.29.29.68.44 1.06.44s.77-.15 1.06-.44l.71-.71c.29.29.68.44 1.06.44s.77-.15 1.06-.44c.59-.59.59-1.54 0-2.12L14.79 9.4l2.12-2.12 4.95 4.95c.78.78.78 2.05 0 2.83l-4.24 4.24c-.78.78-2.05.78-2.83 0l-.35-.35L12.22 19.85zM2.81 9.4l4.24-4.24c.78-.78 2.05-.78 2.83 0l.71.71 1.41-1.41-.71-.71c-1.56-1.56-4.09-1.56-5.66 0L1.4 8c-.78.78-.78 2.05 0 2.83l4.95 4.95.71-.71-4.24-4.66z',
    'groups': 'M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85-.85-.37-1.79-.58-2.78-.58-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z',
    'gavel': 'M1 21h12v2H1v-2zM5.245 8.07l2.83-2.827 14.14 14.142-2.828 2.828L5.245 8.07zM12.317 1l5.657 5.656-2.83 2.83-5.654-5.66L12.317 1zM3.825 9.485l5.657 5.657-2.828 2.828-5.657-5.657 2.828-2.828z',
    'cloud_off': 'M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z'
  };

  /**
   * 将 DOM 元素捕获为图片
   * 优先使用 Canvas 直接渲染字体图标，如果失败则使用预定义的 SVG 路径
   * @param {Element} element - DOM 元素
   * @param {Document} doc - 元素所在的文档
   * @returns {Promise<string|null>} base64 图片数据
   */
  async captureElementToImage(element, doc) {
    try {
      const rect = element.getBoundingClientRect();
      const computedStyle = doc.defaultView.getComputedStyle(element);

      // 获取元素尺寸（至少 48x48）
      const width = Math.max(Math.ceil(rect.width), 48);
      const height = Math.max(Math.ceil(rect.height), 48);

      // 获取文本内容和样式
      const text = element.textContent?.trim() || '';
      const color = computedStyle.color || '#ffffff';
      const fontFamily = computedStyle.fontFamily || 'Material Symbols Outlined';
      const fontSize = parseFloat(computedStyle.fontSize) || 24;

      // 方法1：尝试使用 Canvas 直接渲染字体图标
      const canvasResult = await this.renderIconWithCanvas(text, width, height, color, fontFamily, fontSize, doc);
      if (canvasResult) {
        return canvasResult;
      }

      // 方法2：尝试查找预定义的 Material Icon 路径
      const iconPath = HtmlToPptConverter.MATERIAL_ICON_PATHS[text];
      if (iconPath) {
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 24">
          <path d="${iconPath}" fill="${color}"/>
        </svg>`;
        const svgBase64 = btoa(unescape(encodeURIComponent(svgContent)));
        return `data:image/svg+xml;base64,${svgBase64}`;
      }

      // 方法3：跳过未知图标，不返回占位符（避免灰色矩形）
      console.warn(`Unknown icon: "${text}", skipping`);
      return null;
    } catch (error) {
      console.warn('Failed to capture element to image:', error);
      return null;
    }
  }

  /**
   * 使用 Canvas 渲染字体图标
   * @param {string} iconText - 图标文本（如 "home", "settings"）
   * @param {number} width - 画布宽度
   * @param {number} height - 画布高度
   * @param {string} color - 图标颜色
   * @param {string} fontFamily - 字体族
   * @param {number} fontSize - 字体大小
   * @param {Document} doc - 文档对象
   * @returns {Promise<string|null>} base64 图片数据
   */
  async renderIconWithCanvas(iconText, width, height, color, fontFamily, fontSize, doc) {
    try {
      // 清理字体名称
      const cleanFontFamily = fontFamily.replace(/"/g, '').trim();

      // 确保字体已加载
      if (doc.fonts && doc.fonts.ready) {
        await doc.fonts.ready;

        // 尝试加载特定字体
        try {
          await doc.fonts.load(`${fontSize}px "${cleanFontFamily}"`);
        } catch (e) {
          // 忽略字体加载错误
        }

        // 额外等待确保字体完全可用
        await new Promise(r => setTimeout(r, 200));
      }

      // 创建 Canvas
      const canvas = doc.createElement('canvas');
      const scale = 2; // 高清渲染
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');

      // 设置高清缩放
      ctx.scale(scale, scale);

      // 清空画布（透明背景）
      ctx.clearRect(0, 0, width, height);

      // 设置字体 - 使用 Material Symbols 字体
      ctx.font = `${fontSize}px "${cleanFontFamily}"`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 绘制文字
      ctx.fillText(iconText, width / 2, height / 2);

      // 检查是否成功渲染（只要有内容就认为成功）
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let hasContent = false;
      let pixelCount = 0;

      // 检查是否有实际内容（不是全透明）
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha > 5) {
          hasContent = true;
          pixelCount++;
        }
      }

      // 降低检查门槛：只要有一些像素就认为成功
      const minPixels = 10; // 最少10个像素
      if (!hasContent || pixelCount < minPixels) {
        console.warn(`Canvas render failed for "${iconText}" (pixels: ${pixelCount})`);
        return null;
      }

      // 返回 PNG 数据
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Canvas rendering failed:', error);
      return null;
    }
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

    // 根据选项创建 PptGenerator（支持不同的长宽比）
    const generatorOptions = {
      ...this.options,
      aspectRatio: options.aspectRatio || this.options.aspectRatio || '16:9'
    };
    this.pptGenerator = new PptGenerator(generatorOptions);
    this.pptGenerator.initPresentation(metadata);

    // 设置容器尺寸用于等比例缩放
    if (this.lastContainerSize) {
      this.pptGenerator.setContainerSize(
        this.lastContainerSize.width,
        this.lastContainerSize.height
      );
    } else {
      // 默认容器尺寸 (1920x1080 for 16:9)
      this.pptGenerator.setContainerSize(1920, 1080);
    }

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
    // 在浏览器环境中渲染并解析（传递 aspectRatio 选项）
    const slides = await this.renderAndParse(htmlString, options);

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

  /**
   * 分析 HTML 中使用的资源（字体、图标等）
   * @param {string} htmlString - HTML 内容
   * @returns {Object} 资源分析结果
   */
  analyzeResources(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    return {
      fonts: this.extractFonts(doc, htmlString),
      icons: this.extractIcons(doc),
      images: this.extractImages(doc),
      colors: this.extractColors(doc)
    };
  }

  /**
   * 提取 HTML 中使用的字体
   * @param {Document} doc - DOM 文档
   * @param {string} htmlString - 原始 HTML 字符串
   * @returns {Array<Object>} 字体列表
   */
  extractFonts(doc, htmlString) {
    const fonts = new Map();

    // 1. 从 CSS link 标签提取 Google Fonts
    const links = doc.querySelectorAll('link[href*="fonts.googleapis.com"]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      const familyMatch = href.match(/family=([^&:]+)/);
      if (familyMatch) {
        const families = decodeURIComponent(familyMatch[1]).split('|');
        families.forEach(family => {
          const fontName = family.split(':')[0].replace(/\+/g, ' ');
          if (!fonts.has(fontName)) {
            fonts.set(fontName, {
              name: fontName,
              source: 'Google Fonts',
              url: href,
              usageCount: 0
            });
          }
        });
      }
    });

    // 2. 从 @font-face 规则提取自定义字体
    const styleSheets = doc.querySelectorAll('style');
    styleSheets.forEach(style => {
      const fontFaceMatches = style.textContent.matchAll(/@font-face\s*\{[^}]*font-family:\s*['"]?([^'";]+)['"]?[^}]*\}/gi);
      for (const match of fontFaceMatches) {
        const fontName = match[1].trim();
        if (!fonts.has(fontName)) {
          fonts.set(fontName, {
            name: fontName,
            source: 'Custom (@font-face)',
            usageCount: 0
          });
        }
      }
    });

    // 3. 从内联样式提取 font-family
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      const style = el.getAttribute('style');
      if (style) {
        const fontMatch = style.match(/font-family:\s*([^;]+)/i);
        if (fontMatch) {
          this.parseFontFamilyList(fontMatch[1], fonts);
        }
      }
    });

    // 4. 从 HTML 字符串中搜索 Tailwind 字体类
    const tailwindFontClasses = {
      'font-sans': 'System Sans-serif',
      'font-serif': 'System Serif',
      'font-mono': 'System Monospace'
    };
    Object.entries(tailwindFontClasses).forEach(([cls, name]) => {
      if (htmlString.includes(cls)) {
        if (!fonts.has(name)) {
          fonts.set(name, {
            name,
            source: 'Tailwind CSS',
            usageCount: (htmlString.match(new RegExp(cls, 'g')) || []).length
          });
        }
      }
    });

    // 5. 统计字体使用次数
    fonts.forEach((fontInfo, fontName) => {
      const regex = new RegExp(fontName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      fontInfo.usageCount = (htmlString.match(regex) || []).length;
    });

    return Array.from(fonts.values()).sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * 解析 font-family 列表
   * @param {string} fontFamilyStr - font-family 字符串
   * @param {Map} fonts - 字体 Map
   */
  parseFontFamilyList(fontFamilyStr, fonts) {
    const families = fontFamilyStr.split(',').map(f => f.trim().replace(/['"]/g, ''));
    families.forEach(family => {
      if (family && !['inherit', 'initial', 'unset'].includes(family.toLowerCase())) {
        if (!fonts.has(family)) {
          fonts.set(family, {
            name: family,
            source: 'Inline Style',
            usageCount: 1
          });
        } else {
          fonts.get(family).usageCount++;
        }
      }
    });
  }

  /**
   * 提取 HTML 中使用的图标
   * @param {Document} doc - DOM 文档
   * @returns {Array<Object>} 图标列表
   */
  extractIcons(doc) {
    const icons = [];
    const iconSets = new Map();

    // Material Symbols / Material Icons
    const materialSelectors = [
      '.material-symbols-outlined',
      '.material-symbols-rounded',
      '.material-symbols-sharp',
      '.material-icons',
      '.material-icons-outlined',
      '.material-icons-round',
      '.material-icons-sharp'
    ];

    materialSelectors.forEach(selector => {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(el => {
        const iconName = el.textContent.trim();
        if (iconName) {
          const setName = selector.replace('.', '');
          icons.push({
            name: iconName,
            set: setName,
            element: el.tagName.toLowerCase()
          });

          if (!iconSets.has(setName)) {
            iconSets.set(setName, { count: 0, icons: new Set() });
          }
          iconSets.get(setName).count++;
          iconSets.get(setName).icons.add(iconName);
        }
      });
    });

    // Font Awesome
    const faElements = doc.querySelectorAll('[class*="fa-"]');
    faElements.forEach(el => {
      const classes = el.className.split(' ');
      classes.forEach(cls => {
        if (cls.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-light', 'fa-thin', 'fa-duotone', 'fa-brands'].includes(cls)) {
          const iconName = cls.replace('fa-', '');
          const setType = classes.find(c => ['fas', 'far', 'fal', 'fat', 'fad', 'fab'].includes(c)) || 'fa';
          icons.push({
            name: iconName,
            set: 'Font Awesome',
            variant: setType
          });

          if (!iconSets.has('Font Awesome')) {
            iconSets.set('Font Awesome', { count: 0, icons: new Set() });
          }
          iconSets.get('Font Awesome').count++;
          iconSets.get('Font Awesome').icons.add(iconName);
        }
      });
    });

    // Bootstrap Icons
    const biElements = doc.querySelectorAll('[class*="bi-"]');
    biElements.forEach(el => {
      const classes = el.className.split(' ');
      classes.forEach(cls => {
        if (cls.startsWith('bi-')) {
          const iconName = cls.replace('bi-', '');
          icons.push({
            name: iconName,
            set: 'Bootstrap Icons'
          });

          if (!iconSets.has('Bootstrap Icons')) {
            iconSets.set('Bootstrap Icons', { count: 0, icons: new Set() });
          }
          iconSets.get('Bootstrap Icons').count++;
          iconSets.get('Bootstrap Icons').icons.add(iconName);
        }
      });
    });

    return {
      total: icons.length,
      bySet: Array.from(iconSets.entries()).map(([name, data]) => ({
        name,
        count: data.count,
        uniqueIcons: Array.from(data.icons)
      })),
      details: icons
    };
  }

  /**
   * 提取 HTML 中的图片
   * @param {Document} doc - DOM 文档
   * @returns {Array<Object>} 图片列表
   */
  extractImages(doc) {
    const images = [];
    const imgElements = doc.querySelectorAll('img');

    imgElements.forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src) {
        images.push({
          src: src.substring(0, 100) + (src.length > 100 ? '...' : ''),
          alt: img.getAttribute('alt') || '',
          isBlob: src.startsWith('blob:'),
          isDataUrl: src.startsWith('data:'),
          isExternal: src.startsWith('http')
        });
      }
    });

    // 背景图片
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      const style = el.getAttribute('style');
      if (style && style.includes('background-image')) {
        const urlMatch = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
        if (urlMatch) {
          images.push({
            src: urlMatch[1].substring(0, 100),
            type: 'background-image',
            isBlob: urlMatch[1].startsWith('blob:'),
            isDataUrl: urlMatch[1].startsWith('data:'),
            isExternal: urlMatch[1].startsWith('http')
          });
        }
      }
    });

    return {
      total: images.length,
      external: images.filter(i => i.isExternal).length,
      blob: images.filter(i => i.isBlob).length,
      dataUrl: images.filter(i => i.isDataUrl).length,
      details: images.slice(0, 20) // 只返回前 20 个
    };
  }

  /**
   * 提取 HTML 中使用的颜色
   * @param {Document} doc - DOM 文档
   * @returns {Array<Object>} 颜色列表
   */
  extractColors(doc) {
    const colors = new Map();

    // 从内联样式提取颜色
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      const style = el.getAttribute('style');
      if (style) {
        // 匹配各种颜色格式
        const colorMatches = style.matchAll(/(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/g);
        for (const match of colorMatches) {
          const color = match[1];
          if (!colors.has(color)) {
            colors.set(color, { value: color, count: 0 });
          }
          colors.get(color).count++;
        }
      }

      // Tailwind 颜色类
      const className = el.className;
      if (typeof className === 'string') {
        const tailwindColorMatch = className.match(/(bg|text|border|from|to|via)-([a-z]+)-(\d+)/g);
        if (tailwindColorMatch) {
          tailwindColorMatch.forEach(cls => {
            if (!colors.has(cls)) {
              colors.set(cls, { value: cls, type: 'Tailwind', count: 0 });
            }
            colors.get(cls).count++;
          });
        }
      }
    });

    return Array.from(colors.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 30); // 只返回前 30 个
  }

  /**
   * 检测并提取动态渲染的幻灯片
   * 针对使用 JavaScript 动态渲染的演示文稿（如 SAP PPM Presentation）
   * @param {Window} win - iframe 的 window 对象
   * @param {Document} doc - iframe 的 document 对象
   * @returns {Promise<Array<SlideData>|null>} 幻灯片数据数组，如果不是动态幻灯片返回 null
   */
  async detectAndExtractDynamicSlides(win, doc) {
    try {
      // 检测是否存在 slides 数组和 renderSlide 函数
      let hasSlides = false;
      let slidesLength = 0;
      let hasRenderSlide = false;

      try {
        hasSlides = typeof win.slides !== 'undefined' && Array.isArray(win.slides);
        if (hasSlides) {
          slidesLength = win.slides.length;
        }
        hasRenderSlide = typeof win.renderSlide === 'function';
      } catch (e) {
        console.warn('[DEBUG] Cannot access iframe window properties (cross-origin?):', e);
      }

      // 检测是否有幻灯片计数器（如 "1 / 20"）
      const totalSlidesElement = doc.getElementById('total-slides');
      const hasTotalSlides = totalSlidesElement && parseInt(totalSlidesElement.textContent) > 1;
      const totalFromCounter = totalSlidesElement ? parseInt(totalSlidesElement.textContent) : 0;

      // 检测是否只有一个 .slide 元素但有多个幻灯片数据
      const staticSlideCount = doc.querySelectorAll('.slide').length;

      console.log(`[DEBUG] Dynamic slide detection: hasSlides=${hasSlides}, slidesLength=${slidesLength}, hasRenderSlide=${hasRenderSlide}, hasTotalSlides=${hasTotalSlides}, totalFromCounter=${totalFromCounter}, staticSlideCount=${staticSlideCount}`);

      // 如果存在动态幻灯片数据
      if (hasSlides && win.slides.length > 1) {
        console.log(`[DEBUG] Detected ${win.slides.length} dynamic slides, extracting...`);
        return await this.extractDynamicSlides(win, doc);
      }

      // 如果有幻灯片计数器显示多页，但静态 DOM 只有一个
      if (hasTotalSlides && staticSlideCount <= 1) {
        const totalSlides = parseInt(totalSlidesElement.textContent);
        console.log(`[DEBUG] Detected ${totalSlides} slides from counter, trying to extract...`);
        return await this.extractSlidesWithNavigation(win, doc, totalSlides);
      }

      return null;
    } catch (error) {
      console.warn('Dynamic slide detection failed:', error);
      return null;
    }
  }

  /**
   * 从 JavaScript slides 数组中提取幻灯片
   * @param {Window} win - iframe 的 window 对象
   * @param {Document} doc - iframe 的 document 对象
   * @returns {Promise<Array<SlideData>>} 幻灯片数据数组
   */
  async extractDynamicSlides(win, doc) {
    const slides = [];
    const totalSlides = win.slides.length;

    for (let i = 0; i < totalSlides; i++) {
      try {
        // 调用渲染函数显示当前幻灯片
        if (typeof win.renderSlide === 'function') {
          win.renderSlide(i);
          // 等待渲染完成
          await new Promise(r => setTimeout(r, 300));
        }

        // 解析当前显示的幻灯片
        const slideElement = doc.querySelector('.slide');
        if (slideElement) {
          const slideData = this.htmlParser.parseSlideElement(slideElement, i);
          slideData.title = win.slides[i]?.title || slideData.title || `Slide ${i + 1}`;
          slides.push(slideData);
          console.log(`[DEBUG] Extracted slide ${i + 1}/${totalSlides}: ${slideData.title}`);
        }
      } catch (error) {
        console.warn(`Failed to extract slide ${i + 1}:`, error);
      }
    }

    return slides;
  }

  /**
   * 通过模拟导航按钮提取所有幻灯片
   * @param {Window} win - iframe 的 window 对象
   * @param {Document} doc - iframe 的 document 对象
   * @param {number} totalSlides - 总幻灯片数
   * @returns {Promise<Array<SlideData>>} 幻灯片数据数组
   */
  async extractSlidesWithNavigation(win, doc, totalSlides) {
    const slides = [];

    // 尝试找到导航函数
    const hasNextSlide = typeof win.nextSlide === 'function';
    const hasPrevSlide = typeof win.prevSlide === 'function';
    const hasRenderSlide = typeof win.renderSlide === 'function';

    // 先回到第一页
    if (hasRenderSlide) {
      win.renderSlide(0);
      await new Promise(r => setTimeout(r, 300));
    }

    for (let i = 0; i < totalSlides; i++) {
      try {
        // 如果有 renderSlide 函数，直接跳转
        if (hasRenderSlide) {
          win.renderSlide(i);
          await new Promise(r => setTimeout(r, 300));
        } else if (i > 0 && hasNextSlide) {
          // 否则使用 nextSlide
          win.nextSlide();
          await new Promise(r => setTimeout(r, 300));
        }

        // 解析当前显示的幻灯片
        const slideElement = doc.querySelector('.slide');
        if (slideElement) {
          const slideData = this.htmlParser.parseSlideElement(slideElement, i);
          slides.push(slideData);
          console.log(`[DEBUG] Extracted slide ${i + 1}/${totalSlides}: ${slideData.title}`);
        }
      } catch (error) {
        console.warn(`Failed to extract slide ${i + 1}:`, error);
      }
    }

    return slides;
  }

  /**
   * 从 HTML 字符串中直接解析 JavaScript slides 数组
   * 使用正则表达式提取，不依赖 iframe 执行脚本
   * @param {string} htmlString - HTML 内容
   * @returns {Array|null} 解析出的 slides 数据数组
   */
  parseSlidesArrayFromHtml(htmlString) {
    try {
      // 查找 const slides = [...] 或 let slides = [...] 或 var slides = [...]
      // 使用贪婪匹配来获取完整的数组
      const slidesMatch = htmlString.match(/(?:const|let|var)\s+slides\s*=\s*\[/);
      if (!slidesMatch) {
        console.log('[DEBUG] 未找到 slides 数组定义');
        return null;
      }

      const startIndex = slidesMatch.index + slidesMatch[0].length - 1;

      // 手动解析找到匹配的结束括号
      let bracketCount = 1;
      let endIndex = startIndex + 1;
      let inString = false;
      let stringChar = '';
      let escaping = false;
      let inTemplate = false;
      let templateDepth = 0;

      while (bracketCount > 0 && endIndex < htmlString.length) {
        const char = htmlString[endIndex];

        if (escaping) {
          escaping = false;
          endIndex++;
          continue;
        }

        if (char === '\\' && inString) {
          escaping = true;
          endIndex++;
          continue;
        }

        // 处理模板字符串
        if (char === '`' && !inString) {
          inTemplate = !inTemplate;
          if (inTemplate) {
            templateDepth = 1;
          } else {
            templateDepth = 0;
          }
          endIndex++;
          continue;
        }

        // 在模板字符串内部，跟踪 ${} 嵌套
        if (inTemplate) {
          if (char === '$' && htmlString[endIndex + 1] === '{') {
            templateDepth++;
            endIndex++;
          } else if (char === '}' && templateDepth > 1) {
            templateDepth--;
          } else if (char === '`' && templateDepth === 1) {
            inTemplate = false;
            templateDepth = 0;
          }
          endIndex++;
          continue;
        }

        // 处理普通字符串
        if ((char === '"' || char === "'") && !inString) {
          inString = true;
          stringChar = char;
          endIndex++;
          continue;
        }

        if (char === stringChar && inString) {
          inString = false;
          stringChar = '';
          endIndex++;
          continue;
        }

        if (inString) {
          endIndex++;
          continue;
        }

        // 计算括号
        if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
        }

        endIndex++;
      }

      if (bracketCount !== 0) {
        console.log('[DEBUG] 括号不匹配');
        return null;
      }

      const slidesArrayStr = htmlString.substring(startIndex, endIndex);
      console.log(`[DEBUG] 找到 slides 数组，长度: ${slidesArrayStr.length} 字符`);

      // 精确解析顶层对象，提取每个幻灯片的信息
      // 只匹配数组第一层的对象
      const slidesInfo = [];
      let arrayDepth = 0;   // [] 括号深度
      let objectDepth = 0;  // {} 括号深度
      let inStr = false;
      let strChar = '';
      let inTpl = false;
      let currentObjectStart = -1;

      for (let i = 0; i < slidesArrayStr.length; i++) {
        const char = slidesArrayStr[i];

        // 跳过字符串内容
        if (!inTpl) {
          if ((char === '"' || char === "'") && !inStr) {
            inStr = true;
            strChar = char;
            continue;
          }
          if (char === strChar && inStr && slidesArrayStr[i - 1] !== '\\') {
            inStr = false;
            strChar = '';
            continue;
          }
        }

        // 处理模板字符串
        if (char === '`' && !inStr) {
          inTpl = !inTpl;
          continue;
        }

        if (inStr || inTpl) continue;

        // 计算括号深度
        if (char === '[') {
          arrayDepth++;
        } else if (char === ']') {
          arrayDepth--;
        } else if (char === '{') {
          objectDepth++;
          // 如果是数组第一层的对象开始
          if (arrayDepth === 1 && objectDepth === 1) {
            currentObjectStart = i;
          }
        } else if (char === '}') {
          // 如果是顶层对象结束
          if (arrayDepth === 1 && objectDepth === 1 && currentObjectStart !== -1) {
            const objectStr = slidesArrayStr.substring(currentObjectStart, i + 1);
            // 从顶层对象中提取 id（可选）、title 或 type
            const idMatch = objectStr.match(/^\s*\{\s*(?:[^{}]*,)?\s*id:\s*(\d+)/);
            const titleMatch = objectStr.match(/title:\s*["']([^"']+)["']/);
            const typeMatch = objectStr.match(/type:\s*["']([^"']+)["']/);

            // 只要是顶层对象就添加到幻灯片列表（不再要求 id 字段）
            const slideIndex = slidesInfo.length;
            let slideTitle = `Slide ${slideIndex + 1}`;
            if (titleMatch) {
              slideTitle = titleMatch[1];
            } else if (typeMatch) {
              slideTitle = typeMatch[1];
            }

            slidesInfo.push({
              id: idMatch ? parseInt(idMatch[1]) : slideIndex,
              title: slideTitle,
              type: typeMatch ? typeMatch[1] : null,
              index: slideIndex
            });
            currentObjectStart = -1;
          }
          objectDepth--;
        }
      }

      console.log(`[DEBUG] 解析出 ${slidesInfo.length} 个顶层幻灯片对象`);
      return slidesInfo.length > 0 ? slidesInfo : null;

    } catch (error) {
      console.warn('[DEBUG] 解析 slides 数组失败:', error);
      return null;
    }
  }

  /**
   * 根据解析出的 slides 数据，逐页渲染并提取幻灯片
   * @param {Array} slidesData - 解析出的 slides 数据
   * @param {Window} win - iframe 的 window 对象
   * @param {Document} doc - iframe 的 document 对象
   * @returns {Promise<Array<SlideData>>} 幻灯片数据数组
   */
  async extractSlidesFromParsedData(slidesData, win, doc) {
    const slides = [];
    const totalSlides = slidesData.length;

    console.log(`[DEBUG] 开始提取 ${totalSlides} 页幻灯片...`);

    // 等待脚本执行完成 - 检查 renderSlide 函数是否可用
    let hasRenderSlide = typeof win.renderSlide === 'function';

    // 如果 renderSlide 不可用，等待更长时间让脚本执行
    if (!hasRenderSlide) {
      console.log(`[DEBUG] renderSlide 函数暂不可用，等待脚本执行...`);
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        hasRenderSlide = typeof win.renderSlide === 'function';
        if (hasRenderSlide) {
          console.log(`[DEBUG] renderSlide 函数已就绪 (尝试 ${attempt + 1} 次)`);
          break;
        }
      }
    }

    console.log(`[DEBUG] renderSlide 函数可用: ${hasRenderSlide}`);

    // 检查 .slide 元素是否存在
    let slideElement = doc.querySelector('.slide');
    if (!slideElement && !hasRenderSlide) {
      console.log(`[DEBUG] DOM 中没有 .slide 元素且 renderSlide 不可用，等待 DOM 加载...`);
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        slideElement = doc.querySelector('.slide');
        hasRenderSlide = typeof win.renderSlide === 'function';
        if (slideElement || hasRenderSlide) {
          console.log(`[DEBUG] DOM 已就绪 (尝试 ${attempt + 1} 次)`);
          break;
        }
      }
    }

    for (let i = 0; i < totalSlides; i++) {
      try {
        // 调用渲染函数显示当前幻灯片
        if (hasRenderSlide) {
          win.renderSlide(i);
          // 等待渲染完成
          await new Promise(r => setTimeout(r, 400));
        }

        // 解析当前显示的幻灯片
        const slideElement = doc.querySelector('.slide');
        if (slideElement) {
          const slideData = this.htmlParser.parseSlideElement(slideElement, i);
          slideData.title = slidesData[i]?.title || slideData.title || `Slide ${i + 1}`;
          slides.push(slideData);
          console.log(`[DEBUG] 已提取幻灯片 ${i + 1}/${totalSlides}: ${slideData.title}`);
        } else {
          console.warn(`[DEBUG] 第 ${i + 1} 页未找到 .slide 元素`);
          // 创建一个空白幻灯片占位
          slides.push({
            index: i,
            title: slidesData[i]?.title || `Slide ${i + 1}`,
            elements: [],
            background: {}
          });
        }
      } catch (error) {
        console.warn(`[DEBUG] 提取幻灯片 ${i + 1} 失败:`, error);
        // 创建一个空白幻灯片占位
        slides.push({
          index: i,
          title: slidesData[i]?.title || `Slide ${i + 1}`,
          elements: [],
          background: {}
        });
      }
    }

    console.log(`[DEBUG] 总共提取了 ${slides.length} 页幻灯片`);
    return slides;
  }
}

export default HtmlToPptConverter;
