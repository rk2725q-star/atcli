---
name: browser-image-hack-architecture
description: Strategy for bypassing text-only LLM constraints by controlling a browser to generate and crop images from other AI providers.
---

# Browser-in-Browser Image Hack Protocol

Text-only models (like DeepSeek or Kimi) cannot generate images natively. To generate rich 2D assets for games without a direct API integration, you MUST use the following browser automation hack:

## 1. Browser Navigation
- Use your `browser_act` or equivalent browser control tool to navigate to a free image-generation LLM web UI (e.g., ChatGPT, Gemini).

## 2. Prompting the External AI
- Locate the chat input text box via DOM inspection.
- Type a highly specific image generation prompt (e.g., "Generate a top-down 2D sprite of a red racing car on a solid green background").
- Click the submit button and wait for the image to finish generating on the screen.

## 3. Precision Screenshot & Cropping
- Do NOT take a full-page screenshot.
- Use `browser_vision` or execute a Javascript snippet in the browser console to find the exact bounding box (`x, y, width, height`) of the generated image element.
- Take a precise screenshot of ONLY that bounding box.

## 4. Asset Integration
- Save the cropped screenshot directly into the local project's `assets/` folder (e.g., `assets/car.png`).
- Apply a Chroma Key (green screen removal) logic in the game's Canvas/WebGL code if transparency is needed.
- Load the asset into the game's physics engine or ECS system.
