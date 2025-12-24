/**
 * StyleConverter 单元测试
 */

import { StyleConverter } from '../../src/core/StyleConverter.js';

describe('StyleConverter', () => {
  let converter;

  beforeEach(() => {
    converter = new StyleConverter();
  });

  describe('pxToInches', () => {
    test('should convert pixels to inches correctly', () => {
      expect(converter.pxToInches(96)).toBe(1);
      expect(converter.pxToInches(48)).toBe(0.5);
      expect(converter.pxToInches('192px')).toBe(2);
    });
  });

  describe('pxToPoints', () => {
    test('should convert pixels to points correctly', () => {
      expect(converter.pxToPoints(16)).toBe(12);
      expect(converter.pxToPoints(24)).toBe(18);
      expect(converter.pxToPoints('32')).toBe(24);
    });
  });

  describe('parseFontSize', () => {
    test('should parse px font size', () => {
      expect(converter.parseFontSize('16px')).toBe(12);
      expect(converter.parseFontSize('24px')).toBe(18);
    });

    test('should parse pt font size', () => {
      expect(converter.parseFontSize('18pt')).toBe(18);
      expect(converter.parseFontSize('24pt')).toBe(24);
    });

    test('should parse em font size', () => {
      expect(converter.parseFontSize('1em')).toBe(12);
      expect(converter.parseFontSize('2em')).toBe(24);
    });

    test('should return default for invalid input', () => {
      expect(converter.parseFontSize(null)).toBe(18);
      expect(converter.parseFontSize(undefined)).toBe(18);
    });
  });

  describe('parseFontFamily', () => {
    test('should parse single font', () => {
      expect(converter.parseFontFamily('Arial')).toBe('Arial');
      expect(converter.parseFontFamily('"Times New Roman"')).toBe('Times New Roman');
    });

    test('should parse font stack and return first', () => {
      expect(converter.parseFontFamily('Arial, Helvetica, sans-serif')).toBe('Arial');
    });

    test('should map common fonts', () => {
      expect(converter.parseFontFamily('Helvetica')).toBe('Arial');
      expect(converter.parseFontFamily('sans-serif')).toBe('Arial');
      expect(converter.parseFontFamily('serif')).toBe('Times New Roman');
    });

    test('should return default for empty input', () => {
      expect(converter.parseFontFamily('')).toBe('Arial');
      expect(converter.parseFontFamily(null)).toBe('Arial');
    });
  });

  describe('convertColor', () => {
    test('should convert hex colors', () => {
      expect(converter.convertColor('#FF0000')).toBe('FF0000');
      expect(converter.convertColor('#f00')).toBe('FF0000');
      expect(converter.convertColor('#abc')).toBe('AABBCC');
    });

    test('should convert rgb colors', () => {
      expect(converter.convertColor('rgb(255, 0, 0)')).toBe('FF0000');
      expect(converter.convertColor('rgb(0, 255, 0)')).toBe('00FF00');
      expect(converter.convertColor('rgb(0, 0, 255)')).toBe('0000FF');
    });

    test('should convert rgba colors', () => {
      expect(converter.convertColor('rgba(255, 128, 0, 0.5)')).toBe('FF8000');
    });

    test('should convert named colors', () => {
      expect(converter.convertColor('white')).toBe('FFFFFF');
      expect(converter.convertColor('black')).toBe('000000');
      expect(converter.convertColor('red')).toBe('FF0000');
    });

    test('should return null for invalid input', () => {
      expect(converter.convertColor(null)).toBe(null);
      expect(converter.convertColor('')).toBe(null);
    });
  });

  describe('isBold', () => {
    test('should detect bold weight', () => {
      expect(converter.isBold('bold')).toBe(true);
      expect(converter.isBold('700')).toBe(true);
      expect(converter.isBold('800')).toBe(true);
      expect(converter.isBold('900')).toBe(true);
    });

    test('should detect normal weight', () => {
      expect(converter.isBold('normal')).toBe(false);
      expect(converter.isBold('400')).toBe(false);
      expect(converter.isBold('500')).toBe(false);
    });
  });

  describe('isItalic', () => {
    test('should detect italic style', () => {
      expect(converter.isItalic('italic')).toBe(true);
      expect(converter.isItalic('oblique')).toBe(true);
    });

    test('should detect normal style', () => {
      expect(converter.isItalic('normal')).toBe(false);
      expect(converter.isItalic('')).toBe(false);
    });
  });

  describe('parseTextAlign', () => {
    test('should parse standard alignments', () => {
      expect(converter.parseTextAlign('left')).toBe('left');
      expect(converter.parseTextAlign('center')).toBe('center');
      expect(converter.parseTextAlign('right')).toBe('right');
      expect(converter.parseTextAlign('justify')).toBe('justify');
    });

    test('should map start/end to left/right', () => {
      expect(converter.parseTextAlign('start')).toBe('left');
      expect(converter.parseTextAlign('end')).toBe('right');
    });
  });

  describe('convertBorder', () => {
    test('should convert solid border', () => {
      const styles = {
        borderStyle: 'solid',
        borderWidth: '2px',
        borderColor: '#000000'
      };
      const result = converter.convertBorder(styles);
      expect(result).toEqual({
        type: 'solid',
        color: '000000',
        pt: 2
      });
    });

    test('should convert dashed border', () => {
      const styles = {
        borderStyle: 'dashed',
        borderWidth: '1px',
        borderColor: 'red'
      };
      const result = converter.convertBorder(styles);
      expect(result.type).toBe('dash');
    });

    test('should return null for no border', () => {
      expect(converter.convertBorder({ borderStyle: 'none' })).toBe(null);
      expect(converter.convertBorder({})).toBe(null);
    });
  });

  describe('convertTextStyles', () => {
    test('should convert complete text styles', () => {
      const styles = {
        fontFamily: 'Arial',
        fontSize: '24px',
        fontWeight: 'bold',
        fontStyle: 'italic',
        color: '#FF0000',
        textDecoration: 'underline',
        textAlign: 'center'
      };

      const result = converter.convertTextStyles(styles);

      expect(result.fontFace).toBe('Arial');
      expect(result.fontSize).toBe(18);
      expect(result.bold).toBe(true);
      expect(result.italic).toBe(true);
      expect(result.color).toBe('FF0000');
      expect(result.underline).toBe(true);
      expect(result.align).toBe('center');
    });
  });
});
