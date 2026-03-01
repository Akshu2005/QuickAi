LINK: https://quick-ai-ochre-theta.vercel.app/
    

  
✨ Key Features

User Authentication (Clerk): Email/Password, OAuth, profile management, orgs (optional)

Subscription Billing: Premium paywall for AI tools (Stripe or Razorpay – pick one)

Serverless Postgres (Neon): Fast, scalable, branching support

Role/Access Controls: Free vs Premium limits, request metering & quotas

Audit & Usage Logs: Track token usage, credits, requests, and errors

🧠 AI Tools

Article Generator: Title + target length → full article

Blog Title Generator: Keyword + category → catchy title ideas

Image Generator: Prompt → generated images

Background Remover: Upload → transparent PNG

Object Remover: Upload + object description → edited image

Resume Analyzer: Upload resume → actionable analysis

AI providers are pluggable (OpenAI-compatible APIs, Replicate, Stability, etc.). This repo shows clean service adapters so you can swap providers easily.

🏗️ Tech Stack

Frontend: React, Vite, React Router, Axios

Backend: Node.js, Express.js

Database: PostgreSQL (Neon)

Auth: Clerk

Billing: Stripe (default) or Razorpay (India)

ORM (optional but recommended): Prisma

Storage (optional): UploadThing / Cloudinary / S3 for image uploads

Deployment: Vercel (web), Render/Railway/Fly (API), Neon (DB)
