# Phase 1: Design Token Audit

**Audited:** 2026-06-28

## Spacing Usage (top 30)

| Utility     | Count | Pixel Value |
| ----------- | ----- | ----------- |
| gap-2       | 117   | 8px         |
| px-3        | 77    | 12px        |
| gap-1.5     | 61    | 6px         |
| px-2        | 59    | 8px         |
| py-1.5      | 56    | 6px         |
| gap-1       | 53    | 4px         |
| py-1        | 42    | 4px         |
| py-2        | 38    | 8px         |
| gap-3       | 37    | 12px        |
| p-4         | 36    | 16px        |
| mr-2        | 35    | 8px         |
| space-y-2   | 29    | 8px         |
| p-3         | 28    | 12px        |
| px-1        | 26    | 4px         |
| p-1         | 24    | 4px         |
| px-1.5      | 23    | 6px         |
| mt-1        | 23    | 4px         |
| px-4        | 19    | 16px        |
| space-y-4   | 18    | 16px        |
| py-0.5      | 18    | 2px         |
| p-2         | 18    | 8px         |
| space-y-1.5 | 17    | 6px         |
| py-8        | 15    | 32px        |
| space-y-0.5 | 13    | 2px         |
| mr-1.5      | 13    | 6px         |
| space-y-1   | 12    | 4px         |
| py-4        | 12    | 16px        |
| px-2.5      | 12    | 10px        |
| pr-2        | 12    | 8px         |
| pl-2        | 12    | 8px         |

**Observations:**

- Most usage falls on 4px/8px/12px/16px — standard 4px base scale
- `6px` (1.5) and `2px` (0.5) are used but less frequently
- `10px` (2.5) appears 12 times — minor outlier
- No 20px, 24px, or 48px in top 30 (larger spacing is rare)

## Typography Usage

| Utility         | Count |
| --------------- | ----- |
| text-xs         | 314   |
| text-sm         | 135   |
| font-medium     | 86    |
| tracking-wide   | 21    |
| font-semibold   | 21    |
| text-lg         | 17    |
| font-normal     | 15    |
| text-base       | 14    |
| leading-relaxed | 9     |
| font-bold       | 8     |
| text-2xl        | 7     |
| tracking-tight  | 4     |
| leading-none    | 3     |
| tracking-wider  | 2     |
| leading-snug    | 1     |

**Observations:**

- `text-xs` dominates (314 uses) — app is very compact/dense
- `text-sm` is second (135) — standard body text
- `text-base` is rare (14) — only used for specific emphasis
- `text-lg`/`text-2xl` for headings (17 + 7 = 24 total)
- `font-medium` is the primary weight (86), `font-semibold` for emphasis (21)
- `tracking-wide` used 21 times — likely for uppercase labels/captions

## Shadow Usage

| Utility     | Count |
| ----------- | ----- |
| shadow-sm   | 10    |
| shadow-none | 6     |
| shadow-md   | 4     |
| shadow-lg   | 3     |

**Observations:**

- Very minimal shadow usage — flat design aesthetic
- `shadow-sm` most common (10) — subtle elevation
- Only 23 total shadow utilities across entire app

## Hardcoded Colors

**None found.** All color usage goes through CSS variable system (Shadcn/ui semantic tokens). This is a strong foundation.

## Height/Size Usage (component sizing)

| Utility | Count | Context                    |
| ------- | ----- | -------------------------- |
| h-7     | 55    | Button sm / inputs         |
| h-0     | 40    | Divider lines              |
| h-8     | 16    | Button default             |
| h-6     | 16    | Button xs / small elements |
| h-9     | 8     | Button lg                  |
| h-5     | 7     | Badge                      |
| size-3  | 223   | Icons (small)              |
| size-4  | 86    | Icons (default)            |
| size-5  | 23    | Icons (large)              |
| size-8  | 10    | Icon buttons               |

**Observations:**

- `size-3` dominates icon sizing (223 uses) — very small icons
- Component heights align with `variants.ts` button scale (6/7/8/9)
- `h-0` (40 uses) is for border dividers, not spacing

## Summary

| Category         | Status    | Action Needed                                   |
| ---------------- | --------- | ----------------------------------------------- |
| Color            | ✓ Solid   | Add status colors (success/warning/info)        |
| Radius           | ✓ Solid   | No changes needed                               |
| Spacing          | ⚠ Ad-hoc  | Define 4px base scale tokens (1/2/3/4/6/8/12)   |
| Typography       | ⚠ Ad-hoc  | Define type scale tokens (xs/sm/base/lg/xl/2xl) |
| Shadow           | ⚠ Minimal | Define 3 shadow tokens (sm/md/lg)               |
| Hardcoded colors | ✓ None    | —                                               |
