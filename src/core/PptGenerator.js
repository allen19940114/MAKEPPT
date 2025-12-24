/**
 * PPT 生成器
 * 使用 PptxGenJS 生成 PowerPoint 文件
 */

import pptxgen from 'pptxgenjs';
import { StyleConverter } from './StyleConverter.js';
import { AnimationConverter } from './AnimationConverter.js';

export class PptGenerator {
  constructor(options = {}) {
    this.pptx = null;
    this.styleConverter = new StyleConverter();
    this.animationConverter = new AnimationConverter();

    // 配置选项
    this.options = {
      slideWidth: options.slideWidth || 10,
      slideHeight: options.slideHeight || 7.5,
      defaultFontFace: options.defaultFontFace || 'Microsoft YaHei',
      defaultFontSize: options.defaultFontSize || 18,
      ...options
    };

    // 容器尺寸 (用于位置计算)
    this.containerSize = {
      width: 1920,
      height: 1080
    };
  }

  /**
   * 初始化新的演示文稿
   * @param {Object} metadata - 文档元数据
   */
  initPresentation(metadata = {}) {
    this.pptx = new pptxgen();

    // 设置演示文稿属性
    this.pptx.layout = 'LAYOUT_16x9';
    this.pptx.author = metadata.author || 'HTML to PPT Converter';
    this.pptx.title = metadata.title || 'Converted Presentation';
    this.pptx.subject = metadata.subject || '';
    this.pptx.company = metadata.company || '';

    return this;
  }

  /**
   * 设置容器尺寸 (用于计算相对位置)
   * @param {number} width - 宽度
   * @param {number} height - 高度
   */
  setContainerSize(width, height) {
    this.containerSize = { width, height };
    this.styleConverter.slideWidth = this.options.slideWidth;
    this.styleConverter.slideHeight = this.options.slideHeight;
  }

  /**
   * 从解析的幻灯片数据生成演示文稿
   * @param {Array<SlideData>} slidesData - 幻灯片数据数组
   * @returns {PptGenerator} this
   */
  generateFromSlides(slidesData) {
    if (!this.pptx) {
      this.initPresentation();
    }

    for (const slideData of slidesData) {
      this.addSlide(slideData);
    }

    return this;
  }

  /**
   * 添加单张幻灯片
   * @param {SlideData} slideData - 幻灯片数据
   * @returns {Slide} PptxGenJS 幻灯片对象
   */
  addSlide(slideData) {
    const slide = this.pptx.addSlide();

    // 设置背景
    this.setSlideBackground(slide, slideData.background);

    // 添加所有元素
    for (const element of slideData.elements) {
      this.addElement(slide, element);
    }

    return slide;
  }

  /**
   * 设置幻灯片背景
   * @param {Slide} slide - PptxGenJS 幻灯片
   * @param {BackgroundData} background - 背景数据
   */
  setSlideBackground(slide, background) {
    if (!background) return;

    // 渐变背景
    if (background.gradient) {
      const gradient = this.styleConverter.convertGradient(background.gradient);
      if (gradient && gradient.colors.length >= 2) {
        slide.background = {
          color: gradient.colors[0].color,
          // PptxGenJS 对渐变支持有限，使用第一个颜色作为背景
        };
      }
    }
    // 纯色背景
    else if (background.color) {
      const color = this.styleConverter.convertColor(background.color);
      if (color) {
        slide.background = { color };
      }
    }
    // 背景图片
    else if (background.image) {
      const imgUrl = this.extractImageUrl(background.image);
      if (imgUrl) {
        slide.background = { path: imgUrl };
      }
    }
  }

  /**
   * 添加元素到幻灯片
   * @param {Slide} slide - PptxGenJS 幻灯片
   * @param {ElementData} element - 元素数据
   */
  addElement(slide, element) {
    switch (element.type) {
      case 'heading':
      case 'paragraph':
      case 'text':
        this.addTextElement(slide, element);
        break;
      case 'image':
        this.addImageElement(slide, element);
        break;
      case 'table':
        this.addTableElement(slide, element);
        break;
      case 'list':
        this.addListElement(slide, element);
        break;
      case 'container':
        this.addContainerElement(slide, element);
        break;
      case 'shape':
        this.addShapeElement(slide, element);
        break;
      default:
        // 默认作为文本处理
        if (element.text) {
          this.addTextElement(slide, element);
        }
    }

    // 递归处理子元素
    if (element.children && element.children.length > 0) {
      for (const child of element.children) {
        this.addElement(slide, child);
      }
    }
  }

  /**
   * 添加文本元素
   * @param {Slide} slide - 幻灯片
   * @param {ElementData} element - 元素数据
   */
  addTextElement(slide, element) {
    const text = element.text || this.collectAllText(element);
    if (!text) return;

    const position = this.calculatePosition(element.position);
    const textStyles = this.styleConverter.convertTextStyles(element.styles);
    const shapeStyles = this.styleConverter.convertShapeStyles(element.styles);

    // 构建文本配置
    const textOptions = {
      x: position.x,
      y: position.y,
      w: position.w || 'auto',
      h: position.h || 'auto',
      ...textStyles,
      ...shapeStyles,
      valign: 'middle',
      wrap: true
    };

    // 根据标题级别调整字号
    if (element.type === 'heading') {
      const level = parseInt(element.tagName?.replace('h', '') || '1');
      const headingSizes = { 1: 44, 2: 36, 3: 28, 4: 24, 5: 20, 6: 18 };
      textOptions.fontSize = headingSizes[level] || 24;
      textOptions.bold = true;
    }

    // 添加动画
    const animations = this.animationConverter.analyzeAndConvert(element.styles);
    if (animations.length > 0) {
      textOptions.animate = this.buildAnimationOptions(animations[0]);
    }

    slide.addText(text, textOptions);
  }

  /**
   * 收集元素及其子元素的所有文本
   * @param {ElementData} element - 元素数据
   * @returns {string} 文本内容
   */
  collectAllText(element) {
    let text = element.text || '';

    if (element.children) {
      for (const child of element.children) {
        const childText = this.collectAllText(child);
        if (childText) {
          text += (text ? ' ' : '') + childText;
        }
      }
    }

    return text.trim();
  }

  /**
   * 添加图片元素
   * @param {Slide} slide - 幻灯片
   * @param {ElementData} element - 元素数据
   */
  addImageElement(slide, element) {
    if (!element.src) return;

    const position = this.calculatePosition(element.position);

    const imageOptions = {
      x: position.x,
      y: position.y,
      w: position.w || 2,
      h: position.h || 2,
      sizing: {
        type: 'contain',
        w: position.w || 2,
        h: position.h || 2
      }
    };

    // 判断图片类型
    if (element.src.startsWith('data:')) {
      // Base64 图片
      imageOptions.data = element.src;
    } else {
      // URL 图片
      imageOptions.path = element.src;
    }

    try {
      slide.addImage(imageOptions);
    } catch (error) {
      console.warn('Failed to add image:', error);
    }
  }

  /**
   * 添加表格元素
   * @param {Slide} slide - 幻灯片
   * @param {ElementData} element - 元素数据
   */
  addTableElement(slide, element) {
    if (!element.tableData || !element.tableData.rows) return;

    const position = this.calculatePosition(element.position);
    const rows = [];

    for (const row of element.tableData.rows) {
      const tableRow = [];
      for (const cell of row) {
        const cellStyles = this.styleConverter.convertTextStyles(cell.styles || {});

        tableRow.push({
          text: cell.text,
          options: {
            ...cellStyles,
            bold: cell.isHeader || cellStyles.bold,
            fill: cell.isHeader ? { color: 'E7E6E6' } : undefined,
            border: { pt: 1, color: 'CFCFCF' },
            colspan: cell.colspan,
            rowspan: cell.rowspan
          }
        });
      }
      rows.push(tableRow);
    }

    const tableOptions = {
      x: position.x,
      y: position.y,
      w: position.w || this.options.slideWidth * 0.8,
      colW: [], // 自动计算列宽
      border: { pt: 1, color: 'CFCFCF' },
      fontFace: this.options.defaultFontFace,
      fontSize: 12
    };

    slide.addTable(rows, tableOptions);
  }

  /**
   * 添加列表元素
   * @param {Slide} slide - 幻灯片
   * @param {ElementData} element - 元素数据
   */
  addListElement(slide, element) {
    if (!element.listData || !element.listData.items) return;

    const position = this.calculatePosition(element.position);
    const textItems = [];

    const processListItems = (items, level = 0) => {
      for (const item of items) {
        textItems.push({
          text: item.text,
          options: {
            ...this.styleConverter.convertTextStyles(item.styles || {}),
            bullet: element.listData.isOrdered ?
              { type: 'number', startAt: 1 } :
              { code: '2022' }, // 实心圆点
            indentLevel: level
          }
        });

        // 处理嵌套列表
        if (item.children && item.children.length > 0) {
          processListItems(item.children, level + 1);
        }
      }
    };

    processListItems(element.listData.items);

    slide.addText(textItems, {
      x: position.x,
      y: position.y,
      w: position.w || this.options.slideWidth * 0.8,
      h: position.h || 'auto',
      fontFace: this.options.defaultFontFace,
      fontSize: this.options.defaultFontSize,
      valign: 'top'
    });
  }

  /**
   * 添加容器元素 (带背景的 div)
   * @param {Slide} slide - 幻灯片
   * @param {ElementData} element - 元素数据
   */
  addContainerElement(slide, element) {
    const position = this.calculatePosition(element.position);
    const shapeStyles = this.styleConverter.convertShapeStyles(element.styles);

    // 如果容器有背景色或边框，添加一个形状
    if (shapeStyles.fill || shapeStyles.line) {
      const shapeOptions = {
        x: position.x,
        y: position.y,
        w: position.w || 2,
        h: position.h || 1,
        ...shapeStyles
      };

      // 根据边框圆角决定形状类型
      const radius = this.styleConverter.parseBorderRadius(element.styles.borderRadius);
      if (radius > 0.5) {
        // 圆角很大，使用圆角矩形
        shapeOptions.rectRadius = Math.min(radius, 0.5);
      }

      slide.addShape('rect', shapeOptions);
    }
  }

  /**
   * 添加形状元素 (SVG 等)
   * @param {Slide} slide - 幻灯片
   * @param {ElementData} element - 元素数据
   */
  addShapeElement(slide, element) {
    const position = this.calculatePosition(element.position);
    const shapeStyles = this.styleConverter.convertShapeStyles(element.styles);

    // 尝试确定形状类型
    let shapeType = 'rect';
    const radius = this.styleConverter.parseBorderRadius(element.styles.borderRadius);

    if (radius > 0 && element.position.width === element.position.height) {
      // 正方形 + 大圆角 = 圆形
      if (radius >= element.position.width / 2) {
        shapeType = 'ellipse';
      }
    }

    slide.addShape(shapeType, {
      x: position.x,
      y: position.y,
      w: position.w || 1,
      h: position.h || 1,
      ...shapeStyles
    });
  }

  /**
   * 计算元素在幻灯片中的位置
   * @param {Object} position - 原始位置数据
   * @returns {Object} PPT 位置 {x, y, w, h}
   */
  calculatePosition(position) {
    if (!position) {
      return { x: 0.5, y: 0.5, w: 'auto', h: 'auto' };
    }

    return this.styleConverter.calculatePosition(position, this.containerSize);
  }

  /**
   * 构建动画配置
   * @param {Object} animation - 动画数据
   * @returns {Object} PptxGenJS 动画配置
   */
  buildAnimationOptions(animation) {
    if (!animation) return null;

    return {
      type: animation.type.toLowerCase(),
      delay: animation.delay || 0,
      duration: animation.duration || 1
    };
  }

  /**
   * 从 CSS url() 提取图片路径
   * @param {string} cssValue - CSS 值
   * @returns {string|null} 图片路径
   */
  extractImageUrl(cssValue) {
    if (!cssValue) return null;

    const match = cssValue.match(/url\(['"]?([^'"]+)['"]?\)/);
    return match ? match[1] : null;
  }

  /**
   * 导出演示文稿为 Blob
   * @returns {Promise<Blob>} PPT 文件 Blob
   */
  async exportToBlob() {
    if (!this.pptx) {
      throw new Error('No presentation to export. Call initPresentation first.');
    }

    return await this.pptx.write({ outputType: 'blob' });
  }

  /**
   * 导出并下载演示文稿
   * @param {string} filename - 文件名
   */
  async downloadPptx(filename = 'presentation.pptx') {
    if (!this.pptx) {
      throw new Error('No presentation to export. Call initPresentation first.');
    }

    await this.pptx.writeFile({ fileName: filename });
  }

  /**
   * 获取演示文稿的 Base64
   * @returns {Promise<string>} Base64 字符串
   */
  async exportToBase64() {
    if (!this.pptx) {
      throw new Error('No presentation to export. Call initPresentation first.');
    }

    return await this.pptx.write({ outputType: 'base64' });
  }
}

export default PptGenerator;
