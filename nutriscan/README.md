# 🌿 NutriScan — Ingredient Analyser Chrome Extension

Scan food product pages, analyse ingredients, and get personalised health insights powered by Claude AI.

---

## 📁 File Structure

```
nutriscan/
├── manifest.json      ← Chrome extension config
├── popup.html         ← Extension popup UI
├── popup.css          ← All styles
├── popup.js           ← All logic (no inline handlers)
├── content.js         ← Page scanner (injected into tabs)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🚀 How to Install in Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer Mode** (toggle, top-right)
3. Click **"Load unpacked"**
4. Select the `nutriscan/` folder
5. The 🌿 NutriScan icon will appear in your Chrome toolbar

---

## 🔑 API Key Setup (Free — No Credit Card)

NutriScan uses **Groq + Llama 3.3** — completely free.

**Free limits:** 14,400 requests/day · 30 req/min

1. Go to: https://console.groq.com
2. Sign up (free) → API Keys → **Create API Key**
3. Click the NutriScan icon in Chrome
4. Go to the **Key** tab
5. Paste your key (starts with `gsk_...`) and click **Save API Key**

---

## 👤 Setting Up Your Profile

1. Click the NutriScan icon
2. Go to the **Profile** tab
3. Enter your **Age, Gender, Weight, Height**
4. BMI is calculated automatically
5. Set your **Activity Level** and **Health Goal**
6. Select your **Allergens / Intolerances** (tap to toggle)
7. Add custom allergens if needed
8. Click **Save Profile**

---

## 🔍 How to Use

### Option A — Scan a Page
1. Browse to any food product page (Amazon, supermarket, recipe site)
2. Click the NutriScan icon
3. Click **🔍 Scan This Page**
4. A list of detected products appears — tap one
5. AI analyses the ingredients and shows your report

### Option B — Paste Manually
1. Copy an ingredient list from any source
2. Click NutriScan icon
3. Paste into the text area
4. Click **⚗️ Analyse Ingredients**

---

## 📊 What the Analysis Shows

| Section | What it tells you |
|---|---|
| **Verdict** | Safe / Caution / Avoid — personalised to you |
| **Allergen Alerts** | Flags ingredients matching your allergy profile |
| **Personalised Insight** | Tailored advice based on your BMI, age & goals |
| **Metabolic Impact** | Blood sugar spikes, insulin triggers |
| **Nutritional Gaps** | What you're missing based on your needs |
| **Beneficial Ingredients** | What's good for you in this product |
| **Ingredients of Concern** | What to watch out for |
| **Consumption Advice** | How often / how much is safe for you |

---

## 🛠 Development & VS Code

Open the `nutriscan/` folder directly in VS Code:

```bash
code nutriscan/
```

To test changes:
1. Edit files in VS Code
2. Go to `chrome://extensions/`
3. Click the **↺ refresh** icon on the NutriScan card
4. Click the extension icon to test

---

## ⚠️ Troubleshooting

| Problem | Fix |
|---|---|
| "Couldn't scan this page" | Some pages block content scripts — paste ingredients manually |
| "Invalid API Key" | Check your key in the **Key** tab; it must start with `sk-ant-` |
| Profile not saving | Make sure to click **Save Profile** |
| No products detected | The page may not have structured ingredient lists — use manual paste |
