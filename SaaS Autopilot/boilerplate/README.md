# 🤖 Standalone YouTube Script Generation Pipeline

Welcome! This is the official code blueprint and boilerplate script featured on the **AI Operator** YouTube channel (Episode 1). 

This standalone project demonstrates how to programmatically call the **Anthropic Claude 3.5 Sonnet API** to generate structured, scene-by-scene video scripts in clean JSON format.

---

## 🚀 Quick Start in 60 Seconds

### 1. Prerequisites
Make sure you have **Node.js** (v18 or higher) installed on your machine. You can download it from [nodejs.org](https://nodejs.org/).

### 2. Installation
Clone this folder and navigate into it, then install the required packages:
```bash
npm install
```

*(Note: Since this boilerplate relies on standard Node.js libraries, no heavy external packages are required!)*

### 3. Configure your API Credentials
Get an API Key from your [Anthropic Console](https://console.anthropic.com/).

Set the environment variable in your terminal:

**On Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="your_actual_anthropic_api_key_here"
```

**On Mac / Linux (Terminal):**
```bash
export ANTHROPIC_API_KEY="your_actual_anthropic_api_key_here"
```

---

## 🎬 How to Run the Pipeline

Execute the runner script to trigger the automated copywriting pipeline:
```bash
npm start
```

### 📦 Output
The script will contact Claude, run the highly optimized B2B copywriting system prompt, and write the final compiled scene-by-scene script to:
👉 **`generated_script.json`**

---

## 🛠️ How it Works under the Hood

1. **System Prompt Blueprint:** The `script_pipeline.js` code contains a highly engineered system prompt that enforces strict storytelling pacing, word count limits, and dynamic hook requirements.
2. **Modular Scene Parsing:** The code requests a strictly formatted JSON blueprint from Claude, ensuring that the script can be fed directly into automated text-to-speech (TTS) or video editing engines.
3. **Robust Local Call:** Built using Node's native `https` module to maximize speed, minimize dependency overhead, and ensure cross-platform compatibility.

---

*Subscribe to **AI Operator** on YouTube for more proof-based, zero-hype automation walkthroughs!*
