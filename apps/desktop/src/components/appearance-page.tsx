import { ArrowLeft, Check, Palette, Type, Circle, Baseline } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { navigateTo, setDensity, setThemePreset, appStore } from '@/store';
import { useStore } from '@tanstack/react-store';
import {
  THEME_STYLES,
  BASE_COLORS,
  FONT_FAMILIES,
  RADIUS_PRESETS,
  type ThemeStyle,
  type BaseColor,
  type FontFamily,
} from '@/lib/theme-presets';

const BLOCK_OPTION_STYLE = {
  minHeight: '5.5rem',
  padding: '0.75rem',
} satisfies CSSProperties;

const SWATCH_OPTION_STYLE = {
  minHeight: '3.75rem',
  padding: '0.5rem',
} satisfies CSSProperties;

const RADIUS_OPTION_STYLE = {
  minWidth: '4rem',
  padding: '0.5rem',
} satisfies CSSProperties;

export function AppearancePage() {
  const themePreset = useStore(appStore, (state) => state.themePreset);
  const density = useStore(appStore, (state) => state.density);

  const updatePreset = (updates: Partial<typeof themePreset>) => {
    setThemePreset({ ...themePreset, ...updates });
  };

  return (
    <div className="appearance-page flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="appearance-page-header flex items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-xs" onClick={() => navigateTo('workspace')} title="Back to workspace">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold">Appearance</h1>
            <p className="text-xs text-muted-foreground/70">Customize your theme</p>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="size-4 text-muted-foreground" />
              Visual Style
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {THEME_STYLES.map((style) => (
                <Button
                  key={style.value}
                  variant="outline"
                  onClick={() => updatePreset({ style: style.value as ThemeStyle })}
                  aria-pressed={themePreset.style === style.value}
                  data-appearance-option="block"
                  data-selected={themePreset.style === style.value}
                  style={BLOCK_OPTION_STYLE}
                  className="relative h-auto min-h-22 flex-col items-start justify-start gap-1 p-3 text-left whitespace-normal"
                >
                  <span className="text-sm font-medium">{style.label}</span>
                  <span className="text-xs text-muted-foreground">{style.description}</span>
                  {themePreset.style === style.value && <Check className="absolute right-2 top-2 size-3.5" />}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Circle className="size-4 text-muted-foreground" />
              Base Color
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
              {BASE_COLORS.map((color) => (
                <Button
                  key={color.value}
                  variant="outline"
                  onClick={() => updatePreset({ baseColor: color.value as BaseColor })}
                  aria-pressed={themePreset.baseColor === color.value}
                  data-appearance-option="swatch"
                  data-selected={themePreset.baseColor === color.value}
                  style={SWATCH_OPTION_STYLE}
                  className="relative h-auto min-h-15 flex-col items-center justify-center gap-1.5 p-2"
                >
                  <span
                    className="size-7 rounded-full border border-foreground/10"
                    style={{ background: color.swatch }}
                  />
                  <span className="text-xs font-medium">{color.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Type className="size-4 text-muted-foreground" />
              Font Family
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FONT_FAMILIES.map((font) => (
                <Button
                  key={font.value}
                  variant="outline"
                  onClick={() => updatePreset({ fontFamily: font.value as FontFamily })}
                  aria-pressed={themePreset.fontFamily === font.value}
                  data-appearance-option="block"
                  data-selected={themePreset.fontFamily === font.value}
                  style={BLOCK_OPTION_STYLE}
                  className="relative h-auto min-h-22 flex-col items-start justify-start gap-1 p-3 text-left whitespace-normal"
                >
                  <span className="text-sm font-medium" style={{ fontFamily: font.css }}>
                    {font.label}
                  </span>
                  <span className="text-xs text-muted-foreground" style={{ fontFamily: font.css }}>
                    The quick brown fox
                  </span>
                  {themePreset.fontFamily === font.value && <Check className="absolute right-2 top-2 size-3.5" />}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Baseline className="size-4 text-muted-foreground" />
              Corner Radius
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              {RADIUS_PRESETS.map((r) => (
                <Button
                  key={r}
                  variant="ghost"
                  onClick={() => updatePreset({ radius: r })}
                  aria-pressed={themePreset.radius === r}
                  data-appearance-option="radius"
                  data-selected={themePreset.radius === r}
                  style={RADIUS_OPTION_STYLE}
                  className="h-auto min-w-16 flex-col items-center justify-center gap-1.5 p-0"
                >
                  <span className="size-10 border-2 border-current" style={{ borderRadius: `${r}rem` }} />
                  <span className="whitespace-nowrap text-xs font-medium tabular-nums">
                    {r === 0 ? 'Sharp' : `${r}rem`}
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Baseline className="size-4 text-muted-foreground" />
              Density
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(['comfortable', 'compact'] as const).map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  onClick={() => setDensity(d)}
                  aria-pressed={density === d}
                  data-appearance-option="block"
                  data-selected={density === d}
                  style={BLOCK_OPTION_STYLE}
                  className="relative h-auto min-h-20 flex-1 flex-col items-start justify-start gap-1 p-3 text-left whitespace-normal"
                >
                  <span className="text-sm font-medium capitalize">{d}</span>
                  <span className="text-xs text-muted-foreground">
                    {d === 'compact' ? 'Tighter spacing for dense UIs' : 'More breathing room'}
                  </span>
                  {density === d && <Check className="absolute right-2 top-2 size-3.5" />}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="appearance-preview flex flex-col gap-3 border border-border p-4">
              <div className="flex items-center gap-2">
                <Button size="sm">Primary Button</Button>
                <Button variant="outline" size="sm">
                  Outline
                </Button>
                <Button variant="ghost" size="sm">
                  Ghost
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="preview-input">Sample Input</Label>
                <Input id="preview-input" placeholder="Type something..." />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Muted text</span>
                <span className="text-foreground">Foreground text</span>
                <span className="text-primary">Primary text</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
