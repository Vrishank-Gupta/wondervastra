/**
 * Regenerates the logo files from src/components/brand-logo.tsx so they always match the site:
 * src/app/icon.svg, src/app/apple-icon.png and public/brand/*. Run: npx tsx scripts/brand-assets.tsx
 */
import React from "react";
import { readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { BRAND, LogoMark } from "../src/components/brand-logo";

const svg = (el: React.ReactElement, extra = "") => renderToStaticMarkup(el).replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" ${extra}`).replace(' aria-hidden="true"', "");
const compact = svg(<LogoMark />);
const inner = compact.replace(/^<svg[^>]*>|<\/svg>$/g, "");

// Favicon: compact mark on an ivory rounded square.
writeFileSync("src/app/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="36" fill="${BRAND.ivory}"/><g transform="translate(16 18) scale(1.08)"><svg viewBox="22 14 156 136" width="156" height="136">${inner}</svg></g></svg>\n`);
writeFileSync("public/brand/wondervastra-mark.svg", svg(<LogoMark variant="full" />) + "\n");

const font = `@font-face{font-family:Cinzel;font-weight:600;src:url(data:font/woff2;base64,${readFileSync("node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2").toString("base64")})}`;
const lockup = (dark: boolean, word: number, tag: number) => `
  ${svg(<LogoMark variant="full" onDark={dark} />, `style="width:${word * 7.5}px;display:block"`)}
  <div style="font:600 ${word}px/1 Cinzel;letter-spacing:.04em;color:${dark ? BRAND.cream : BRAND.maroon};margin-top:${word * 0.45}px">WONDERVASTRA</div>
  <div style="font:500 ${tag}px/1 system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:${dark ? BRAND.goldLight : BRAND.gold};margin-top:${tag * 1.6}px;padding-left:.32em">Crafted with trust</div>`;
const page = (w: number, h: number, bg: string, body: string) =>
  `<style>${font}html,body{margin:0}body{width:${w}px;height:${h}px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center}</style>${body}`;

(async () => {
  const b = await chromium.launch();
  const shot = async (w: number, h: number, html: string, path: string, transparent = false) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(html); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path, omitBackground: transparent }); await p.close();
  };
  await shot(180, 180, page(180, 180, BRAND.ivory, svg(<LogoMark />, 'style="width:132px"')), "src/app/apple-icon.png");
  await shot(1080, 1080, page(1080, 1080, BRAND.ivory, lockup(false, 84, 24)), "public/brand/wondervastra-avatar-1080.png");
  await shot(1600, 900, page(1600, 900, BRAND.ivory, lockup(false, 96, 26)), "public/brand/wondervastra-logo.png");
  await shot(1600, 900, page(1600, 900, "#2A0E16", lockup(true, 96, 26)), "public/brand/wondervastra-logo-dark.png");
  await b.close();
  console.log("brand assets written");
})();
