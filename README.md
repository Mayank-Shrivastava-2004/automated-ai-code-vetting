# AI Code Reviewer Pro 🚀

A full-stack, microservices-based Real-Time AI Code Review application. This platform enables developers to paste their code and receive instant, streaming architectural feedback, bug detection, and security vulnerability analysis mimicking a human senior engineer.

## ✨ Features
- **Real-Time Streaming**: AI feedback is piped character-by-character to the frontend via WebSockets.
- **Language Auto-Detection**: The Monaco Editor automatically senses the programming language currently being typed.
- **Session History**: Persists code review sessions seamlessly.
- **Microservices Architecture**: The heavy AI processing runs independently via a Python FastAPI service, decoupling the Node.js backend.
- **Resilient AI Mocks**: Operates fully disconnected from LLM APIs if needed via built-in streaming mock generators.

## 🛠️ Tech Stack
- **Frontend**: React (TypeScript), Monaco Editor, Vite
- **Backend (API + WS)**: Node.js (TypeScript), Express, `ws` (WebSockets)
- **AI Engine**: Python, FastAPI, asyncio, OpenAI Async Client
- **Scripting**: PowerShell Automation (`final_start.ps1`)

## 🚀 Quick Start

Run the fully automated PowerShell script to clean ghost processes and boot all 3 systems concurrently in isolated interfaces.

```powershell
# Set execution policy if restricted, then run the launcher:
.\final_start.ps1
```

Once executed:
- **Frontend** runs on `http://localhost:5173`
- **Node Backend** binds to `ws://localhost:3001`
- **Python AI Service** listens on `http://localhost:8001`

### 🔑 Environment Variables
Make sure to configure your `.env` variables before executing AI reviews.
- `ai-service/.env`: Place your real `OPENAI_API_KEY`. Without a valid key, the app gracefully falls back to streaming mocked SQL injection detection.

## 🤝 Overview
Built entirely as a scalable microservice concept to handle heavy LLM latency while maintaining a crisp, non-blocking React User Interface.
