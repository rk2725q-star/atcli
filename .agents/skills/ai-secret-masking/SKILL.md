---
name: ai-secret-masking
description: Strict protocols to prevent sensitive data (API keys, DB passwords, Secrets) from leaking to AI providers during Vibecoding or Agentica tasks.
---

# AI Secret Masking & Protection Protocol

**Tier:** CRITICAL SECURITY
**Category:** Security
**Domain:** Privacy & Data Leak Prevention

---

## Overview

When using AI for coding (Vibecoding), any data sent in the prompt is processed by third-party LLM providers (e.g., OpenAI, Anthropic, DeepSeek). It is **EXTREMELY DANGEROUS** to include actual production secrets, API keys, or database credentials in the chat context, as they could be logged or used for model training.

You MUST follow these strict protocols to ensure the user's sensitive data remains strictly local and is NEVER exposed to you (the AI) during the building process.

## Strict Rules for AI (YOU)

1. **NEVER ASK FOR SECRETS:**
   If a user asks you to build a feature that requires an API key (e.g., Stripe, SendGrid, Firebase), **DO NOT** ask them to provide the key in the chat.
   
2. **USE ENVIRONMENT VARIABLES ONLY:**
   When writing or updating code that needs credentials, you MUST use environment variables (e.g., `process.env.STRIPE_SECRET_KEY` in Node, `os.getenv('OPENAI_API_KEY')` in Python). NEVER hardcode secrets into the source code.

3. **CREATE .env.example (NOT .env):**
   If you are setting up a project, create a `.env.example` file containing placeholder values:
   ```env
   STRIPE_SECRET_KEY=your_stripe_secret_key_here
   DATABASE_URL=postgres://user:pass@localhost:5432/dbname
   ```
   **DO NOT** generate a `.env` file yourself, and **DO NOT** ask the user to paste their `.env` contents to you.
   
4. **TELL THE USER HOW TO SET IT LOCALLY:**
   If you need the code to run for testing, instruct the user to configure their own `.env` file locally, or tell them to run the command with inline environment variables:
   `"Please add your actual API key to your local .env file. Do NOT paste it here."`

5. **MASKING ON READ:**
   If you use the `read_file` or `grep_search` tool and accidentally see raw credentials or API keys in the user's files, you MUST NOT echo those keys back into your chat responses. Mask them (e.g., `sk-live-...XXXX`) in any code snippets or summaries you write.

6. **GIT REPOSITORIES:**
   ALWAYS ensure `.env` and other secret files (e.g., `*.pem`, `service-account.json`) are added to `.gitignore` before committing or pushing code.

## Auto-Trigger Conditions
- You detect words like "API key", "secret", "password", "token", "credentials", "Stripe", "OpenAI" in the user's request.
- You are writing authentication or database connection logic.
- You are reviewing code that contains hardcoded credentials.
