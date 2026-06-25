export type ThemeStyle =
  | 'vega'
  | 'nova'
  | 'maia'
  | 'lyra'
  | 'mira'
  | 'winxp'
  | 'win98'
  | 'dbeaver'
  | 'retro'
  | 'macosx';
export type BaseColor = 'neutral' | 'stone' | 'zinc' | 'mauve' | 'olive' | 'mist' | 'taupe';
export type FontFamily =
  | 'geist'
  | 'inter'
  | 'jetbrains-mono'
  | 'roboto'
  | 'fira-code'
  | 'source-code-pro'
  | 'ibm-plex-sans'
  | 'system';

export interface ThemePreset {
  readonly style: ThemeStyle;
  readonly baseColor: BaseColor;
  readonly fontFamily: FontFamily;
  readonly radius: number;
}

export const THEME_STYLES: readonly { value: ThemeStyle; label: string; description: string }[] = [
  { value: 'vega', label: 'Vega', description: 'The classic shadcn/ui look' },
  { value: 'nova', label: 'Nova', description: 'Reduced padding, compact layouts' },
  { value: 'maia', label: 'Maia', description: 'Soft and rounded, generous spacing' },
  { value: 'lyra', label: 'Lyra', description: 'Boxy and sharp, pairs with mono fonts' },
  { value: 'mira', label: 'Mira', description: 'Compact, made for dense interfaces' },
  { value: 'winxp', label: 'Windows XP', description: 'Blue accents, rounded bevels, friendly' },
  { value: 'win98', label: 'Windows 98', description: 'Flat gray, tiny, no rounded corners' },
  { value: 'dbeaver', label: 'DBeaver', description: 'Clean IDE look, blue accents, Roboto font' },
  { value: 'retro', label: 'Retro Terminal', description: 'Green-on-black vibes, mono, compact' },
  { value: 'macosx', label: 'Mac OS X', description: 'Aqua brushed metal, pinstripes, gel buttons' },
];

export const BASE_COLORS: readonly { value: BaseColor; label: string; swatch: string }[] = [
  { value: 'neutral', label: 'Neutral', swatch: 'oklch(0.6 0 0)' },
  { value: 'stone', label: 'Stone', swatch: 'oklch(0.6 0.03 60)' },
  { value: 'zinc', label: 'Zinc', swatch: 'oklch(0.6 0.02 285)' },
  { value: 'mauve', label: 'Mauve', swatch: 'oklch(0.6 0.04 300)' },
  { value: 'olive', label: 'Olive', swatch: 'oklch(0.6 0.03 120)' },
  { value: 'mist', label: 'Mist', swatch: 'oklch(0.6 0.03 200)' },
  { value: 'taupe', label: 'Taupe', swatch: 'oklch(0.6 0.03 80)' },
];

export const FONT_FAMILIES: readonly { value: FontFamily; label: string; css: string }[] = [
  { value: 'geist', label: 'Geist', css: "'Geist Variable', sans-serif" },
  { value: 'inter', label: 'Inter', css: "'Inter Variable', 'Inter', sans-serif" },
  { value: 'roboto', label: 'Roboto Flex', css: "'Roboto Flex Variable', 'Roboto Flex', sans-serif" },
  { value: 'ibm-plex-sans', label: 'IBM Plex Sans', css: "'IBM Plex Sans Variable', 'IBM Plex Sans', sans-serif" },
  { value: 'jetbrains-mono', label: 'JetBrains Mono', css: "'JetBrains Mono Variable', 'JetBrains Mono', monospace" },
  { value: 'fira-code', label: 'Fira Code', css: "'Fira Code Variable', 'Fira Code', monospace" },
  {
    value: 'source-code-pro',
    label: 'Source Code Pro',
    css: "'Source Code Pro Variable', 'Source Code Pro', monospace",
  },
  { value: 'system', label: 'System', css: 'system-ui, sans-serif' },
];

export const RADIUS_PRESETS = [0, 0.25, 0.5, 0.75, 1, 1.5] as const;

// ─── Base Color Palettes (light mode) ────────────────────────────────

const BASE_COLOR_LIGHT: Record<BaseColor, Record<string, string>> = {
  neutral: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.145 0 0)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.145 0 0)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.145 0 0)',
    '--primary': 'oklch(0.205 0 0)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0 0)',
    '--secondary-foreground': 'oklch(0.205 0 0)',
    '--muted': 'oklch(0.97 0 0)',
    '--muted-foreground': 'oklch(0.556 0 0)',
    '--accent': 'oklch(0.97 0 0)',
    '--accent-foreground': 'oklch(0.205 0 0)',
    '--border': 'oklch(0.922 0 0)',
    '--input': 'oklch(0.922 0 0)',
    '--ring': 'oklch(0.708 0 0)',
  },
  stone: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.18 0.01 60)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.18 0.01 60)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.18 0.01 60)',
    '--primary': 'oklch(0.27 0.01 60)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0.005 60)',
    '--secondary-foreground': 'oklch(0.27 0.01 60)',
    '--muted': 'oklch(0.97 0.005 60)',
    '--muted-foreground': 'oklch(0.55 0.01 60)',
    '--accent': 'oklch(0.97 0.005 60)',
    '--accent-foreground': 'oklch(0.27 0.01 60)',
    '--border': 'oklch(0.92 0.005 60)',
    '--input': 'oklch(0.92 0.005 60)',
    '--ring': 'oklch(0.71 0.01 60)',
  },
  zinc: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.16 0.005 285)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.16 0.005 285)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.16 0.005 285)',
    '--primary': 'oklch(0.21 0.006 285)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0.003 285)',
    '--secondary-foreground': 'oklch(0.21 0.006 285)',
    '--muted': 'oklch(0.97 0.003 285)',
    '--muted-foreground': 'oklch(0.55 0.005 285)',
    '--accent': 'oklch(0.97 0.003 285)',
    '--accent-foreground': 'oklch(0.21 0.006 285)',
    '--border': 'oklch(0.92 0.004 285)',
    '--input': 'oklch(0.92 0.004 285)',
    '--ring': 'oklch(0.71 0.005 285)',
  },
  mauve: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.18 0.015 300)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.18 0.015 300)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.18 0.015 300)',
    '--primary': 'oklch(0.27 0.02 300)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0.008 300)',
    '--secondary-foreground': 'oklch(0.27 0.02 300)',
    '--muted': 'oklch(0.97 0.008 300)',
    '--muted-foreground': 'oklch(0.55 0.012 300)',
    '--accent': 'oklch(0.97 0.008 300)',
    '--accent-foreground': 'oklch(0.27 0.02 300)',
    '--border': 'oklch(0.92 0.006 300)',
    '--input': 'oklch(0.92 0.006 300)',
    '--ring': 'oklch(0.71 0.01 300)',
  },
  olive: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.18 0.015 120)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.18 0.015 120)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.18 0.015 120)',
    '--primary': 'oklch(0.27 0.02 120)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0.008 120)',
    '--secondary-foreground': 'oklch(0.27 0.02 120)',
    '--muted': 'oklch(0.97 0.008 120)',
    '--muted-foreground': 'oklch(0.55 0.012 120)',
    '--accent': 'oklch(0.97 0.008 120)',
    '--accent-foreground': 'oklch(0.27 0.02 120)',
    '--border': 'oklch(0.92 0.006 120)',
    '--input': 'oklch(0.92 0.006 120)',
    '--ring': 'oklch(0.71 0.01 120)',
  },
  mist: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.18 0.012 200)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.18 0.012 200)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.18 0.012 200)',
    '--primary': 'oklch(0.27 0.015 200)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0.006 200)',
    '--secondary-foreground': 'oklch(0.27 0.015 200)',
    '--muted': 'oklch(0.97 0.006 200)',
    '--muted-foreground': 'oklch(0.55 0.01 200)',
    '--accent': 'oklch(0.97 0.006 200)',
    '--accent-foreground': 'oklch(0.27 0.015 200)',
    '--border': 'oklch(0.92 0.005 200)',
    '--input': 'oklch(0.92 0.005 200)',
    '--ring': 'oklch(0.71 0.008 200)',
  },
  taupe: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.18 0.01 80)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.18 0.01 80)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.18 0.01 80)',
    '--primary': 'oklch(0.27 0.012 80)',
    '--primary-foreground': 'oklch(0.985 0 0)',
    '--secondary': 'oklch(0.97 0.005 80)',
    '--secondary-foreground': 'oklch(0.27 0.012 80)',
    '--muted': 'oklch(0.97 0.005 80)',
    '--muted-foreground': 'oklch(0.55 0.008 80)',
    '--accent': 'oklch(0.97 0.005 80)',
    '--accent-foreground': 'oklch(0.27 0.012 80)',
    '--border': 'oklch(0.92 0.004 80)',
    '--input': 'oklch(0.92 0.004 80)',
    '--ring': 'oklch(0.71 0.006 80)',
  },
};

// ─── Base Color Palettes (dark mode) ─────────────────────────────────

const BASE_COLOR_DARK: Record<BaseColor, Record<string, string>> = {
  neutral: {
    '--background': 'oklch(0.145 0 0)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.205 0 0)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.205 0 0)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.922 0 0)',
    '--primary-foreground': 'oklch(0.205 0 0)',
    '--secondary': 'oklch(0.269 0 0)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.269 0 0)',
    '--muted-foreground': 'oklch(0.708 0 0)',
    '--accent': 'oklch(0.269 0 0)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.556 0 0)',
  },
  stone: {
    '--background': 'oklch(0.16 0.005 60)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.21 0.006 60)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.21 0.006 60)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.92 0.005 60)',
    '--primary-foreground': 'oklch(0.21 0.006 60)',
    '--secondary': 'oklch(0.27 0.005 60)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.27 0.005 60)',
    '--muted-foreground': 'oklch(0.71 0.008 60)',
    '--accent': 'oklch(0.27 0.005 60)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.55 0.008 60)',
  },
  zinc: {
    '--background': 'oklch(0.16 0.003 285)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.21 0.004 285)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.21 0.004 285)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.92 0.004 285)',
    '--primary-foreground': 'oklch(0.21 0.004 285)',
    '--secondary': 'oklch(0.27 0.003 285)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.27 0.003 285)',
    '--muted-foreground': 'oklch(0.71 0.005 285)',
    '--accent': 'oklch(0.27 0.003 285)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.55 0.005 285)',
  },
  mauve: {
    '--background': 'oklch(0.16 0.008 300)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.21 0.01 300)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.21 0.01 300)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.92 0.008 300)',
    '--primary-foreground': 'oklch(0.21 0.01 300)',
    '--secondary': 'oklch(0.27 0.008 300)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.27 0.008 300)',
    '--muted-foreground': 'oklch(0.71 0.01 300)',
    '--accent': 'oklch(0.27 0.008 300)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.55 0.01 300)',
  },
  olive: {
    '--background': 'oklch(0.16 0.008 120)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.21 0.01 120)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.21 0.01 120)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.92 0.008 120)',
    '--primary-foreground': 'oklch(0.21 0.01 120)',
    '--secondary': 'oklch(0.27 0.008 120)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.27 0.008 120)',
    '--muted-foreground': 'oklch(0.71 0.01 120)',
    '--accent': 'oklch(0.27 0.008 120)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.55 0.01 120)',
  },
  mist: {
    '--background': 'oklch(0.16 0.006 200)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.21 0.008 200)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.21 0.008 200)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.92 0.006 200)',
    '--primary-foreground': 'oklch(0.21 0.008 200)',
    '--secondary': 'oklch(0.27 0.006 200)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.27 0.006 200)',
    '--muted-foreground': 'oklch(0.71 0.008 200)',
    '--accent': 'oklch(0.27 0.006 200)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.55 0.008 200)',
  },
  taupe: {
    '--background': 'oklch(0.16 0.005 80)',
    '--foreground': 'oklch(0.985 0 0)',
    '--card': 'oklch(0.21 0.006 80)',
    '--card-foreground': 'oklch(0.985 0 0)',
    '--popover': 'oklch(0.21 0.006 80)',
    '--popover-foreground': 'oklch(0.985 0 0)',
    '--primary': 'oklch(0.92 0.005 80)',
    '--primary-foreground': 'oklch(0.21 0.006 80)',
    '--secondary': 'oklch(0.27 0.005 80)',
    '--secondary-foreground': 'oklch(0.985 0 0)',
    '--muted': 'oklch(0.27 0.005 80)',
    '--muted-foreground': 'oklch(0.71 0.006 80)',
    '--accent': 'oklch(0.27 0.005 80)',
    '--accent-foreground': 'oklch(0.985 0 0)',
    '--border': 'oklch(1 0 0 / 10%)',
    '--input': 'oklch(1 0 0 / 15%)',
    '--ring': 'oklch(0.55 0.006 80)',
  },
};

// ─── Style-Specific Color Overrides (retro styles) ───────────────────
// These override the base color palette for retro styles that have
// iconic color schemes (XP blue, Win3.1 gray, terminal green, etc.)

const STYLE_COLORS_LIGHT: Partial<Record<ThemeStyle, Record<string, string>>> = {
  winxp: {
    '--background': '#ECE9D8',
    '--foreground': '#222222',
    '--card': '#FFFFFF',
    '--card-foreground': '#222222',
    '--popover': '#FFFFFF',
    '--popover-foreground': '#222222',
    '--primary': '#0050EE',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#ECE9D8',
    '--secondary-foreground': '#222222',
    '--muted': '#E0DCC8',
    '--muted-foreground': '#5A5A5A',
    '--accent': '#2267CB',
    '--accent-foreground': '#FFFFFF',
    '--border': '#ACA899',
    '--input': '#7F9DB9',
    '--ring': '#003C74',
    '--sidebar': '#0050EE',
    '--sidebar-foreground': '#FFFFFF',
    '--sidebar-primary': '#0997FF',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#2267CB',
    '--sidebar-accent-foreground': '#FFFFFF',
    '--sidebar-border': '#003DD7',
    '--sidebar-ring': '#0997FF',
  },
  win98: {
    '--background': '#C0C0C0',
    '--foreground': '#222222',
    '--card': '#C0C0C0',
    '--card-foreground': '#222222',
    '--popover': '#C0C0C0',
    '--popover-foreground': '#222222',
    '--primary': '#000080',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#DFDFDF',
    '--secondary-foreground': '#222222',
    '--muted': '#A0A0A0',
    '--muted-foreground': '#404040',
    '--accent': '#000080',
    '--accent-foreground': '#FFFFFF',
    '--border': '#808080',
    '--input': '#808080',
    '--ring': '#000080',
    '--sidebar': '#000080',
    '--sidebar-foreground': '#FFFFFF',
    '--sidebar-primary': '#1084D0',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#1084D0',
    '--sidebar-accent-foreground': '#FFFFFF',
    '--sidebar-border': '#0a0a0a',
    '--sidebar-ring': '#1084D0',
  },
  dbeaver: {
    '--background': '#DEDEDE',
    '--foreground': '#353535',
    '--card': '#FFFFFF',
    '--card-foreground': '#353535',
    '--popover': '#FFFFFF',
    '--popover-foreground': '#353535',
    '--primary': '#2A7CB4',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#F2F2F2',
    '--secondary-foreground': '#4D4D4D',
    '--muted': '#CECECE',
    '--muted-foreground': '#6B6B6B',
    '--accent': '#F2F2F2',
    '--accent-foreground': '#4D4D4D',
    '--border': '#D9D9D9',
    '--input': '#D9D9D9',
    '--ring': '#2A7CB4',
    '--sidebar': '#F8F8F8',
    '--sidebar-foreground': '#353535',
    '--sidebar-primary': '#2A7CB4',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#F2F2F2',
    '--sidebar-accent-foreground': '#4D4D4D',
    '--sidebar-border': '#D9D9D9',
    '--sidebar-ring': '#2A7CB4',
  },
  retro: {
    '--background': '#0C0C0C',
    '--foreground': '#33FF33',
    '--card': '#0A0A0A',
    '--card-foreground': '#33FF33',
    '--popover': '#0C0C0C',
    '--popover-foreground': '#33FF33',
    '--primary': '#33FF33',
    '--primary-foreground': '#000000',
    '--secondary': '#1A1A1A',
    '--secondary-foreground': '#33FF33',
    '--muted': '#0B2B0B',
    '--muted-foreground': '#008800',
    '--accent': '#00AA00',
    '--accent-foreground': '#33FF33',
    '--border': '#004400',
    '--input': '#001100',
    '--ring': '#33FF33',
    '--sidebar': '#080808',
    '--sidebar-foreground': '#33FF33',
    '--sidebar-primary': '#33FF33',
    '--sidebar-primary-foreground': '#000000',
    '--sidebar-accent': '#00AA00',
    '--sidebar-accent-foreground': '#33FF33',
    '--sidebar-border': '#004400',
    '--sidebar-ring': '#33FF33',
  },
  macosx: {
    '--background': '#E8E8E8',
    '--foreground': '#4C4C4C',
    '--card': '#FFFFFF',
    '--card-foreground': '#4C4C4C',
    '--popover': '#FFFFFF',
    '--popover-foreground': '#4C4C4C',
    '--primary': '#2563AE',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#D8D8D8',
    '--secondary-foreground': '#4C4C4C',
    '--muted': '#D0D0D0',
    '--muted-foreground': '#6B6B6B',
    '--accent': '#2563AE',
    '--accent-foreground': '#FFFFFF',
    '--border': '#B8B8B8',
    '--input': '#FFFFFF',
    '--ring': '#2563AE',
    '--sidebar': '#E8E8E8',
    '--sidebar-foreground': '#4C4C4C',
    '--sidebar-primary': '#2563AE',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#BBBBBB',
    '--sidebar-accent-foreground': '#4C4C4C',
    '--sidebar-border': '#A0A0A0',
    '--sidebar-ring': '#2563AE',
  },
};

const STYLE_COLORS_DARK: Partial<Record<ThemeStyle, Record<string, string>>> = {
  winxp: {
    '--background': '#2B2A26',
    '--foreground': '#E8E4D8',
    '--card': '#383733',
    '--card-foreground': '#E8E4D8',
    '--popover': '#383733',
    '--popover-foreground': '#E8E4D8',
    '--primary': '#3593FF',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#383733',
    '--secondary-foreground': '#E8E4D8',
    '--muted': '#333230',
    '--muted-foreground': '#9A968A',
    '--accent': '#2267CB',
    '--accent-foreground': '#FFFFFF',
    '--border': '#4A4843',
    '--input': '#5A7A9A',
    '--ring': '#3593FF',
    '--sidebar': '#003DD7',
    '--sidebar-foreground': '#FFFFFF',
    '--sidebar-primary': '#0997FF',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#2267CB',
    '--sidebar-accent-foreground': '#FFFFFF',
    '--sidebar-border': '#0020A0',
    '--sidebar-ring': '#0997FF',
  },
  win98: {
    '--background': '#2A2A2A',
    '--foreground': '#DFDFDF',
    '--card': '#333333',
    '--card-foreground': '#DFDFDF',
    '--popover': '#333333',
    '--popover-foreground': '#DFDFDF',
    '--primary': '#1084D0',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#404040',
    '--secondary-foreground': '#DFDFDF',
    '--muted': '#383838',
    '--muted-foreground': '#808080',
    '--accent': '#000080',
    '--accent-foreground': '#FFFFFF',
    '--border': '#505050',
    '--input': '#505050',
    '--ring': '#1084D0',
    '--sidebar': '#000080',
    '--sidebar-foreground': '#FFFFFF',
    '--sidebar-primary': '#1084D0',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#1084D0',
    '--sidebar-accent-foreground': '#FFFFFF',
    '--sidebar-border': '#0a0a0a',
    '--sidebar-ring': '#1084D0',
  },
  dbeaver: {
    '--background': '#3A3A47',
    '--foreground': '#FFFFFF',
    '--card': '#22222A',
    '--card-foreground': '#FFFFFF',
    '--popover': '#22222A',
    '--popover-foreground': '#FFFFFF',
    '--primary': '#2A7CB4',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#19191F',
    '--secondary-foreground': '#D6D6D6',
    '--muted': '#282833',
    '--muted-foreground': '#CBCBCB',
    '--accent': '#19191F',
    '--accent-foreground': '#FFFFFF',
    '--border': '#585958',
    '--input': '#585958',
    '--ring': '#2A7CB4',
    '--sidebar': '#19191F',
    '--sidebar-foreground': '#FFFFFF',
    '--sidebar-primary': '#2A7CB4',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#2C2C35',
    '--sidebar-accent-foreground': '#FFFFFF',
    '--sidebar-border': '#585958',
    '--sidebar-ring': '#2A7CB4',
  },
  retro: {
    '--background': '#000000',
    '--foreground': '#33FF33',
    '--card': '#080808',
    '--card-foreground': '#33FF33',
    '--popover': '#000000',
    '--popover-foreground': '#33FF33',
    '--primary': '#33FF33',
    '--primary-foreground': '#000000',
    '--secondary': '#1A1A1A',
    '--secondary-foreground': '#33FF33',
    '--muted': '#002200',
    '--muted-foreground': '#006600',
    '--accent': '#00AA00',
    '--accent-foreground': '#33FF33',
    '--border': '#003300',
    '--input': '#001100',
    '--ring': '#33FF33',
    '--sidebar': '#000000',
    '--sidebar-foreground': '#33FF33',
    '--sidebar-primary': '#33FF33',
    '--sidebar-primary-foreground': '#000000',
    '--sidebar-accent': '#00AA00',
    '--sidebar-accent-foreground': '#33FF33',
    '--sidebar-border': '#003300',
    '--sidebar-ring': '#33FF33',
  },
  macosx: {
    '--background': '#3A3A3A',
    '--foreground': '#F0F0F0',
    '--card': '#484848',
    '--card-foreground': '#F0F0F0',
    '--popover': '#484848',
    '--popover-foreground': '#F0F0F0',
    '--primary': '#4A90E2',
    '--primary-foreground': '#FFFFFF',
    '--secondary': '#505050',
    '--secondary-foreground': '#F0F0F0',
    '--muted': '#444444',
    '--muted-foreground': '#AAAAAA',
    '--accent': '#4A90E2',
    '--accent-foreground': '#FFFFFF',
    '--border': '#606060',
    '--input': '#3A3A3A',
    '--ring': '#4A90E2',
    '--sidebar': '#2E2E2E',
    '--sidebar-foreground': '#F0F0F0',
    '--sidebar-primary': '#4A90E2',
    '--sidebar-primary-foreground': '#FFFFFF',
    '--sidebar-accent': '#404040',
    '--sidebar-accent-foreground': '#F0F0F0',
    '--sidebar-border': '#282828',
    '--sidebar-ring': '#4A90E2',
  },
};

// ─── Style Presets (spacing, radius, density) ────────────────────────
// All styles use the same spacing/sizing — only color palettes differ.

const STYLE_VARS = {
  vega: {
    '--spacing': '0.25rem',
    '--radius': '0.625rem',
    '--d-text': '0.875rem',
    '--d-text-sm': '0.75rem',
    '--d-text-xs': '0.6875rem',
    '--d-space-y': '1.25rem',
    '--d-space-y-sm': '0.375rem',
  },
} as const;

const DENSITY_VARS = {
  normal: {
    '--d-control-h': '2.5rem',
    '--d-control-h-sm': '2rem',
    '--d-control-h-xs': '1.75rem',
    '--d-control-h-lg': '2.75rem',
    '--d-control-icon': '2.25rem',
    '--d-control-icon-sm': '2rem',
    '--d-control-icon-xs': '1.75rem',
    '--d-control-icon-lg': '2.5rem',
    '--d-px': '0.75rem',
    '--d-px-sm': '0.75rem',
    '--d-px-xs': '0.5rem',
    '--d-px-lg': '0.875rem',
    '--d-gap': '0.375rem',
    '--d-gap-sm': '0.25rem',
    '--d-gap-lg': '0.375rem',
    '--d-py': '0.25rem',
    '--d-py-sm': '0.25rem',
    '--d-card-p': '1rem',
    '--d-card-gap': '0.5rem',
    '--d-dialog-p': '1.5rem',
    '--d-tabs-h': '2.25rem',
    '--d-tabs-px': '0.75rem',
    '--d-tabs-gap': '0.625rem',
    '--d-svg': '1rem',
    '--d-svg-sm': '0.875rem',
    '--d-svg-xs': '0.75rem',
    '--d-select-py': '0.375rem',
    '--d-select-px': '0.5rem',
    '--d-badge-h': '1.5rem',
    '--d-badge-px': '0.625rem',
  },
  compact: {
    '--spacing': '0.2125rem',
    '--d-control-h': '2rem',
    '--d-control-h-sm': '1.75rem',
    '--d-control-h-xs': '1.5rem',
    '--d-control-h-lg': '2.25rem',
    '--d-control-icon': '2rem',
    '--d-control-icon-sm': '1.75rem',
    '--d-control-icon-xs': '1.5rem',
    '--d-control-icon-lg': '2.25rem',
    '--d-px': '0.625rem',
    '--d-px-sm': '0.5rem',
    '--d-px-xs': '0.5rem',
    '--d-px-lg': '0.625rem',
    '--d-gap': '0.25rem',
    '--d-gap-sm': '0.125rem',
    '--d-gap-lg': '0.25rem',
    '--d-py': '0.125rem',
    '--d-py-sm': '0.125rem',
    '--d-card-p': '0.75rem',
    '--d-card-gap': '0.375rem',
    '--d-dialog-p': '1rem',
    '--d-tabs-h': '2rem',
    '--d-tabs-px': '0.5rem',
    '--d-tabs-gap': '0.375rem',
    '--d-svg': '0.875rem',
    '--d-svg-sm': '0.75rem',
    '--d-svg-xs': '0.625rem',
    '--d-select-py': '0.25rem',
    '--d-select-px': '0.375rem',
    '--d-badge-h': '1.25rem',
    '--d-badge-px': '0.5rem',
  },
} as const;

const FONT_CSS: Record<FontFamily, string> = {
  geist: "'Geist Variable', sans-serif",
  inter: "'Inter Variable', 'Inter', sans-serif",
  roboto: "'Roboto Flex Variable', 'Roboto Flex', sans-serif",
  'ibm-plex-sans': "'IBM Plex Sans Variable', 'IBM Plex Sans', sans-serif",
  'jetbrains-mono': "'JetBrains Mono Variable', 'JetBrains Mono', monospace",
  'fira-code': "'Fira Code Variable', 'Fira Code', monospace",
  'source-code-pro': "'Source Code Pro Variable', 'Source Code Pro', monospace",
  system: 'system-ui, sans-serif',
};

export function applyThemePreset(preset: ThemePreset, isDark: boolean): void {
  const root = document.documentElement;
  const isCompact = root.classList.contains('density-compact');

  // Set data-theme-style for CSS targeting
  root.setAttribute('data-theme-style', preset.style);

  // Apply base color palette
  const colorVars = isDark ? BASE_COLOR_DARK[preset.baseColor] : BASE_COLOR_LIGHT[preset.baseColor];
  for (const [key, value] of Object.entries(colorVars)) {
    root.style.setProperty(key, value);
  }

  // Apply style-specific color overrides (retro/nostalgia styles have iconic color schemes)
  const styleColors = isDark ? STYLE_COLORS_DARK[preset.style] : STYLE_COLORS_LIGHT[preset.style];
  if (styleColors) {
    for (const [key, value] of Object.entries(styleColors)) {
      root.style.setProperty(key, value);
    }
  }

  // Sizing/spacing/control heights are the same across all styles — only colors differ.
  const baseVars = STYLE_VARS.vega;
  for (const [key, value] of Object.entries(baseVars)) {
    if (key === '--spacing') {
      root.style.setProperty('--app-spacing', value);
    } else {
      root.style.setProperty(key, value);
    }
  }

  const defaultDensity = isCompact ? DENSITY_VARS.compact : DENSITY_VARS.normal;
  for (const [key, value] of Object.entries(defaultDensity)) {
    if (key === '--spacing') {
      root.style.setProperty('--app-spacing', value);
    } else {
      root.style.setProperty(key, value);
    }
  }

  // Apply font family
  root.style.setProperty('--app-font-sans', FONT_CSS[preset.fontFamily]);

  // Apply radius — retro themes force radius 0; macosx uses 10px (Cheetah-style)
  if (preset.style === 'macosx') {
    root.style.setProperty('--radius', '0.625rem');
    return;
  }
  const retroStyles: ThemeStyle[] = ['winxp', 'win98', 'retro'];
  if (retroStyles.includes(preset.style)) {
    root.style.setProperty('--radius', '0');
  } else if (preset.radius !== parseFloat(STYLE_VARS.vega['--radius'])) {
    root.style.setProperty('--radius', `${preset.radius}rem`);
  } else {
    root.style.setProperty('--radius', STYLE_VARS.vega['--radius']);
  }
}

export function getDefaultPreset(): ThemePreset {
  return {
    style: 'vega',
    baseColor: 'neutral',
    fontFamily: 'geist',
    radius: 0.625,
  };
}

export function loadThemePreset(): ThemePreset {
  const defaults = getDefaultPreset();
  try {
    const raw = localStorage.getItem('kamehadb_theme_preset');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemePreset>;
      const validStyles = THEME_STYLES.map((s) => s.value);
      return {
        style: parsed.style && validStyles.includes(parsed.style) ? parsed.style : defaults.style,
        baseColor: parsed.baseColor ?? defaults.baseColor,
        fontFamily: parsed.fontFamily ?? defaults.fontFamily,
        radius: parsed.radius ?? defaults.radius,
      };
    }
  } catch {}
  return defaults;
}

export function saveThemePreset(preset: ThemePreset): void {
  localStorage.setItem('kamehadb_theme_preset', JSON.stringify(preset));
}
