import { ArrowLeft, Check, Palette, Type, Circle, Baseline } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

export function AppearancePage() {
  const themePreset = useStore(appStore, (state) => state.themePreset);
  const density = useStore(appStore, (state) => state.density);

  const updatePreset = (updates: Partial<typeof themePreset>) => {
    setThemePreset({ ...themePreset, ...updates });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Top header bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-background via-background to-muted/10 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => navigateTo('workspace')}
            title="Back to workspace"
            className="rounded-lg text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Appearance</h1>
            <p className="text-xs text-muted-foreground/70">Customize your theme</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Visual Style */}
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
                <button
                  key={style.value}
                  type="button"
                  onClick={() => updatePreset({ style: style.value as ThemeStyle })}
                  className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${
                    themePreset.style === style.value ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  }`}
                >
                  <span className="text-sm font-medium">{style.label}</span>
                  <span className="text-xs text-muted-foreground">{style.description}</span>
                  {themePreset.style === style.value && (
                    <Check className="absolute right-2 top-2 size-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Base Color */}
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
                <button
                  key={color.value}
                  type="button"
                  onClick={() => updatePreset({ baseColor: color.value as BaseColor })}
                  className={`relative flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all hover:bg-muted/50 ${
                    themePreset.baseColor === color.value ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  }`}
                >
                  <span
                    className="size-7 rounded-full border border-foreground/10"
                    style={{ background: color.swatch }}
                  />
                  <span className="text-xs font-medium">{color.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Font Family */}
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
                <button
                  key={font.value}
                  type="button"
                  onClick={() => updatePreset({ fontFamily: font.value as FontFamily })}
                  className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${
                    themePreset.fontFamily === font.value ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  }`}
                >
                  <span className="text-sm font-medium" style={{ fontFamily: font.css }}>
                    {font.label}
                  </span>
                  <span className="text-xs text-muted-foreground" style={{ fontFamily: font.css }}>
                    The quick brown fox
                  </span>
                  {themePreset.fontFamily === font.value && (
                    <Check className="absolute right-2 top-2 size-3.5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Radius */}
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
                <button
                  key={r}
                  type="button"
                  onClick={() => updatePreset({ radius: r })}
                  className={`flex min-w-16 flex-col items-center gap-1.5 transition-all ${
                    themePreset.radius === r ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="size-10 border-2 border-current" style={{ borderRadius: `${r}rem` }} />
                  <span className="whitespace-nowrap text-xs font-medium tabular-nums">
                    {r === 0 ? 'Sharp' : `${r}rem`}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Density */}
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
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${
                    density === d ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  }`}
                >
                  <span className="text-sm font-medium capitalize">{d}</span>
                  <span className="text-xs text-muted-foreground">
                    {d === 'compact' ? 'Tighter spacing for dense UIs' : 'More breathing room'}
                  </span>
                  {density === d && <Check className="absolute right-2 top-2 size-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Live preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
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
                <input
                  id="preview-input"
                  className="h-[var(--d-control-h)] w-full rounded-lg border border-input bg-transparent px-[var(--d-px)] text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="Type something..."
                />
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
