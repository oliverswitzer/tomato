import { tomatoTheme, tomatoColors, tomatoFonts } from '../tomatoTheme';

// Trivial sanity test so the mobile test harness exists and the
// theme values stay pinned to what's documented as mirroring
// src/renderer/index.css @theme (see tomatoTheme.ts header comment).
describe('tomatoTheme', () => {
  it('mirrors the Electron @theme hex tokens', () => {
    expect(tomatoColors).toEqual({
      text: '#2A2A2A',
      muted: '#8B8477',
      subtle: '#BAA898',
      border: '#EFE8DD',
      cream: '#FBF7F1',
      accent: '#E2574C',
      accentDark: '#D04A3F',
    });
  });

  it('names the Newsreader serif and Geist Mono font families', () => {
    expect(tomatoFonts.serif).toBe('Newsreader');
    expect(tomatoFonts.mono).toBe('Geist Mono');
  });

  it('exposes a combined theme object', () => {
    expect(tomatoTheme.colors).toBe(tomatoColors);
    expect(tomatoTheme.fonts).toBe(tomatoFonts);
  });
});
