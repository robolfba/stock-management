import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Utility for basic error logging with daily rotation and cleanup.
 */
class Logger {
    private logsDir: string

    constructor() {
        this.logsDir = path.join(app.getPath('userData'), 'logs')
        console.log(`[Logger] Inicializado. Los logs se guardarán en: ${this.logsDir}`)
        this.ensureLogsDir()
    }

    private ensureLogsDir() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true })
        }
    }

    private getLogPath(): string {
        const now = new Date()
        const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
        return path.join(this.logsDir, `app-${dateStr}.log`)
    }

    /**
     * Appends an error message to the daily log file.
     * Non-blocking using fs.appendFile.
     */
    public error(message: string): void {
        const now = new Date()
        const timestamp = now.toISOString().replace('T', ' ').split('.')[0]
        const logEntry = `${timestamp} - ERROR - ${message}\n`

        console.error(`[Logger] ${message}`)

        fs.appendFile(this.getLogPath(), logEntry, (err) => {
            if (err) {
                console.error('[Logger] Failed to write to log file:', err)
            }
            this.cleanOldLogs()
        })
    }

    /**
     * Keeps only the 5 most recent log files.
     */
    private cleanOldLogs(): void {
        try {
            const files = fs.readdirSync(this.logsDir)
                .filter(f => f.startsWith('app-') && f.endsWith('.log'))
                .sort()

            if (files.length > 5) {
                const toDelete = files.slice(0, files.length - 5)
                toDelete.forEach(file => {
                    const filePath = path.join(this.logsDir, file)
                    fs.unlink(filePath, (err) => {
                        if (err) console.error(`[Logger] Error deleting old log ${file}:`, err)
                    })
                })
            }
        } catch (err) {
            console.error('[Logger] Error during log cleanup:', err)
        }
    }
}

export const logger = new Logger()
