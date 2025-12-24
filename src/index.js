/**
 * HTML to PPT 转换器 - 主入口
 */

import { HtmlToPptConverter } from './core/HtmlToPptConverter.js';

class App {
  constructor() {
    this.converter = new HtmlToPptConverter();
    this.currentHtml = '';
    this.previewData = [];
    this.logs = [];

    this.initElements();
    this.bindEvents();
    this.log('info', '应用初始化完成');
  }

  initElements() {
    // 上传相关
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.htmlInput = document.getElementById('htmlInput');
    this.uploadBtn = document.querySelector('.upload-btn');

    // 预览相关
    this.previewSection = document.getElementById('previewSection');
    this.previewContainer = document.getElementById('previewContainer');
    this.slideCount = document.getElementById('slideCount');

    // 选项相关
    this.optionsSection = document.getElementById('optionsSection');
    this.pptTitle = document.getElementById('pptTitle');
    this.pptAuthor = document.getElementById('pptAuthor');
    this.preserveAnimations = document.getElementById('preserveAnimations');
    this.preserveStyles = document.getElementById('preserveStyles');

    // 操作按钮
    this.actionSection = document.getElementById('actionSection');
    this.convertBtn = document.getElementById('convertBtn');
    this.resetBtn = document.getElementById('resetBtn');

    // 状态栏
    this.statusBar = document.getElementById('statusBar');
    this.statusIcon = document.getElementById('statusIcon');
    this.statusText = document.getElementById('statusText');
    this.progressDetail = document.getElementById('progressDetail');
    this.progressFill = document.getElementById('progressFill');

    // 日志区域
    this.logSection = document.getElementById('logSection');
    this.logContainer = document.getElementById('logContainer');
    this.logToggle = document.getElementById('logToggle');
  }

  bindEvents() {
    // 拖放事件
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.log('info', `拖放文件: ${files[0].name}`);
        this.handleFile(files[0]);
      }
    });

    // 点击上传按钮 - 阻止冒泡
    this.uploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });

    // 点击上传区域（非按钮区域）
    this.dropZone.addEventListener('click', (e) => {
      // 如果点击的是按钮或其子元素，不触发
      if (e.target.closest('.upload-btn')) {
        return;
      }
      this.fileInput.click();
    });

    // 文件选择
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.log('info', `选择文件: ${e.target.files[0].name}`);
        this.handleFile(e.target.files[0]);
      }
    });

    // 代码输入
    let inputTimeout;
    this.htmlInput.addEventListener('input', () => {
      clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
        if (this.htmlInput.value.trim()) {
          this.log('info', '检测到 HTML 代码输入');
        }
        this.handleHtmlInput(this.htmlInput.value);
      }, 500);
    });

    // 转换按钮
    this.convertBtn.addEventListener('click', () => {
      this.convertAndDownload();
    });

    // 重置按钮
    this.resetBtn.addEventListener('click', () => {
      this.reset();
    });

    // 日志折叠
    if (this.logToggle) {
      this.logToggle.addEventListener('click', () => {
        this.logContainer.classList.toggle('collapsed');
        this.logToggle.textContent = this.logContainer.classList.contains('collapsed') ? '展开' : '收起';
      });
    }
  }

  async handleFile(file) {
    if (!file.name.match(/\.(html|htm)$/i)) {
      this.log('error', `文件格式不支持: ${file.name}`);
      this.showStatus('error', '❌', '请上传 HTML 文件');
      return;
    }

    try {
      this.showStatus('processing', '⏳', '正在读取文件...');
      this.log('info', `开始读取文件: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

      const reader = new FileReader();

      reader.onload = (e) => {
        this.log('success', `文件读取成功: ${file.name}`);
        this.handleHtmlInput(e.target.result);
      };

      reader.onerror = (e) => {
        this.log('error', `文件读取失败: ${e.target.error}`);
        this.showStatus('error', '❌', `读取文件失败: ${e.target.error}`);
      };

      reader.readAsText(file);
    } catch (error) {
      this.log('error', `文件处理异常: ${error.message}`);
      this.showStatus('error', '❌', `读取文件失败: ${error.message}`);
    }
  }

  handleHtmlInput(html) {
    if (!html.trim()) {
      this.hidePreview();
      return;
    }

    this.currentHtml = html;
    this.log('info', `HTML 内容长度: ${html.length} 字符`);
    this.generatePreview(html);
  }

  generatePreview(html) {
    try {
      this.showStatus('processing', '⏳', '正在解析 HTML...');
      this.updateProgress(10, '解析中...');
      this.log('info', '开始解析 HTML 结构...');

      // 获取预览数据
      this.previewData = this.converter.getPreviewData(html);
      this.log('success', `识别到 ${this.previewData.length} 张幻灯片`);

      this.updateProgress(50, `识别到 ${this.previewData.length} 张幻灯片`);

      // 渲染预览
      this.renderPreview();
      this.log('info', '预览渲染完成');

      this.updateProgress(100, '解析完成');

      // 显示相关区域
      this.showSections();
      this.showLogSection();

      this.showStatus('success', '✅', `解析成功！识别到 ${this.previewData.length} 张幻灯片`);

      setTimeout(() => {
        this.hideStatus();
      }, 2000);
    } catch (error) {
      this.log('error', `解析失败: ${error.message}`);
      this.showStatus('error', '❌', `解析失败: ${error.message}`);
    }
  }

  renderPreview() {
    this.previewContainer.innerHTML = '';

    this.previewData.forEach((slide, index) => {
      const slideEl = document.createElement('div');
      slideEl.className = 'slide-preview fade-in';
      slideEl.style.animationDelay = `${index * 0.1}s`;

      // 设置背景
      if (slide.hasBackground) {
        slideEl.style.background = slide.backgroundColor || '#f0f0f0';
      }

      slideEl.innerHTML = `
        <div class="slide-number">${index + 1}</div>
        <div class="slide-title">${this.escapeHtml(slide.title)}</div>
        <div class="slide-content">${slide.elementCount} 个元素</div>
      `;

      this.previewContainer.appendChild(slideEl);
    });

    this.slideCount.textContent = `${this.previewData.length} 张幻灯片`;
  }

  showSections() {
    this.previewSection.style.display = 'block';
    this.optionsSection.style.display = 'block';
    this.actionSection.style.display = 'flex';

    // 添加动画效果
    [this.previewSection, this.optionsSection, this.actionSection].forEach((section, index) => {
      section.classList.add('fade-in');
      section.style.animationDelay = `${index * 0.1}s`;
    });
  }

  async convertAndDownload() {
    if (!this.currentHtml) {
      this.showStatus('error', '❌', '请先输入或上传 HTML');
      return;
    }

    const totalSlides = this.previewData.length;

    try {
      this.convertBtn.disabled = true;
      this.showStatus('processing', '⏳', '正在准备生成 PPT...');
      this.updateProgress(0, `0/${totalSlides} 页`);
      this.showLogSection();
      this.log('info', '开始 PPT 生成流程...');

      const options = {
        title: this.pptTitle.value || 'Presentation',
        author: this.pptAuthor.value || '',
        preserveAnimations: this.preserveAnimations.checked,
        preserveStyles: this.preserveStyles.checked,
        // 添加进度回调
        onProgress: (current, total, message) => {
          const percent = Math.round((current / total) * 100);
          this.updateProgress(percent, `${current}/${total} 页`);
          this.log('info', message || `处理第 ${current}/${total} 页`);
        }
      };

      this.log('info', `配置: 标题="${options.title}", 作者="${options.author}"`);
      this.log('info', `配置: 保留动画=${options.preserveAnimations}, 保留样式=${options.preserveStyles}`);

      this.updateProgress(5, '初始化...');
      this.log('info', '初始化 PPT 文档...');

      // 转换
      const blob = await this.converter.convert(this.currentHtml, options);

      this.log('success', `PPT 生成成功，文件大小: ${(blob.size / 1024).toFixed(2)} KB`);
      this.updateProgress(95, '准备下载...');

      // 下载
      const filename = `${options.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.pptx`;
      this.converter.downloadBlob(blob, filename);
      this.log('success', `文件下载已触发: ${filename}`);

      this.updateProgress(100, '完成');
      this.showStatus('success', '✅', `转换成功！文件 "${filename}" 已开始下载`);

      setTimeout(() => {
        this.hideStatus();
        this.convertBtn.disabled = false;
      }, 5000);
    } catch (error) {
      console.error('Conversion error:', error);
      this.log('error', `转换失败: ${error.message}`);
      this.log('error', `错误堆栈: ${error.stack}`);
      this.showStatus('error', '❌', `转换失败: ${error.message}`);
      this.convertBtn.disabled = false;
    }
  }

  reset() {
    this.currentHtml = '';
    this.previewData = [];
    this.htmlInput.value = '';
    this.fileInput.value = '';
    this.pptTitle.value = '';
    this.pptAuthor.value = '';
    this.logs = [];

    this.hidePreview();
    this.hideStatus();
    this.hideLogSection();
    this.log('info', '已重置所有内容');
  }

  hidePreview() {
    this.previewSection.style.display = 'none';
    this.optionsSection.style.display = 'none';
    this.actionSection.style.display = 'none';
  }

  showStatus(type, icon, text) {
    this.statusBar.style.display = 'block';
    this.statusBar.className = `status-bar ${type}`;
    this.statusIcon.textContent = icon;
    this.statusText.textContent = text;

    if (type === 'processing') {
      this.statusBar.classList.add('processing');
    }
  }

  hideStatus() {
    this.statusBar.style.display = 'none';
    this.progressFill.style.width = '0%';
    this.progressDetail.textContent = '';
  }

  updateProgress(percent, detail = '') {
    this.progressFill.style.width = `${percent}%`;
    if (detail) {
      this.progressDetail.textContent = detail;
    }
  }

  showLogSection() {
    if (this.logSection) {
      this.logSection.style.display = 'block';
    }
  }

  hideLogSection() {
    if (this.logSection) {
      this.logSection.style.display = 'none';
    }
    if (this.logContainer) {
      this.logContainer.innerHTML = '';
    }
  }

  log(type, message) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

    const logEntry = { type, message, time: timeStr };
    this.logs.push(logEntry);

    // 控制台输出
    const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
    console[consoleMethod](`[${timeStr}] ${message}`);

    // UI 输出
    if (this.logContainer) {
      const entryEl = document.createElement('div');
      entryEl.className = `log-entry ${type}`;
      entryEl.innerHTML = `<span class="log-time">[${timeStr}]</span>${this.escapeHtml(message)}`;
      this.logContainer.appendChild(entryEl);
      this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
