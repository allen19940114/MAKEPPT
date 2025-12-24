/**
 * 动画转换器
 * 将 CSS 动画/transition 转换为 PPT 动画效果
 */

export class AnimationConverter {
  constructor() {
    // CSS 动画关键词到 PPT 动画的映射
    this.animationMap = {
      // 入场动画
      'fadeIn': { type: 'Fade' },
      'fadeInUp': { type: 'Float', direction: 'Up' },
      'fadeInDown': { type: 'Float', direction: 'Down' },
      'fadeInLeft': { type: 'Float', direction: 'Left' },
      'fadeInRight': { type: 'Float', direction: 'Right' },
      'slideInUp': { type: 'Fly', direction: 'Up' },
      'slideInDown': { type: 'Fly', direction: 'Down' },
      'slideInLeft': { type: 'Fly', direction: 'Left' },
      'slideInRight': { type: 'Fly', direction: 'Right' },
      'zoomIn': { type: 'Zoom', subtype: 'In' },
      'zoomOut': { type: 'Zoom', subtype: 'Out' },
      'bounceIn': { type: 'Bounce' },
      'rotateIn': { type: 'Spin' },
      'flipInX': { type: 'Flip', direction: 'Vertical' },
      'flipInY': { type: 'Flip', direction: 'Horizontal' },

      // 强调动画
      'pulse': { type: 'Pulse', category: 'emphasis' },
      'bounce': { type: 'Bounce', category: 'emphasis' },
      'shake': { type: 'Shake', category: 'emphasis' },
      'swing': { type: 'Swing', category: 'emphasis' },
      'tada': { type: 'Teeter', category: 'emphasis' },
      'wobble': { type: 'Wobble', category: 'emphasis' },
      'flash': { type: 'Flash', category: 'emphasis' },

      // 退出动画
      'fadeOut': { type: 'Fade', category: 'exit' },
      'fadeOutUp': { type: 'Float', direction: 'Up', category: 'exit' },
      'fadeOutDown': { type: 'Float', direction: 'Down', category: 'exit' },
      'slideOutUp': { type: 'Fly', direction: 'Up', category: 'exit' },
      'slideOutDown': { type: 'Fly', direction: 'Down', category: 'exit' },
      'zoomOut': { type: 'Zoom', subtype: 'Out', category: 'exit' }
    };

    // 时间函数映射
    this.easingMap = {
      'linear': 'linear',
      'ease': 'easeInOut',
      'ease-in': 'easeIn',
      'ease-out': 'easeOut',
      'ease-in-out': 'easeInOut'
    };
  }

  /**
   * 解析 CSS animation 属性
   * @param {string} animation - CSS animation 值
   * @returns {Array<AnimationData>} 动画数据数组
   */
  parseAnimation(animation) {
    if (!animation || animation === 'none') return [];

    const animations = [];

    // 可能有多个动画，用逗号分隔
    const animationParts = animation.split(',').map(a => a.trim());

    for (const part of animationParts) {
      const anim = this.parseSingleAnimation(part);
      if (anim) {
        animations.push(anim);
      }
    }

    return animations;
  }

  /**
   * 解析单个动画声明
   * @param {string} animation - 单个 animation 声明
   * @returns {AnimationData|null} 动画数据
   */
  parseSingleAnimation(animation) {
    // animation: name duration timing-function delay iteration-count direction fill-mode play-state
    const parts = animation.split(/\s+/);

    if (parts.length === 0) return null;

    const animData = {
      name: null,
      duration: 1000, // 默认 1 秒
      delay: 0,
      easing: 'easeInOut',
      iterations: 1,
      direction: 'normal'
    };

    let foundDuration = false;

    for (const part of parts) {
      if (part.endsWith('s') && !isNaN(parseFloat(part))) {
        // 时间值
        const value = parseFloat(part);
        const ms = part.includes('ms') ? value : value * 1000;

        if (foundDuration) {
          // 第二个时间值是 delay
          animData.delay = ms;
        } else {
          // 第一个时间值是 duration
          animData.duration = ms;
          foundDuration = true;
        }
      } else if (this.easingMap[part]) {
        animData.easing = this.easingMap[part];
      } else if (part === 'infinite') {
        animData.iterations = -1;
      } else if (!isNaN(parseInt(part))) {
        animData.iterations = parseInt(part);
      } else if (['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(part)) {
        animData.direction = part;
      } else if (!animData.name && !['forwards', 'backwards', 'both', 'running', 'paused'].includes(part)) {
        animData.name = part;
      }
    }

    return animData;
  }

  /**
   * 解析 CSS transition 属性
   * @param {string} transition - CSS transition 值
   * @returns {Array<TransitionData>} 过渡数据数组
   */
  parseTransition(transition) {
    if (!transition || transition === 'none' || transition === 'all 0s ease 0s') {
      return [];
    }

    const transitions = [];
    const parts = transition.split(',').map(t => t.trim());

    for (const part of parts) {
      const trans = this.parseSingleTransition(part);
      if (trans) {
        transitions.push(trans);
      }
    }

    return transitions;
  }

  /**
   * 解析单个过渡声明
   * @param {string} transition - 单个 transition 声明
   * @returns {TransitionData|null} 过渡数据
   */
  parseSingleTransition(transition) {
    const parts = transition.split(/\s+/);

    if (parts.length === 0) return null;

    const transData = {
      property: 'all',
      duration: 0,
      delay: 0,
      easing: 'ease'
    };

    for (const part of parts) {
      if (part.endsWith('s') && !isNaN(parseFloat(part))) {
        const value = parseFloat(part);
        const ms = part.includes('ms') ? value : value * 1000;

        if (transData.duration === 0) {
          transData.duration = ms;
        } else {
          transData.delay = ms;
        }
      } else if (this.easingMap[part]) {
        transData.easing = this.easingMap[part];
      } else if (!['none', 'all'].includes(part) && !part.includes('(')) {
        transData.property = part;
      }
    }

    return transData.duration > 0 ? transData : null;
  }

  /**
   * 分析 CSS 变换推断可能的动画效果
   * @param {string} transform - CSS transform 值
   * @returns {AnimationData|null} 推断的动画
   */
  inferAnimationFromTransform(transform) {
    if (!transform || transform === 'none') return null;

    // 根据 transform 类型推断动画
    if (transform.includes('translateY')) {
      const match = transform.match(/translateY\((-?\d+)/);
      if (match) {
        const value = parseInt(match[1]);
        return {
          type: 'Fly',
          direction: value < 0 ? 'Up' : 'Down'
        };
      }
    }

    if (transform.includes('translateX')) {
      const match = transform.match(/translateX\((-?\d+)/);
      if (match) {
        const value = parseInt(match[1]);
        return {
          type: 'Fly',
          direction: value < 0 ? 'Left' : 'Right'
        };
      }
    }

    if (transform.includes('scale')) {
      return { type: 'Zoom', subtype: 'In' };
    }

    if (transform.includes('rotate')) {
      return { type: 'Spin' };
    }

    return null;
  }

  /**
   * 将 CSS 动画转换为 PPT 动画配置
   * @param {AnimationData} animData - 动画数据
   * @returns {Object|null} PPT 动画配置
   */
  convertToPptAnimation(animData) {
    if (!animData || !animData.name) return null;

    // 查找映射的动画类型
    const pptAnim = this.animationMap[animData.name];

    if (!pptAnim) {
      // 尝试模糊匹配
      for (const [key, value] of Object.entries(this.animationMap)) {
        if (animData.name.toLowerCase().includes(key.toLowerCase())) {
          return this.buildPptAnimConfig(value, animData);
        }
      }
      // 默认使用淡入
      return this.buildPptAnimConfig({ type: 'Fade' }, animData);
    }

    return this.buildPptAnimConfig(pptAnim, animData);
  }

  /**
   * 构建 PPT 动画配置对象
   * @param {Object} pptAnim - PPT 动画类型信息
   * @param {AnimationData} animData - CSS 动画数据
   * @returns {Object} PPT 动画配置
   */
  buildPptAnimConfig(pptAnim, animData) {
    const config = {
      type: pptAnim.type,
      delay: (animData.delay || 0) / 1000, // 转换为秒
      duration: animData.duration / 1000 || 1
    };

    if (pptAnim.direction) {
      config.direction = pptAnim.direction;
    }

    if (pptAnim.subtype) {
      config.subtype = pptAnim.subtype;
    }

    // 设置动画类别
    if (pptAnim.category === 'exit') {
      config.category = 'exit';
    } else if (pptAnim.category === 'emphasis') {
      config.category = 'emphasis';
    } else {
      config.category = 'entrance';
    }

    return config;
  }

  /**
   * 获取幻灯片切换效果
   * @param {string} transitionStyle - 过渡样式描述
   * @returns {string} PPT 切换效果名称
   */
  getSlideTransition(transitionStyle) {
    const transitionMap = {
      'fade': 'fade',
      'slide': 'slide',
      'push': 'push',
      'wipe': 'wipe',
      'split': 'split',
      'reveal': 'reveal',
      'random': 'random',
      'zoom': 'zoom',
      'cube': 'cube',
      'box': 'box',
      'blinds': 'blinds',
      'checkerboard': 'checkerboard',
      'circle': 'circle',
      'dissolve': 'dissolve'
    };

    const lower = (transitionStyle || '').toLowerCase();
    for (const [key, value] of Object.entries(transitionMap)) {
      if (lower.includes(key)) {
        return value;
      }
    }

    return 'fade'; // 默认淡入淡出
  }

  /**
   * 分析元素样式推断动画
   * @param {Object} styles - 元素样式
   * @returns {Array<Object>} PPT 动画配置数组
   */
  analyzeAndConvert(styles) {
    const animations = [];

    // 解析 animation 属性
    if (styles.animation) {
      const cssAnimations = this.parseAnimation(styles.animation);
      for (const anim of cssAnimations) {
        const pptAnim = this.convertToPptAnimation(anim);
        if (pptAnim) {
          animations.push(pptAnim);
        }
      }
    }

    // 解析 transition 并推断动画
    if (styles.transition) {
      const transitions = this.parseTransition(styles.transition);
      for (const trans of transitions) {
        // 根据 transition 属性推断动画类型
        if (trans.property === 'opacity') {
          animations.push({
            type: 'Fade',
            category: 'entrance',
            duration: trans.duration / 1000,
            delay: trans.delay / 1000
          });
        } else if (trans.property === 'transform') {
          const inferredAnim = this.inferAnimationFromTransform(styles.transform);
          if (inferredAnim) {
            animations.push({
              ...inferredAnim,
              category: 'entrance',
              duration: trans.duration / 1000,
              delay: trans.delay / 1000
            });
          }
        }
      }
    }

    return animations;
  }
}

export default AnimationConverter;
