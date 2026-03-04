// scripts/dev.js
// Cross-platform dev launcher: compiles main, starts Vite, waits for it, then launches Electron.
const { spawn } = require('node:child_process')
const http = require('node:http')

const VITE_PORT = 5173
const VITE_URL = `http://localhost:${VITE_PORT}`

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: 'inherit', shell: true })
        proc.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`"${cmd} ${args.join(' ')}" salió con código ${code}`))
        })
    })
}

function spawnBg(cmd, args, customEnv) {
    const env = customEnv || process.env;
    return spawn(cmd, args, {
        stdio: 'inherit',
        shell: true,
        env,
    })
}

function waitForVite(timeout = 30000) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeout
        function attempt() {
            const req = http.get(VITE_URL, () => resolve())
            req.on('error', () => {
                if (Date.now() > deadline) return reject(new Error(`Timeout esperando Vite en ${VITE_URL}`))
                setTimeout(attempt, 400)
            })
            req.end()
        }
        attempt()
    })
}

async function main() {
    console.log('\n[dev] 1/3 Compilando main process...')
    await run('npx', ['tsc', '-p', 'tsconfig.main.json'])

    console.log('[dev] 2/3 Iniciando Vite dev server...')
    const vite = spawnBg('npx', ['vite'])

    console.log(`[dev] 3/3 Esperando Vite en ${VITE_URL}...`)
    await waitForVite()

    console.log('[dev] Lanzando Electron...\n')
    const env = { ...process.env, NODE_ENV: 'development' }
    delete env.ELECTRON_RUN_AS_NODE
    const electron = spawnBg('npx', ['electron', '.'], env)

    electron.on('close', () => {
        vite.kill()
        process.exit(0)
    })

    process.on('SIGINT', () => {
        vite.kill()
        electron.kill()
        process.exit(0)
    })
}

main().catch((err) => {
    console.error('[dev] Error:', err.message)
    process.exit(1)
})
