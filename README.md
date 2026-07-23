# TabPilot

**AI-Powered Browser Automation Agent**  
*Control the web with natural language — safely in a sandbox tab.*

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
![Chrome Extension](https://img.shields.io/badge/Chrome-4285F4?logo=googlechrome&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)

---

## ✨ Features

- **Natural Language Tasks** — Describe what you want ("Summarize the top AI papers on arXiv" or "Compare prices for mechanical keyboards on Amazon") and let the AI agent handle it.
- **Dedicated Sandbox Tab** — Runs in an isolated background tab. Your main browsing stays untouched.
- **Smart Browser Actions** — Navigate, click, type, scroll, wait, and extract data — all driven by structured AI decisions.
- **Real-time Logging** — Watch every step with visual highlights on the target tab.
- **Interactive Element Awareness** — The agent sees buttons, links, inputs, and more for reliable automation.
- **Built with Blink SDK** — Powered by fast LLM reasoning (Gemini by default).

Perfect for research, shopping, data collection, repetitive tasks, and more.

---

## Demo

*(Add a GIF or short video here — highly recommended)*

---

## Installation & Development

### Prerequisites
- Node.js 18+
- Chrome Browser
- Blink project credentials (`VITE_BLINK_PROJECT_ID` + `VITE_BLINK_SECRET_KEY`)

### Quick Start

1. **Clone the repo**
   ```bash
   git clone https://github.com/mrphatom/tabpilot-.git
   cd tabpilot-
	2	Install dependencies npm install
	3	
	4	Set up environment Create a .env file in the root: VITE_BLINK_PROJECT_ID=your_project_id
	5	VITE_BLINK_SECRET_KEY=your_secret_key
	6	
	7	Build the extension npm run build
	8	
	9	Load in Chrome
	◦	Open chrome://extensions/
	◦	Enable Developer mode
	◦	Click Load unpacked → select the dist folder

How It Works

	1	Open the TabPilot popup.
	2	Enter a task in plain English.
	3	The extension creates a hidden sandbox tab.
	4	The AI agent (via Blink) observes the page and decides actions step-by-step.
	5	Results and extracted data appear in the popup.

## Project Structure

tabpilot-/
├── src/
│   ├── App.tsx          # Popup UI + logging
│   ├── background.ts    # Agent loop + Chrome APIs
│   └── content.ts       # Sandbox tab actions + element detection
├── public/
│   ├── manifest.json
│   └── icons/
├── scripts/             # Icon generation
├── vite.config.ts
└── tailwind.config.js

## Roadmap

	•	Add support for multiple models (Claude, GPT, local Ollama via Blink)
	•	Persistent sessions / history
	•	Better error recovery & retry logic
	•	Screenshots in logs
	•	Export extracted data (JSON/CSV)
	•	Chrome Web Store listing

## Tech Stack

	•	Frontend: React 19 + TypeScript + Tailwind CSS
	•	Build: Vite
	•	AI: @blinkdotnew/sdk
	•	Browser: Chrome Extension (MV3)

Contributing

Pull requests 

Welcome! Feel free to open issues for bugs, feature ideas, or model improvements.
License
MIT © mrphatom

Made with ❤️ and a bit too many open tabs.