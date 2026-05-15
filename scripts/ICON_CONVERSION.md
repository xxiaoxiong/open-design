# Icon Conversion Guide

The SVG has been updated to 1024×1024 with proper 10% safe area margins. Now you need to convert it to PNG.

## Current Status

✅ **SVG Updated**: `apps/web/public/app-icon.svg` is now 1024×1024 with 10% safe area
❌ **PNG Needs Update**: `tools/pack/resources/mac/icon.png` is still 533×533

## Conversion Options

### Option 1: Using Node.js with sharp (Recommended)

```bash
pnpm add -D sharp
node scripts/convert-icon.mjs
```

### Option 2: Using Browser (Zero Dependencies)

1. Open `scripts/convert-icon.html` in a browser
2. Click "Convert SVG to PNG"
3. Save the downloaded file to `tools/pack/resources/mac/icon.png`

### Option 3: Using ImageMagick (if available)

```bash
convert -background none -resize 1024x1024 apps/web/public/app-icon.svg tools/pack/resources/mac/icon.png
```

### Option 4: Using Inkscape (if available)

```bash
inkscape apps/web/public/app-icon.svg --export-type=png --export-filename=tools/pack/resources/mac/icon.png -w 1024 -h 1024
```

### Option 5: Using Python with cairosvg

```bash
pip install cairosvg
python3 -c "import cairosvg; cairosvg.svg2png(url='apps/web/public/app-icon.svg', write_to='tools/pack/resources/mac/icon.png', output_width=1024, output_height=1024)"
```

### Option 6: Using rsvg-convert

```bash
rsvg-convert -w 1024 -h 1024 apps/web/public/app-icon.svg -o tools/pack/resources/mac/icon.png
```

## Verification

After conversion, verify the PNG is correct:

```bash
file tools/pack/resources/mac/icon.png
# Should show: PNG image data, 1024 x 1024
```

## What Changed

- **Canvas size**: 533×533 → 1024×1024
- **Safe area margin**: ~13px (2.4%) → ~102px (10%)
- **Content scaling**: 1.5385× to fit within safe area
- **Visual result**: Icon now has proper padding for macOS Launchpad and Dock
