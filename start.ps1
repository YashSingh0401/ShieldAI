Write-Host "Starting ShieldAI..." -ForegroundColor Cyan

# Kill any existing processes on the ports
Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*uvicorn*" } | Stop-Process -Force 2>$null
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" } | Stop-Process -Force 2>$null

Start-Sleep 1

# Start backend
$backendJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\ShieldAI\backend"
    uvicorn app.main:app --host 127.0.0.1 --port 8000
}

# Start frontend
$frontendJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\ShieldAI\frontend"
    npm run dev
}

Start-Sleep 3

Write-Host "`nBackend:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "`nPress any key to stop both servers..." -ForegroundColor Yellow

$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Stop-Job $backendJob; Remove-Job $backendJob
Stop-Job $frontendJob; Remove-Job $frontendJob
Write-Host "Servers stopped." -ForegroundColor Cyan
