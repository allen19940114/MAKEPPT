/**
 * AnimationConverter 单元测试
 */

import { AnimationConverter } from '../../src/core/AnimationConverter.js';

describe('AnimationConverter', () => {
  let converter;

  beforeEach(() => {
    converter = new AnimationConverter();
  });

  describe('parseAnimation', () => {
    test('should parse simple animation', () => {
      const result = converter.parseAnimation('fadeIn 1s');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('fadeIn');
      expect(result[0].duration).toBe(1000);
    });

    test('should parse animation with timing function', () => {
      const result = converter.parseAnimation('slideIn 2s ease-in');
      expect(result[0].duration).toBe(2000);
      expect(result[0].easing).toBe('easeIn');
    });

    test('should parse animation with delay', () => {
      const result = converter.parseAnimation('fadeIn 1s 0.5s');
      expect(result[0].duration).toBe(1000);
      expect(result[0].delay).toBe(500);
    });

    test('should parse multiple animations', () => {
      const result = converter.parseAnimation('fadeIn 1s, slideUp 2s');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('fadeIn');
      expect(result[1].name).toBe('slideUp');
    });

    test('should return empty array for none', () => {
      expect(converter.parseAnimation('none')).toEqual([]);
      expect(converter.parseAnimation('')).toEqual([]);
      expect(converter.parseAnimation(null)).toEqual([]);
    });
  });

  describe('parseTransition', () => {
    test('should parse simple transition', () => {
      const result = converter.parseTransition('opacity 0.3s');
      expect(result).toHaveLength(1);
      expect(result[0].property).toBe('opacity');
      expect(result[0].duration).toBe(300);
    });

    test('should parse transition with easing', () => {
      const result = converter.parseTransition('transform 0.5s ease-out');
      expect(result[0].duration).toBe(500);
      expect(result[0].easing).toBe('easeOut');
    });

    test('should return empty for none', () => {
      expect(converter.parseTransition('none')).toEqual([]);
      expect(converter.parseTransition('all 0s ease 0s')).toEqual([]);
    });
  });

  describe('convertToPptAnimation', () => {
    test('should convert fadeIn animation', () => {
      const animData = { name: 'fadeIn', duration: 1000, delay: 0 };
      const result = converter.convertToPptAnimation(animData);
      expect(result.type).toBe('Fade');
      expect(result.category).toBe('entrance');
    });

    test('should convert slideInUp animation', () => {
      const animData = { name: 'slideInUp', duration: 500, delay: 0 };
      const result = converter.convertToPptAnimation(animData);
      expect(result.type).toBe('Fly');
      expect(result.direction).toBe('Up');
    });

    test('should convert zoomIn animation', () => {
      const animData = { name: 'zoomIn', duration: 800, delay: 100 };
      const result = converter.convertToPptAnimation(animData);
      expect(result.type).toBe('Zoom');
      expect(result.subtype).toBe('In');
      expect(result.delay).toBe(0.1);
    });

    test('should default to Fade for unknown animation', () => {
      const animData = { name: 'unknownAnimation', duration: 1000, delay: 0 };
      const result = converter.convertToPptAnimation(animData);
      expect(result.type).toBe('Fade');
    });

    test('should return null for no animation', () => {
      expect(converter.convertToPptAnimation(null)).toBe(null);
      expect(converter.convertToPptAnimation({})).toBe(null);
    });
  });

  describe('inferAnimationFromTransform', () => {
    test('should infer animation from translateY', () => {
      const result = converter.inferAnimationFromTransform('translateY(-50px)');
      expect(result.type).toBe('Fly');
      expect(result.direction).toBe('Up');
    });

    test('should infer animation from translateX', () => {
      const result = converter.inferAnimationFromTransform('translateX(100px)');
      expect(result.type).toBe('Fly');
      expect(result.direction).toBe('Right');
    });

    test('should infer animation from scale', () => {
      const result = converter.inferAnimationFromTransform('scale(1.5)');
      expect(result.type).toBe('Zoom');
    });

    test('should infer animation from rotate', () => {
      const result = converter.inferAnimationFromTransform('rotate(45deg)');
      expect(result.type).toBe('Spin');
    });

    test('should return null for none', () => {
      expect(converter.inferAnimationFromTransform('none')).toBe(null);
      expect(converter.inferAnimationFromTransform('')).toBe(null);
    });
  });

  describe('getSlideTransition', () => {
    test('should return correct slide transitions', () => {
      expect(converter.getSlideTransition('fade')).toBe('fade');
      expect(converter.getSlideTransition('slide-left')).toBe('slide');
      expect(converter.getSlideTransition('zoom-in')).toBe('zoom');
    });

    test('should default to fade', () => {
      expect(converter.getSlideTransition('')).toBe('fade');
      expect(converter.getSlideTransition('unknown')).toBe('fade');
    });
  });

  describe('analyzeAndConvert', () => {
    test('should analyze animation styles', () => {
      const styles = {
        animation: 'fadeIn 1s ease-in'
      };
      const result = converter.analyzeAndConvert(styles);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Fade');
    });

    test('should analyze transition with opacity', () => {
      const styles = {
        transition: 'opacity 0.5s ease'
      };
      const result = converter.analyzeAndConvert(styles);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Fade');
    });

    test('should analyze transition with transform', () => {
      const styles = {
        transition: 'transform 0.5s ease',
        transform: 'translateY(-20px)'
      };
      const result = converter.analyzeAndConvert(styles);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Fly');
    });

    test('should return empty array for no animations', () => {
      expect(converter.analyzeAndConvert({})).toEqual([]);
    });
  });
});
