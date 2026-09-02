Write-Host "🚀 Starting NexaVoice Full-Stack Services..." -ForegroundColor Cyan

# 1. Start FastAPI Backend in background job
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd backend; python -m uvicorn app.main:app --port 8000 --reload"

# 2. Start Next.js Dashboard
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd dashboard; npm run dev"

Write-Host "✅ Backend running on http://localhost:8000 (Docs: http://localhost:8000/docs)" -ForegroundColor Green
Write-Host "✅ Dashboard running on http://localhost:3000" -ForegroundColor Green
