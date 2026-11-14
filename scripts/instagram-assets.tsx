/**
 * Instagram kit: profile picture, story-highlight covers and launch posts, drawn from the site's own logo,
 * colours and fonts so the profile matches wondervastra.in. Output: marketing/instagram/.
 * Run: npx tsx scripts/instagram-assets.tsx
 *
 * Posts only state what the store really offers today. If offers, delivery area or COD change, edit POSTS and re-run.
 */
import React from "react";
import { mkdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { BadgeCheck, Baby, MessageCircle, Ruler, Shirt, Sparkles, Star, Tag, Truck } from "lucide-react";
import { BRAND, LogoMark } from "../src/components/brand-logo";

const OUT = "marketing/instagram";
mkdirSync(`${OUT}/highlights`, { recursive: true });
mkdirSync(`${OUT}/posts`, { recursive: true });

const WINE = "#2A0E16";
const svg = (el: React.ReactElement, style = "") => renderToStaticMarkup(el).replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" style="${style}" `).replace(' aria-hidden="true"', "");
const b64 = (p: string) => readFileSync(p).toString("base64");
const fonts = `
@font-face{font-family:Cinzel;font-weight:600;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2")})}
@font-face{font-family:Archivo;font-weight:100 900;font-stretch:62% 125%;src:url(data:font/woff2;base64,${b64("node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2")})}`;
const base = `${fonts}*{box-sizing:border-box}html,body{margin:0}body{font-family:Archivo,system-ui,sans-serif}
.d{font-family:Archivo;font-weight:800;font-stretch:75%;text-transform:uppercase;line-height:.95;letter-spacing:-.005em;margin:0}
.eyebrow{font-weight:700;letter-spacing:.22em;text-transform:uppercase}
.word{font-family:Cinzel;font-weight:600;letter-spacing:.04em}`;

const wordmark = (dark: boolean, size: number) => `<div style="display:flex;align-items:center;gap:${size * 0.45}px">
  ${svg(<LogoMark onDark={dark} />, `width:${size * 1.5}px;height:auto`)}
  <span class="word" style="font-size:${size}px;color:${dark ? BRAND.cream : BRAND.maroon}">WONDERVASTRA</span></div>`;

type Post = { file: string; dark: boolean; eyebrow: string; title: string; body: string; foot?: string };
const POSTS: Post[] = [
  {
    file: "01-now-open", dark: true, eyebrow: "Now open", title: "Original thermals.<br>Lowest prices.",
    body: `<p style="font-size:44px;line-height:1.35;margin:0">Warm layers for babies, boys, girls and men, from brands you already trust. 100% original.</p>`,
    foot: "Shop at wondervastra.in",
  },
  {
    file: "02-delhi-ncr", dark: false, eyebrow: "Delivering now", title: "Across<br>Delhi NCR",
    body: `<ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;font-size:46px;font-weight:600">
      ${["Delhi", "Gurugram", "Noida", "Greater Noida", "Ghaziabad", "Faridabad"].map((t) => `<li style="display:flex;align-items:center;gap:16px"><span style="width:16px;height:16px;border-radius:50%;background:${BRAND.gold}"></span>${t}</li>`).join("")}</ul>`,
    foot: "Check your pincode on any product page",
  },
  {
    file: "03-buy-more-save-more", dark: true, eyebrow: "Buy more, save more", title: "The bigger<br>the cart…",
    body: `<div style="display:grid;gap:22px">
      <div style="border:3px dashed ${BRAND.goldLight};padding:30px 36px;display:flex;align-items:baseline;gap:24px"><span class="d" style="font-size:96px;color:${BRAND.goldLight}">Free</span><span style="font-size:40px">delivery above ₹799</span></div>
      <div style="border:3px dashed ${BRAND.goldLight};padding:30px 36px;display:flex;align-items:baseline;gap:24px"><span class="d" style="font-size:96px;color:${BRAND.goldLight}">10%</span><span style="font-size:40px">off above ₹1,999</span></div></div>`,
    foot: "Applied automatically in your cart",
  },
  {
    file: "04-size-by-height", dark: false, eyebrow: "Kids' sizes made easy", title: "Pick by age<br>or by height",
    body: `<table style="border-collapse:collapse;font-size:38px;width:100%">
      <tr style="text-align:left;color:${BRAND.gold};font-size:26px;letter-spacing:.18em;text-transform:uppercase"><th style="padding-bottom:12px">Size</th><th style="padding-bottom:12px">Child's height</th></tr>
      ${[["2–4 Y", "88–104 cm"], ["4–6 Y", "104–116 cm"], ["6–8 Y", "116–128 cm"], ["8–10 Y", "128–140 cm"], ["10–12 Y", "140–152 cm"]].map(([a, h]) => `<tr style="border-top:2px solid #e7dccb"><td style="padding:12px 0;font-weight:700">${a}</td><td>${h}</td></tr>`).join("")}</table>`,
    foot: "Typical heights. Every product page shows its own chart",
  },
  {
    file: "05-pay-your-way", dark: true, eyebrow: "Easy to order", title: "Pay when<br>it arrives",
    body: `<ul style="list-style:none;padding:0;margin:0;display:grid;gap:22px;font-size:44px">
      ${["Cash on delivery available", "7-day returns on eligible items", "Track your order with one link", "No account needed to order"].map((t) => `<li style="display:flex;gap:20px;align-items:center"><span style="color:${BRAND.goldLight};font-size:40px">✓</span>${t}</li>`).join("")}</ul>`,
    foot: "wondervastra.in",
  },
  {
    file: "06-whatsapp-group", dark: false, eyebrow: "Be the first to know", title: "Join our<br>WhatsApp group",
    body: `<p style="font-size:44px;line-height:1.35;margin:0">New stock, restocks and members-only deals, before anyone else. No spam.</p>`,
    foot: "Link in bio",
  },
];

const post = (p: Post) => {
  const fg = p.dark ? BRAND.cream : BRAND.ink, accent = p.dark ? BRAND.goldLight : BRAND.gold;
  return `<style>${base}</style><div style="width:1080px;height:1350px;background:${p.dark ? WINE : BRAND.ivory};color:${fg};padding:96px 90px 80px;display:flex;flex-direction:column;justify-content:space-between">
    ${wordmark(p.dark, 34)}
    <div style="display:grid;gap:44px">
      <p class="eyebrow" style="margin:0;font-size:28px;color:${accent}">${p.eyebrow}</p>
      <h1 class="d" style="font-size:136px;color:${p.dark ? "#fff" : BRAND.maroon}">${p.title}</h1>
      ${p.body}
    </div>
    <p style="margin:0;font-size:32px;font-weight:600;border-top:2px solid ${p.dark ? "rgba(243,231,211,.25)" : "#e7dccb"};padding-top:28px;color:${p.dark ? BRAND.cream : BRAND.maroon}">${p.foot ?? ""}</p>
  </div>`;
};

// Highlight covers: Instagram crops to a circle from the middle of a 9:16 story, so the icon sits dead centre.
const HIGHLIGHTS: [string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>][] = [
  ["new-in", Sparkles], ["kids", Baby], ["men", Shirt], ["offers", Tag], ["delivery", Truck], ["size-guide", Ruler], ["reviews", Star], ["original", BadgeCheck], ["help", MessageCircle],
];
const highlight = (Icon: (typeof HIGHLIGHTS)[number][1]) => `<style>${base}</style><div style="width:1080px;height:1920px;background:${BRAND.maroon};display:grid;place-items:center">
  <div style="width:900px;height:900px;border-radius:50%;border:14px solid ${BRAND.goldLight};display:grid;place-items:center">${svg(<Icon size={520} color={BRAND.cream} strokeWidth={1.6} />)}</div></div>`;

const profile = (dark: boolean) => `<style>${base}</style><div style="width:1080px;height:1080px;background:${dark ? WINE : BRAND.ivory};display:grid;place-items:center">
  ${svg(<LogoMark onDark={dark} />, "width:700px;height:auto;margin-top:-20px")}</div>`;

(async () => {
  const b = await chromium.launch();
  const shot = async (w: number, h: number, html: string, path: string) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(html); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path }); await p.close();
  };
  await shot(1080, 1080, profile(false), `${OUT}/profile-picture.png`);
  await shot(1080, 1080, profile(true), `${OUT}/profile-picture-dark.png`);
  for (const [name, Icon] of HIGHLIGHTS) await shot(1080, 1920, highlight(Icon), `${OUT}/highlights/${name}.png`);
  for (const p of POSTS) await shot(1080, 1350, post(p), `${OUT}/posts/${p.file}.png`);
  await b.close();
  console.log(`Instagram kit written to ${OUT}/`);
})();
