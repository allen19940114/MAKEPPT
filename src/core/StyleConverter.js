/**
 * 样式转换器
 * 将 CSS 样式转换为 PptxGenJS 兼容的格式
 */

export class StyleConverter {
  constructor() {
    // PPT 标准尺寸 (英寸)
    this.slideWidth = 13.333;  // 16:9 默认宽度
    this.slideHeight = 7.5;

    // 默认 DPI
    this.dpi = 96;

    // 缩放参数 (由 PptGenerator 设置)
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // 字体映射 - 优先使用跨平台字体
    this.fontMap = {
      // 无衬线字体 (Sans-serif)
      'Arial': 'Arial',
      'Helvetica': 'Arial',
      'Helvetica Neue': 'Arial',
      '-apple-system': 'Arial',
      'BlinkMacSystemFont': 'Arial',
      'Segoe UI': 'Arial',
      'Roboto': 'Arial',
      'sans-serif': 'Arial',
      // 衬线字体 (Serif)
      'Times New Roman': 'Times New Roman',
      'Times': 'Times New Roman',
      'Georgia': 'Georgia',
      'serif': 'Times New Roman',
      // 等宽字体 (Monospace)
      'Verdana': 'Verdana',
      'Courier New': 'Courier New',
      'Courier': 'Courier New',
      'monospace': 'Courier New',
      'Consolas': 'Courier New',
      'Monaco': 'Courier New',
      // 中文字体 - 映射到通用中文字体
      'Microsoft YaHei': 'Microsoft YaHei',
      '微软雅黑': 'Microsoft YaHei',
      'SimHei': 'SimHei',
      '黑体': 'SimHei',
      'SimSun': 'SimSun',
      '宋体': 'SimSun',
      'PingFang SC': 'PingFang SC',
      'Hiragino Sans GB': 'Hiragino Sans GB',
      'STHeiti': 'SimHei',
      'Noto Sans SC': 'Microsoft YaHei',
      'Source Han Sans SC': 'Microsoft YaHei'
    };
  }

  /**
   * 将像素转换为英寸
   * @param {number|string} px - 像素值
   * @returns {number} 英寸值
   */
  pxToInches(px) {
    const value = typeof px === 'string' ? parseFloat(px) : px;
    return value / this.dpi;
  }

  /**
   * 将像素转换为点 (用于字体大小)
   * @param {number|string} px - 像素值
   * @returns {number} 点值
   */
  pxToPoints(px) {
    const value = typeof px === 'string' ? parseFloat(px) : px;
    return value * 0.75; // 1px = 0.75pt
  }

  /**
   * 解析字体大小
   * @param {string} fontSize - CSS 字体大小
   * @returns {number} 点值
   */
  parseFontSize(fontSize) {
    if (!fontSize) return 18; // 默认 18pt

    const value = parseFloat(fontSize);
    let points;

    if (fontSize.includes('px')) {
      points = this.pxToPoints(value);
    } else if (fontSize.includes('pt')) {
      points = value;
    } else if (fontSize.includes('em') || fontSize.includes('rem')) {
      points = value * 16 * 0.75; // 假设 1em = 16px
    } else if (fontSize.includes('%')) {
      points = (value / 100) * 16 * 0.75;
    } else {
      points = value || 18;
    }

    // 不应用缩放因子！字体大小应保持原始比例
    // 位置和尺寸需要缩放，但字体大小不需要

    // 确保字体大小在合理范围内
    // 最小 8pt 保证可读性，最大 96pt 支持大标题
    return Math.max(8, Math.min(points, 96));
  }

  /**
   * 解析字体家族
   * @param {string} fontFamily - CSS 字体家族
   * @returns {string} PPT 兼容的字体名
   */
  parseFontFamily(fontFamily) {
    if (!fontFamily) return 'Arial';

    // 获取第一个字体
    const firstFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '');

    // 查找映射
    return this.fontMap[firstFont] || firstFont;
  }

  /**
   * 转换颜色为 PPT 格式
   * @param {string} color - CSS 颜色值
   * @returns {string} 6位 hex 颜色值 (无 #)
   */
  convertColor(color) {
    if (!color) return null;

    // 移除 # 号
    if (color.startsWith('#')) {
      color = color.substring(1);
      // 处理 3 位 hex
      if (color.length === 3) {
        color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
      }
      return color.toUpperCase();
    }

    // RGB/RGBA 格式
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `${r}${g}${b}`.toUpperCase();
    }

    // 命名颜色映射
    const colorNames = {
      'white': 'FFFFFF',
      'black': '000000',
      'red': 'FF0000',
      'green': '00FF00',
      'blue': '0000FF',
      'yellow': 'FFFF00',
      'cyan': '00FFFF',
      'magenta': 'FF00FF',
      'gray': '808080',
      'grey': '808080'
    };

    return colorNames[color.toLowerCase()] || null;
  }

  /**
   * 解析字重
   * @param {string|number} fontWeight - CSS 字重
   * @returns {boolean} 是否粗体
   */
  isBold(fontWeight) {
    if (!fontWeight) return false;
    const weight = parseInt(fontWeight);
    return fontWeight === 'bold' || weight >= 700;
  }

  /**
   * 解析字体样式
   * @param {string} fontStyle - CSS 字体样式
   * @returns {boolean} 是否斜体
   */
  isItalic(fontStyle) {
    return fontStyle === 'italic' || fontStyle === 'oblique';
  }

  /**
   * 解析文本装饰
   * @param {string} textDecoration - CSS 文本装饰
   * @returns {Object} 装饰对象
   */
  parseTextDecoration(textDecoration) {
    if (!textDecoration) return {};

    return {
      underline: textDecoration.includes('underline'),
      strike: textDecoration.includes('line-through')
    };
  }

  /**
   * 解析文本对齐
   * @param {string} textAlign - CSS 文本对齐
   * @returns {string} PPT 对齐值
   */
  parseTextAlign(textAlign) {
    const alignMap = {
      'left': 'left',
      'center': 'center',
      'right': 'right',
      'justify': 'justify',
      'start': 'left',
      'end': 'right'
    };
    return alignMap[textAlign] || 'left';
  }

  /**
   * 转换边框样式
   * @param {Object} styles - CSS 样式对象
   * @returns {Object} PPT 边框配置
   */
  convertBorder(styles) {
    if (!styles.borderStyle || styles.borderStyle === 'none') {
      return null;
    }

    const width = parseFloat(styles.borderWidth) || 0;

    // 只有当边框宽度大于 0 时才返回边框配置
    // 浏览器默认给元素设置 borderStyle: 'solid' 但 borderWidth: 0
    if (width <= 0) {
      return null;
    }

    return {
      type: styles.borderStyle === 'dashed' ? 'dash' : 'solid',
      color: this.convertColor(styles.borderColor),
      pt: width
    };
  }

  /**
   * 解析边框圆角
   * @param {string} borderRadius - CSS 边框圆角
   * @returns {number} 圆角半径 (像素值，不转换)
   */
  parseBorderRadius(borderRadius) {
    if (!borderRadius) return 0;
    const value = parseFloat(borderRadius);
    // 返回像素值，在 convertShapeStyles 中统一转换为英寸
    return value;
  }

  /**
   * 转换阴影
   * @param {string} boxShadow - CSS 阴影
   * @returns {Object|null} PPT 阴影配置
   */
  convertShadow(boxShadow) {
    if (!boxShadow || boxShadow === 'none') return null;

    // 解析 box-shadow: h-offset v-offset blur spread color
    const match = boxShadow.match(/(-?\d+)px\s+(-?\d+)px\s+(\d+)?px?\s*(\d+)?px?\s*(.*)?/);
    if (!match) return null;

    const [, hOffset, vOffset, blur, , color] = match;

    return {
      type: 'outer',
      blur: parseFloat(blur) || 0,
      offset: Math.sqrt(parseFloat(hOffset) ** 2 + parseFloat(vOffset) ** 2),
      angle: Math.atan2(parseFloat(vOffset), parseFloat(hOffset)) * (180 / Math.PI) + 90,
      color: color ? this.convertColor(color.trim()) : '000000',
      opacity: 0.35
    };
  }

  /**
   * 转换渐变为 PPT 格式
   * @param {Object} gradient - 渐变数据
   * @returns {Object|null} PPT 渐变配置
   */
  convertGradient(gradient) {
    if (!gradient) return null;

    const colors = [];
    const value = gradient.value;

    // 解析颜色和位置
    const colorStops = value.match(/(#[a-f0-9]{3,6}|rgba?\([^)]+\)|[a-z]+)\s*(\d+%)?/gi);

    if (colorStops) {
      colorStops.forEach((stop, index) => {
        const colorMatch = stop.match(/(#[a-f0-9]{3,6}|rgba?\([^)]+\)|[a-z]+)/i);
        const positionMatch = stop.match(/(\d+)%/);

        if (colorMatch) {
          colors.push({
            color: this.convertColor(colorMatch[1]),
            position: positionMatch ? parseInt(positionMatch[1]) : (index * 100) / (colorStops.length - 1)
          });
        }
      });
    }

    if (colors.length < 2) return null;

    // 解析角度
    let angle = 90; // 默认从上到下
    const angleMatch = value.match(/(\d+)deg/);
    if (angleMatch) {
      angle = parseInt(angleMatch[1]);
    }

    return {
      type: gradient.type,
      angle,
      colors
    };
  }

  /**
   * 计算元素在幻灯片中的位置 (英寸)
   * 使用等比例缩放，保持 HTML 原始布局
   * @param {Object} position - 位置数据 {x, y, width, height} (像素)
   * @param {Object} containerSize - 容器尺寸 {width, height} (像素)
   * @returns {Object} PPT 位置 {x, y, w, h} (英寸)
   */
  calculatePosition(position, containerSize) {
    // 先将像素转换为英寸，然后计算缩放
    const posXInches = this.pxToInches(position.x);
    const posYInches = this.pxToInches(position.y);
    const posWInches = this.pxToInches(position.width);
    const posHInches = this.pxToInches(position.height);

    const containerWInches = this.pxToInches(containerSize.width);
    const containerHInches = this.pxToInches(containerSize.height);

    // 计算缩放比例使内容适应幻灯片
    const scaleX = this.slideWidth / containerWInches;
    const scaleY = this.slideHeight / containerHInches;
    const scale = Math.min(scaleX, scaleY);

    // 计算居中偏移
    const scaledWidth = containerWInches * scale;
    const scaledHeight = containerHInches * scale;
    const offsetX = (this.slideWidth - scaledWidth) / 2;
    const offsetY = (this.slideHeight - scaledHeight) / 2;

    return {
      x: posXInches * scale + offsetX,
      y: posYInches * scale + offsetY,
      w: posWInches * scale,
      h: posHInches * scale
    };
  }

  /**
   * 转换完整的文本样式
   * @param {Object} styles - CSS 样式对象
   * @returns {Object} PPT 文本配置
   */
  convertTextStyles(styles) {
    const decoration = this.parseTextDecoration(styles.textDecoration);

    return {
      fontFace: this.parseFontFamily(styles.fontFamily),
      fontSize: this.parseFontSize(styles.fontSize),
      color: this.convertColor(styles.color) || '000000',
      bold: this.isBold(styles.fontWeight),
      italic: this.isItalic(styles.fontStyle),
      underline: decoration.underline || false,
      strike: decoration.strike || false,
      align: this.parseTextAlign(styles.textAlign)
    };
  }

  /**
   * 转换完整的形状样式
   * @param {Object} styles - CSS 样式对象
   * @returns {Object} PPT 形状配置
   */
  convertShapeStyles(styles) {
    const config = {};

    // 优先检查渐变背景
    if (styles.backgroundImage && styles.backgroundImage.includes('gradient')) {
      const gradientData = this.parseGradientFromStyle(styles.backgroundImage);
      if (gradientData) {
        config.fill = gradientData;
      }
    }

    // 如果没有渐变，使用纯色填充
    if (!config.fill) {
      const bgColor = this.convertColor(styles.backgroundColor);
      if (bgColor) {
        config.fill = { color: bgColor };
      }
    }

    // 边框
    const border = this.convertBorder(styles);
    if (border) {
      config.line = border;
    }

    // 阴影
    const shadow = this.convertShadow(styles.boxShadow);
    if (shadow) {
      config.shadow = shadow;
    }

    // 圆角 - 转换为英寸单位（PptxGenJS 需要英寸）
    const radiusPx = this.parseBorderRadius(styles.borderRadius);
    if (radiusPx > 0) {
      // radiusPx 是像素值，转换为英寸
      const radiusInches = this.pxToInches(radiusPx);
      // 限制圆角范围：最小 0.02 英寸，最大 0.5 英寸
      config.rectRadius = Math.max(0.02, Math.min(radiusInches, 0.5));
    }

    // 透明度
    if (styles.opacity && styles.opacity !== '1') {
      config.fill = config.fill || {};
      config.fill.transparency = (1 - parseFloat(styles.opacity)) * 100;
    }

    return config;
  }

  /**
   * 从 CSS 背景样式解析渐变
   * @param {string} backgroundImage - CSS backgroundImage 值
   * @returns {Object|null} PptxGenJS 渐变配置
   */
  parseGradientFromStyle(backgroundImage) {
    if (!backgroundImage || !backgroundImage.includes('gradient')) return null;

    // 匹配 linear-gradient
    const linearMatch = backgroundImage.match(/linear-gradient\(([^)]+)\)/);
    if (linearMatch) {
      const parts = linearMatch[1];

      // 解析方向和颜色
      let angle = 90; // 默认从左到右
      const colors = [];

      // 检查方向
      if (parts.includes('to right')) {
        angle = 90;
      } else if (parts.includes('to left')) {
        angle = 270;
      } else if (parts.includes('to bottom')) {
        angle = 180;
      } else if (parts.includes('to top')) {
        angle = 0;
      } else if (parts.includes('to bottom right') || parts.includes('to right bottom')) {
        angle = 135;
      } else if (parts.includes('to top right') || parts.includes('to right top')) {
        angle = 45;
      } else {
        // 尝试解析角度值
        const angleMatch = parts.match(/(\d+)deg/);
        if (angleMatch) {
          angle = parseInt(angleMatch[1]);
        }
      }

      // 解析颜色
      const colorRegex = /(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+(?:\s+\d+)?)/g;
      let match;
      while ((match = colorRegex.exec(parts)) !== null) {
        const colorStr = match[1].trim();
        // 跳过方向关键词
        if (['to', 'right', 'left', 'top', 'bottom', 'deg'].some(k => colorStr.includes(k))) {
          continue;
        }
        const color = this.convertColor(colorStr);
        if (color) {
          colors.push({ color, position: colors.length === 0 ? 0 : 100 });
        }
      }

      if (colors.length >= 2) {
        // 均匀分布颜色位置
        colors.forEach((c, i) => {
          c.position = Math.round((i / (colors.length - 1)) * 100);
        });

        return {
          type: 'linear',
          rotate: angle,
          stops: colors.map(c => ({ color: c.color, position: c.position }))
        };
      }
    }

    return null;
  }
}

export default StyleConverter;
